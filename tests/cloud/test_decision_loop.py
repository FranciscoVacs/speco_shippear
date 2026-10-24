"""Spec 027 · the decision loop in the cloud: the app lists a company's real features, opens a review, and a person decides it.
Real API, real schema; the reviews are stored with the worker's own `store`."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "cloud"))

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud import decisions, worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.db import service_tx  # noqa: E402

JWT_SECRET = "j" * 40
OWNER, APPROVER, VIEWER, OUTSIDER = ("50000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3, 4))
WIRES = ROOT / "examples" / "wire-transfers"
SPEC = "specs/006-wire-transfer-limits/spec.md"


def wire_files() -> dict[str, str]:
    return {p.relative_to(WIRES).as_posix(): p.read_text(encoding="utf-8") for p in (WIRES / "specs").rglob("*.md")}


def token(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


def hashes(sources: dict[str, str]) -> dict[str, str]:
    return decisions.file_hashes(sources)


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', '{n}@example.com');" for u, n in ((OWNER, "owner"), (APPROVER, "ana"), (VIEWER, "vic"), (OUTSIDER, "out"))))
    org = pg.rows("select public.create_organization('Bank Co', 'bank-co');", OWNER)[0]
    other = pg.rows("select public.create_organization('Other Co', 'other-co');", OUTSIDER)[0]
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{APPROVER}', 'approver'), ('{org}', '{VIEWER}', 'viewer');", "service")
    conn = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '7101', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name, status) values ('{org}', '{conn}', '901', 'acme/bank', 'active') returning id;", "service")[0]
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, state_secret="s" * 32, app_url="https://app.test")
    with service_tx(settings) as c:
        out = worker.store(c, org, repo, "sha-main", worker.review_files(wire_files()))
    assert out["features"] == 1
    return type("Env", (), {"pg": pg, "client": TestClient(create_app(settings)), "settings": settings, "org": org, "other": other, "repo": repo})


def features(env, user=OWNER, org=None):
    return env.client.get(f"/api/orgs/{org or env.org}/features", headers=token(user))


def test_the_app_lists_the_features_the_company_reads(env):
    r = features(env)
    assert r.status_code == 200
    [f] = r.json()
    assert f["feature"] == "006-wire-transfer-limits" and f["repo"] == "acme/bank" and f["verdict"] == "needs_decision"
    assert f["summary"]["blocker"] == 2


def test_another_company_sees_nothing_of_it(env):
    assert features(env, OUTSIDER).status_code == 404                       # not a member looks nonexistent
    assert features(env, OUTSIDER, env.other).json() == []


def test_a_repository_the_company_stopped_reading_is_not_listed(env):
    env.pg.psql(f"update public.repositories set status = 'removed' where id = '{env.repo}';", "service")
    assert features(env).json() == []
    env.pg.psql(f"update public.repositories set status = 'active' where id = '{env.repo}';", "service")


def test_a_review_comes_with_the_files_it_was_made_from(env):
    fid = features(env).json()[0]["id"]
    r = env.client.get(f"/api/orgs/{env.org}/features/{fid}/review", headers=token(VIEWER))
    assert r.status_code == 200
    body = r.json()
    assert body["report"]["decision"]["verdict"] == "needs_decision" and body["sources"]["spec.md"] == wire_files()[SPEC]
    assert env.client.get(f"/api/orgs/{env.org}/features/not-a-uuid/review", headers=token(OWNER)).status_code == 404
    assert env.client.get(f"/api/orgs/{env.org}/features/{fid}/review", headers=token(OUTSIDER)).status_code == 404


def decide(env, user, **over):
    fid = features(env).json()[0]["id"]
    review = env.client.get(f"/api/orgs/{env.org}/features/{fid}/review", headers=token(user)).json()
    body = {"feature": fid, "files": hashes(review["sources"]), "decision": "approved", "reason": "", "conditions": [], "override": False, **over}
    return env.client.post(f"/api/orgs/{env.org}/approvals", json=body, headers=token(user))


def test_a_viewer_cannot_decide_and_nothing_is_recorded(env):
    assert decide(env, VIEWER).status_code == 403
    assert env.client.get(f"/api/orgs/{env.org}/approvals", headers=token(VIEWER)).json()["history"] == []


def test_the_viewer_is_told_not_to_offer_the_buttons(env):
    me = env.client.get(f"/api/orgs/{env.org}/approvals", headers=token(VIEWER)).json()
    assert me["can_approve"] is False and me["me"]["role"] == "viewer"
    assert env.client.get(f"/api/orgs/{env.org}/approvals", headers=token(APPROVER)).json()["can_approve"] is True


def test_approving_a_feature_with_blockers_needs_an_override_and_a_reason(env):
    r = decide(env, APPROVER)
    assert r.status_code == 409 and r.json()["code"] == "blocked"
    assert decide(env, APPROVER, override=True).status_code == 422
    assert decide(env, APPROVER, override=True, reason="Compliance accepted the risk").status_code == 201


def test_the_decision_is_in_the_log_with_who_and_which_version(env):
    h = env.client.get(f"/api/orgs/{env.org}/approvals", headers=token(OWNER)).json()["history"]
    [e] = h
    assert e["decision"] == "approved" and e["override"] is True and e["by"]["name"] == "ana@example.com" and e["by"]["role"] == "approver"
    assert e["files"]["spec.md"] and e["open"]["blockers"] == 2 and e["verdict"] == "needs_decision"
    fid = features(env).json()[0]["id"]
    assert env.client.get(f"/api/orgs/{env.org}/approvals?feature={fid}", headers=token(OWNER)).json()["history"][0]["id"] == e["id"]


def test_a_spec_that_moved_since_the_person_looked_is_not_approved(env):
    r = decide(env, OWNER, files={"spec.md": "0" * 64}, reason="x", override=True)
    assert r.status_code == 409 and r.json()["code"] == "stale"


def test_a_rejection_needs_a_reason_and_a_delegation_needs_someone_who_can_approve(env):
    assert decide(env, OWNER, decision="rejected").status_code == 422
    assert decide(env, OWNER, decision="rejected", reason="Not now").status_code == 201
    assert decide(env, OWNER, decision="delegated", reason="Ana knows", delegate_to=VIEWER).status_code == 422
    assert decide(env, OWNER, decision="delegated", reason="Ana knows", delegate_to=OWNER).status_code == 422
    assert decide(env, OWNER, decision="delegated", reason="Ana knows", delegate_to=APPROVER).status_code == 201


def test_the_chain_verifies_and_the_log_cannot_be_edited(env):
    v = env.client.get(f"/api/orgs/{env.org}/approvals/verify", headers=token(OWNER)).json()
    assert v["ok"] is True and v["count"] == 3
    assert "permission denied" in env.pg.fails("update public.approvals set reason = 'x';", "service")


def test_an_agent_token_cannot_decide(env):
    fid = features(env).json()[0]["id"]
    sources = env.client.get(f"/api/orgs/{env.org}/features/{fid}/review", headers=token(OWNER)).json()["sources"]
    h = decisions.version_hash(hashes(sources))
    err = env.pg.fails(f"select public.decide_feature('{fid}', '{h}', 'approved');", OWNER, client_id="agent-1")
    assert "agents cannot decide" in err
    assert "row-level security" in env.pg.fails(
        f"insert into public.approvals (org_id, feature_id, snapshot_id, decision, by_user) select org_id, feature_id, id, 'approved', '{OWNER}' from public.spec_snapshots limit 1;", OWNER, client_id="agent-1")


def test_a_version_first_seen_on_a_pull_request_becomes_a_branch_version_once_merged(env):
    moved = {**wire_files(), SPEC: wire_files()[SPEC].replace("above 10,000 USD", "above 15,000 USD")}
    with service_tx(env.settings) as c:
        a = worker.store(c, env.org, env.repo, "sha-pr", worker.review_files(moved), source="pr")
    assert a["snapshots"] == 1
    assert len(features(env).json()) == 1 and features(env).json()[0]["snapshot_id"] and decisions_source(env, "sha-pr") == "pr"
    fid = features(env).json()[0]["id"]
    # the listing still shows the branch version; the PR version is opened by name
    assert "10,000 USD" in env.client.get(f"/api/orgs/{env.org}/features/{fid}/review", headers=token(OWNER)).json()["sources"]["spec.md"]
    snap = env.pg.rows("select id from public.spec_snapshots where source = 'pr';", "service")[0]
    pr = env.client.get(f"/api/orgs/{env.org}/features/{fid}~{snap}/review", headers=token(OWNER)).json()
    assert pr["source"] == "pr" and "15,000 USD" in pr["sources"]["spec.md"]
    with service_tx(env.settings) as c:
        merged = worker.store(c, env.org, env.repo, "sha-merge", worker.review_files(moved))
    assert merged["snapshots"] == 0 and decisions_source(env, "sha-merge") == "branch"
    assert "15,000 USD" in env.client.get(f"/api/orgs/{env.org}/features/{fid}/review", headers=token(OWNER)).json()["sources"]["spec.md"]


def decisions_source(env, sha: str) -> str:
    return env.pg.rows(f"select source from public.spec_snapshots where commit_sha = '{sha}';", "service")[0]
