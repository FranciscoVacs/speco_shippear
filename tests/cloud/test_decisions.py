"""Spec 014 part 2 · decisions, baseline and drift, through the real API, schema and worker. A repository changes between commits (fake GitHub)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

import httpx  # noqa: E402
import jwt  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud import worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402
from speco_cloud.portrait.candidates import snippet_hash, statement_key  # noqa: E402

JWT_SECRET = "j" * 40
OWNER, APPROVER, VIEWER, OUTSIDER = ("40000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3, 4))
SPEC = """# Feature Specification: Invitations

**Status**: Implemented

## Requirements

- **FR-001**: When a member is invited, the system MUST email the invitee within 60 seconds
- **FR-002**: The system MUST allow only owners and admins to invite members
- **FR-003**: The system MUST refund the full amount if an annual plan is cancelled within 14 days
"""
PATH = "specs/001-inv/spec.md"


def token(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


class FakeRepo:
    def __init__(self):
        self.commits = {"c1": {PATH: SPEC}}

    def __call__(self, req: httpx.Request) -> httpx.Response:
        path = req.url.path
        if path.endswith("/access_tokens"):
            return httpx.Response(201, json={"token": "t"})
        if "/git/trees/" in path:
            files = self.commits[path.rsplit("/", 1)[1]]
            return httpx.Response(200, json={"tree": [{"path": p, "type": "blob", "size": len(t)} for p, t in files.items()]})
        if "/contents/" in path:
            files = self.commits[req.url.params["ref"]]
            rel = path.split("/contents/", 1)[1]
            return httpx.Response(200, text=files[rel]) if rel in files else httpx.Response(404)
        return httpx.Response(404)


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'u{i}@example.com');" for i, u in enumerate((OWNER, APPROVER, VIEWER, OUTSIDER), 1)))
    org = pg.rows("select public.create_organization('Decide Co', 'decide-co');", OWNER)[0]
    pg.rows("select public.create_organization('Outside Co', 'outside-co');", OUTSIDER)
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{APPROVER}', 'approver'), ('{org}', '{VIEWER}', 'viewer');", OWNER)
    inst = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '7600', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '951', 'acme/shop') returning id;", "service")[0]
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", github_app_id="42", github_private_key=pem, supabase_jwt_secret=JWT_SECRET, state_secret="s" * 32)
    fake = FakeRepo()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    client = TestClient(create_app(settings, gh))
    e = type("Env", (), {"pg": pg, "client": client, "settings": settings, "gh": gh, "fake": fake, "org": org, "repo": repo, "n": 0})
    run_portrait(e, "c1")
    return e


def run_job(env, kind: str, sha: str):
    env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, payload) values ('{env.org}', '{env.repo}', '{kind}', '{{\"sha\": \"{sha}\"}}');", "service")
    return worker.run_once(env.settings, env.gh)


def run_portrait(env, sha):
    return run_job(env, "portrait", sha)


def sync(env, sha):
    return run_job(env, "sync_repo", sha)


def rules(env, status="proposed") -> dict[str, dict]:
    r = env.client.get(f"/api/orgs/{env.org}/rules", params={"status": status}, headers=token(OWNER))
    assert r.status_code == 200
    return {x["code"]: x for x in r.json()}


def decide(env, code, user, action, **kw):
    rid = env.pg.rows(f"select id from public.business_rules where org_id = '{env.org}' and code = '{code}';")[0]
    return env.client.post(f"/api/rules/{rid}/decision", json={"action": action, **kw}, headers=token(user))


# ------------------------------------------------------------------ the queue
def test_the_queue_lists_proposals_with_their_evidence_high_risk_first(env):
    # verifies 014/FR-006
    q = rules(env)
    assert list(q) == ["BR-002", "BR-003", "BR-001"]                                   # permissions and money (high) before notifications (low)
    assert q["BR-002"]["evidence"][0] == {"path": PATH, "start_line": 8, "end_line": 8, "excerpt": SPEC.splitlines()[7].strip()}
    assert all(x["status"] == "proposed" and x["decided_by"] is None for x in q.values())


def test_people_of_other_companies_get_nothing(env):
    assert env.client.get(f"/api/orgs/{env.org}/rules", headers=token(OUTSIDER)).status_code == 404
    assert env.client.get(f"/api/orgs/{env.org}/inventory", headers=token(OUTSIDER)).status_code == 404
    assert decide(env, "BR-001", OUTSIDER, "confirm").status_code == 404


def test_the_inventory_is_readable_by_members(env):
    [inv] = env.client.get(f"/api/orgs/{env.org}/inventory", headers=token(VIEWER)).json()
    assert inv["full_name"] == "acme/shop" and inv["counts"]["specs"] == 1


# ------------------------------------------------------------------ deciding
def test_viewers_cannot_decide(env):
    assert decide(env, "BR-001", VIEWER, "confirm").status_code == 403
    assert rules(env)["BR-001"]["status"] == "proposed"


def test_an_approver_confirms_and_it_is_recorded(env):
    r = decide(env, "BR-002", APPROVER, "confirm")
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert env.pg.rows(f"select action, by_user = '{APPROVER}', previous_statement = new_statement from public.rule_decisions where org_id = '{env.org}';") == ["confirm|t|t"]
    assert "BR-002" in rules(env, "confirmed") and "BR-002" not in rules(env)


def test_rejecting_needs_a_reason_and_corrections_change_the_statement(env):
    assert decide(env, "BR-001", APPROVER, "reject").status_code == 422
    assert decide(env, "BR-001", APPROVER, "correct", statement="  ").status_code == 422
    assert decide(env, "BR-001", APPROVER, "explode").status_code == 422
    r = decide(env, "BR-001", APPROVER, "correct", statement="Invitees get an email within one minute", note="clearer")
    assert r.json()["status"] == "confirmed" and r.json()["statement"] == "Invitees get an email within one minute"
    assert env.pg.rows("select statement_key from public.business_rules where code = 'BR-001';") == [statement_key("Invitees get an email within one minute")]
    assert env.pg.rows("select previous_statement from public.rule_decisions where action = 'correct';")[0].startswith("When a member is invited")
    assert decide(env, "BR-003", OWNER, "reject", note="we do not refund annual plans anymore").json()["status"] == "rejected"


def test_a_corrected_rule_cannot_collide_with_another(env):
    env.pg.psql(f"insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha) values ('{env.org}', '{env.repo}', 'Seats are capped per plan', '{statement_key('Seats are capped per plan')}', 'limits', 'medium', 'code', 'medium', 'x', 'c1');", "service")
    assert decide(env, "BR-004", APPROVER, "correct", statement="Invitees get an email within one minute").status_code == 409


def test_decisions_cannot_be_rewritten(env):
    assert "permission denied" in env.pg.fails("update public.rule_decisions set note = 'x';", APPROVER)
    assert "permission denied" in env.pg.fails("delete from public.rule_decisions;", "service")
    assert "append-only" in env.pg.fails("update public.rule_decisions set note = 'x';")
    assert "append-only" in env.pg.fails("truncate public.rule_decisions;")


# ------------------------------------------------------------------ baseline
def test_only_deciders_can_freeze_and_only_confirmed_rules_enter(env):
    # verifies 014/FR-009
    assert env.client.post(f"/api/orgs/{env.org}/baselines", json={"name": "v1"}, headers=token(VIEWER)).status_code == 403
    r = env.client.post(f"/api/orgs/{env.org}/baselines", json={"name": "v1", "note": "first"}, headers=token(APPROVER))
    assert r.status_code == 201 and r.json()["rules_count"] == 2                        # BR-001 (corrected) and BR-002; BR-003 rejected, BR-004 proposed
    snap = env.client.get(f"/api/baselines/{r.json()['id']}", headers=token(VIEWER)).json()
    assert [x["code"] for x in snap["rules"]] == ["BR-001", "BR-002"]
    assert snap["rules"][1]["evidence"] == [{"path": PATH, "start_line": 8, "end_line": 8, "snippet_hash": snippet_hash(SPEC, 8, 8)}]


def test_a_baseline_cannot_be_changed_and_its_hash_follows_its_content(env):
    # verifies 014/FR-009, SC-002
    first = env.client.get(f"/api/orgs/{env.org}/baselines", headers=token(OWNER)).json()[0]
    again = env.client.post(f"/api/orgs/{env.org}/baselines", json={"name": "same set"}, headers=token(OWNER)).json()
    assert again["hash"] == first["hash"]                                               # same confirmed rules, same hash
    assert decide(env, "BR-004", APPROVER, "confirm").status_code == 200
    third = env.client.post(f"/api/orgs/{env.org}/baselines", json={"name": "v2"}, headers=token(OWNER)).json()
    assert third["hash"] != first["hash"] and third["rules_count"] == 3
    assert "permission denied" in env.pg.fails("update public.baselines set name = 'x';", OWNER)
    assert "append-only" in env.pg.fails("update public.baselines set name = 'x';")
    assert "append-only" in env.pg.fails("delete from public.baselines;")


def test_nothing_to_freeze_is_refused(env):
    other = env.pg.rows("select id from public.organizations where slug = 'outside-co';")[0]
    r = env.client.post(f"/api/orgs/{other}/baselines", json={"name": "empty"}, headers=token(OUTSIDER))
    assert r.status_code == 422


# ------------------------------------------------------------------ drift
def open_findings(env):
    return env.client.get(f"/api/orgs/{env.org}/drift", headers=token(VIEWER)).json()


def test_an_unchanged_commit_opens_nothing(env):
    env.fake.commits["c2"] = {PATH: SPEC}
    assert sync(env, "c2")["drift"] == 0 and open_findings(env) == []


def test_lines_that_only_moved_are_followed_not_flagged(env):
    env.fake.commits["c3"] = {PATH: SPEC.replace("## Requirements\n", "## Requirements\n\nSome new intro text.\n")}
    assert sync(env, "c3")["drift"] == 0
    assert env.pg.rows("select start_line from public.rule_evidence e join public.business_rules r on r.id = e.rule_id where r.code = 'BR-002';") == ["10"]
    assert env.pg.rows(f"select snippet_hash from public.rule_evidence e join public.business_rules r on r.id = e.rule_id where r.code = 'BR-002';") == [snippet_hash(env.fake.commits["c3"][PATH], 10, 10)]


def test_changing_the_supporting_lines_of_a_confirmed_rule_opens_a_finding_once(env):
    # verifies 014/FR-010, SC-003
    changed = env.fake.commits["c3"][PATH].replace("only owners and admins", "any member")
    env.fake.commits["c4"], env.fake.commits["c5"] = {PATH: changed}, {PATH: changed.replace("any member", "anyone at all")}
    assert sync(env, "c4")["drift"] == 1
    [f] = open_findings(env)
    assert f["code"] == "BR-002" and f["kind"] == "evidence_changed" and f["commit_sha"] == "c4"
    assert sync(env, "c5")["drift"] == 0                                                 # still waiting for a person: no pile of findings
    assert len(open_findings(env)) == 1


def test_only_deciders_acknowledge_and_they_must_say_why(env):
    # verifies 014/FR-011
    [f] = open_findings(env)
    assert env.client.post(f"/api/drift/{f['id']}/acknowledge", json={"note": "fine"}, headers=token(VIEWER)).status_code == 403
    assert env.client.post(f"/api/drift/{f['id']}/acknowledge", json={"note": " "}, headers=token(APPROVER)).status_code == 422
    assert env.client.post(f"/api/drift/{f['id']}/acknowledge", json={"note": "Owners decided to open invites to all members"}, headers=token(APPROVER)).status_code == 200
    assert open_findings(env) == []
    assert env.pg.rows(f"select status, acknowledged_by = '{APPROVER}' from public.drift_findings where id = '{f['id']}';") == ["acknowledged|t"]


def test_after_acknowledging_only_further_changes_open_new_findings(env):
    same = env.fake.commits["c5"][PATH]
    env.fake.commits["c6"], env.fake.commits["c7"] = {PATH: same}, {PATH: same.replace("anyone at all", "nobody")}
    assert sync(env, "c6")["drift"] == 0
    assert sync(env, "c7")["drift"] == 1


def test_removing_the_file_opens_a_finding(env):
    # verifies 014/FR-010
    env.fake.commits["c8"] = {"specs/other/spec.md": "# x\n"}
    assert sync(env, "c8")["drift"] >= 1
    kinds = {f["kind"] for f in open_findings(env)}
    assert "evidence_removed" in kinds


def test_rules_that_nobody_confirmed_never_raise_drift(env):
    codes = {f["code"] for f in open_findings(env)}
    assert codes <= {"BR-001", "BR-002", "BR-004"} and "BR-003" not in codes                 # BR-003 was rejected


# ------------------------------------------------------------------ consent and requests
def test_only_owners_and_admins_set_consent_and_deciders_ask_for_a_portrait(env):
    assert env.client.post(f"/api/repos/{env.repo}/consent", json={"on": True}, headers=token(APPROVER)).status_code == 403
    assert env.client.post(f"/api/repos/{env.repo}/consent", json={"on": True}, headers=token(OWNER)).status_code == 200
    assert env.pg.rows(f"select code_consent_by = '{OWNER}' from public.repositories where id = '{env.repo}';") == ["t"]
    assert env.client.post(f"/api/repos/{env.repo}/consent", json={"on": False}, headers=token(OWNER)).status_code == 200
    assert env.client.post(f"/api/repos/{env.repo}/portrait", headers=token(VIEWER)).status_code == 403
    assert env.client.post(f"/api/repos/{env.repo}/portrait", headers=token(OUTSIDER)).status_code == 404
    assert env.client.post(f"/api/repos/{env.repo}/portrait", headers=token(APPROVER)).status_code == 202
    assert env.pg.rows(f"select count(*) from public.jobs where repo_id = '{env.repo}' and kind = 'portrait' and status = 'pending';") == ["1"]
