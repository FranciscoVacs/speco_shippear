"""Spec 027 · the bridge: a pull request that changes a spec links to the decision in the app and carries a check that a person's decision resolves.
Real API and schema; GitHub is a fake that also serves comments and check runs."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "cloud"))

import httpx  # noqa: E402
import jwt  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud import decisions, pr_review, worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.db import service_tx  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402

JWT_SECRET = "j" * 40
OWNER, APPROVER, OUTSIDER = ("60000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3))
WIRES = ROOT / "examples" / "wire-transfers"
SPEC = "specs/006-wire-transfer-limits/spec.md"
INSTALLATION = 7201


def wire_files() -> dict[str, str]:
    return {p.relative_to(WIRES).as_posix(): p.read_text(encoding="utf-8") for p in (WIRES / "specs").rglob("*.md")}


def token(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


class FakeGitHub:
    """Three commits of the wire transfer spec, the comments of PR 7 and the check runs of the repository."""

    def __init__(self):
        base = wire_files()
        self.commits = {"base": base}
        for sha, limit in (("head", "15,000"), ("head2", "20,000")):
            self.commits[sha] = {**base, SPEC: base[SPEC].replace("When a wire is above 10,000 USD", f"When a wire is above {limit} USD")}
        self.comments: dict[int, dict] = {}
        self.checks: dict[int, dict] = {}
        self.deny_checks = False

    def __call__(self, req: httpx.Request) -> httpx.Response:
        path, method = req.url.path, req.method
        if path.endswith("/access_tokens"):
            return httpx.Response(201, json={"token": "ghs_x"})
        if "/git/trees/" in path:
            files = self.commits[path.rsplit("/", 1)[1]]
            return httpx.Response(200, json={"tree": [{"path": p, "type": "blob", "size": len(t), "sha": hashlib.sha1(t.encode()).hexdigest()} for p, t in files.items()]})
        if "/contents/" in path:
            return httpx.Response(200, text=self.commits[req.url.params["ref"]][path.split("/contents/", 1)[1]])
        if path.endswith("/issues/7/comments") and method == "GET":
            return httpx.Response(200, json=list(self.comments.values()))
        if path.endswith("/issues/7/comments") and method == "POST":
            cid = 100 + len(self.comments)
            self.comments[cid] = {"id": cid, "body": json.loads(req.content)["body"], "performed_via_github_app": {"id": 42}}
            return httpx.Response(201, json=self.comments[cid])
        if "/issues/comments/" in path and method == "PATCH":
            cid = int(path.rsplit("/", 1)[1])
            self.comments[cid]["body"] = json.loads(req.content)["body"]
            return httpx.Response(200, json=self.comments[cid])
        if path.endswith("/check-runs") and method == "POST":
            if self.deny_checks:
                return httpx.Response(403, json={"message": "Resource not accessible by integration"})
            cid = 500 + len(self.checks)
            self.checks[cid] = {"id": cid, **json.loads(req.content)}
            return httpx.Response(201, json={"id": cid})
        if "/check-runs/" in path and method == "PATCH":
            cid = int(path.rsplit("/", 1)[1])
            self.checks[cid].update(json.loads(req.content))
            return httpx.Response(200, json={"id": cid})
        return httpx.Response(404)


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', '{n}@example.com');" for u, n in ((OWNER, "owner"), (APPROVER, "ana"), (OUTSIDER, "out"))))
    org = pg.rows("select public.create_organization('Bridge Bank', 'bridge-bank');", OWNER)[0]
    pg.rows("select public.create_organization('Elsewhere', 'elsewhere');", OUTSIDER)
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{APPROVER}', 'approver');", "service")
    conn = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '{INSTALLATION}', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name, status) values ('{org}', '{conn}', '911', 'acme/bank', 'active') returning id;", "service")[0]
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", github_app_id="42", github_app_slug="speco-e2e", github_private_key=pem,
                        supabase_jwt_secret=JWT_SECRET, state_secret="s" * 32, app_url="https://app.test")
    fake = FakeGitHub()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    with service_tx(settings) as c:
        worker.store(c, org, repo, "base", worker.review_files(wire_files()))
    return type("Env", (), {"pg": pg, "fake": fake, "gh": gh, "settings": settings, "org": org, "repo": repo, "client": TestClient(create_app(settings, gh))})


CTA = "**¿Lo querés en tus repositorios?** [Instalá Speco](https://example.test/install)"


def review(env, head="head", installation=INSTALLATION, full_name="acme/bank"):
    return pr_review.review_pull_request(env.gh, installation, full_name, 7, "base", head, cta=CTA, settings=env.settings)


def comment(env) -> str:
    [c] = env.fake.comments.values()
    return c["body"]


def latest_check(env) -> dict:
    return env.fake.checks[max(env.fake.checks)]


def pr_ref(env) -> str:
    return re.search(r"/reviews/([0-9a-f-]{36}~[0-9a-f-]{36})\?org=" + env.org, comment(env)).group(1)


def decide(env, user, ref, decision="approved", **over):
    sources = env.client.get(f"/api/orgs/{env.org}/features/{ref}/review", headers=token(user)).json()["sources"]
    body = {"feature": ref, "files": decisions.file_hashes(sources), "decision": decision, "reason": "", "conditions": [], "override": True, **over}
    return env.client.post(f"/api/orgs/{env.org}/approvals", json=body, headers=token(user))


def test_a_pull_request_of_a_company_links_to_the_decision_and_carries_a_pending_check(env):
    out = review(env)
    assert out["outcome"] == "commented" and out["decision"] == "pending"
    body = comment(env)
    assert re.search(r"\[Decidir en Speco →\]\(https://app\.test/reviews/[0-9a-f-]{36}~[0-9a-f-]{36}\?org=" + env.org + r"\)", body)
    assert "Espera una decisión" in body and "Instalá Speco" not in body              # the company already has it: no pitch to install
    check = latest_check(env)
    assert check["name"] == "Speco · decisión" and check["conclusion"] == "action_required" and check["head_sha"] == "head" and check["status"] == "completed"
    assert "app.test/reviews/" in check["details_url"]


def test_the_version_a_pull_request_proposes_is_not_listed_as_a_feature_version_of_the_branch(env):
    listed = env.client.get(f"/api/orgs/{env.org}/features", headers=token(OWNER)).json()
    assert len(listed) == 1 and "10,000 USD" in env.client.get(f"/api/orgs/{env.org}/features/{listed[0]['id']}/review", headers=token(OWNER)).json()["sources"]["spec.md"]
    pr = env.client.get(f"/api/orgs/{env.org}/features/{pr_ref(env)}/review", headers=token(APPROVER)).json()
    assert pr["source"] == "pr" and "15,000 USD" in pr["sources"]["spec.md"]


def test_reviewing_again_edits_the_same_comment_and_the_same_check(env):
    review(env)
    assert len(env.fake.comments) == 1 and len(env.fake.checks) == 1
    assert env.pg.rows(f"select count(*) from public.pull_reviews where org_id = '{env.org}';", "service") == ["1"]


def test_deciding_in_the_app_resolves_the_check_and_the_comment_without_naming_anyone(env):
    r = decide(env, APPROVER, pr_ref(env), reason="Compliance accepted the new threshold")
    assert r.status_code == 201
    check = latest_check(env)
    assert check["conclusion"] == "success" and check["output"]["title"] == "Decidido en Speco"
    assert "Decidido en Speco" in comment(env) and "Espera una decisión" not in comment(env).split("<!-- /speco:status -->")[0]
    for text in (comment(env), json.dumps(check)):
        assert "ana@example.com" not in text and "Compliance accepted" not in text           # the pull request may be public


def test_a_rejection_fails_the_check(env):
    assert decide(env, APPROVER, pr_ref(env), "rejected", reason="Not before the audit").status_code == 201
    assert latest_check(env)["conclusion"] == "failure" and "Rechazado en Speco" in comment(env)
    assert decide(env, OWNER, pr_ref(env), "approved", reason="Audit done").status_code == 201
    assert latest_check(env)["conclusion"] == "success"


def test_a_new_push_is_a_new_version_nobody_decided(env):
    out = review(env, "head2")
    assert out["decision"] == "pending"
    assert len(env.fake.checks) == 2 and latest_check(env)["head_sha"] == "head2" and latest_check(env)["conclusion"] == "action_required"
    assert "Decidido en Speco" not in comment(env)
    assert "20,000 USD" in env.client.get(f"/api/orgs/{env.org}/features/{pr_ref(env)}/review", headers=token(OWNER)).json()["sources"]["spec.md"]


def test_a_decision_on_a_version_that_is_no_longer_the_head_does_not_touch_the_pull_request(env):
    old = env.pg.rows("select f.id || '~' || s.id from public.spec_snapshots s join public.features f on f.id = s.feature_id where s.commit_sha = 'head';", "service")[0]
    before = dict(latest_check(env))
    assert decide(env, APPROVER, old, reason="late").status_code == 201
    assert latest_check(env) == before and latest_check(env)["conclusion"] == "action_required"


def test_a_repository_the_company_does_not_read_gets_the_comment_and_no_check(env):
    env.fake.comments.clear()
    n = len(env.fake.checks)
    out = review(env, installation=999, full_name="acme/elsewhere")
    assert out["outcome"] == "commented" and "decision" not in out
    assert "Instalá Speco" in comment(env) and "Decidir en Speco" not in comment(env) and len(env.fake.checks) == n


def test_without_the_permission_for_checks_the_comment_still_arrives(env):
    env.fake.comments.clear()
    env.fake.deny_checks = True
    out = review(env, "head")
    env.fake.deny_checks = False
    assert out["outcome"] == "commented" and "Decidir en Speco" in comment(env)


def test_a_merged_version_becomes_a_version_of_the_branch(env):
    with service_tx(env.settings) as c:
        worker.store(c, env.org, env.repo, "merge-sha", worker.review_files(env.fake.commits["head"]))
    listed = env.client.get(f"/api/orgs/{env.org}/features", headers=token(OWNER)).json()
    assert "15,000 USD" in env.client.get(f"/api/orgs/{env.org}/features/{listed[0]['id']}/review", headers=token(OWNER)).json()["sources"]["spec.md"]


# ------------------------------------------------------------------ spec 031: a pull request that only moves a decided number in the code
def test_a_pull_request_that_moves_a_decided_number_waits_for_a_person(env):
    # verifies 031/FR-005, 031/SC-002
    toml = '[values]\n"006/FR-004" = { file = "app/limits.py", match = "TIER1_DAILY_LIMIT = (\\\\d+)" }\n'
    base = wire_files()
    env.fake.commits["vbase"] = {**base, "specreview.toml": toml, "app/limits.py": "TIER1_DAILY_LIMIT = 10000\n"}
    env.fake.commits["vhead"] = {**base, "specreview.toml": toml, "app/limits.py": "TIER1_DAILY_LIMIT = 25000\n"}
    out = pr_review.review_pull_request(env.gh, INSTALLATION, "acme/bank", 7, "vbase", "vhead", cta=CTA, settings=env.settings)
    assert out["outcome"] == "commented" and out["moved_values"] == 1 and out["decision"] == "pending"
    check = latest_check(env)
    assert check["head_sha"] == "vhead" and check["conclusion"] == "action_required"
    assert "mueve un número que decidió producto" in comment(env) and "Decidir en Speco →" in comment(env)


def test_the_version_shows_the_moved_numbers_and_a_decision_resolves_it(env):
    # verifies 031/FR-006
    pr = env.client.get(f"/api/orgs/{env.org}/features/{pr_ref(env)}/review", headers=token(APPROVER)).json()
    moved = pr["sources"]["values.md"]
    assert "006-wire-transfer-limits/FR-004" in moved and "**25000**" in moved and "`app/limits.py:1`" in moved
    assert decide(env, APPROVER, pr_ref(env), reason="Raise accepted").status_code == 201
    assert latest_check(env)["conclusion"] == "success"
