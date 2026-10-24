"""Spec 013 part 2 · the service: GitHub webhooks, the install round trip, the people-facing API.
Runs the real FastAPI app against the real schema (see cluster_fixture.py); GitHub is a fake HTTP transport."""
from __future__ import annotations

import hashlib
import hmac
import json
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

from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402
from speco_cloud.state import StateError, make_state, read_state  # noqa: E402

SECRET, JWT_SECRET = "whsec", "j" * 40
U1, U2, U3 = ("10000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3))     # U1 owns org 1, U2 owns org 2, U3 is a viewer in org 1


def token(user: str, exp: int = 3600, secret: str = JWT_SECRET) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + exp}, secret, algorithm="HS256")}


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class FakeGitHub:
    """Answers the three calls the service makes. `repos` is what the installation can see."""

    def __init__(self):
        self.repos = [{"id": 501, "full_name": "acme/app", "default_branch": "main"}, {"id": 502, "full_name": "acme/web", "default_branch": "main"}]
        self.calls: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.calls.append(f"{req.method} {req.url.path}")
        if req.url.path.endswith("/access_tokens"):
            return httpx.Response(201, json={"token": "ghs_x"})
        if req.url.path == "/installation/repositories":
            return httpx.Response(200, json={"total_count": len(self.repos), "repositories": self.repos})
        if req.headers.get("authorization") == "Bearer gho_bad":
            return httpx.Response(401, json={"message": "Bad credentials"})
        if req.url.path == "/user":
            return httpx.Response(200, json={"id": 77, "login": "ana"})
        if req.url.path == "/user/installations":
            return httpx.Response(200, json={"total_count": 2, "installations": [
                {"id": 9100, "account": {"login": "ana", "id": 77, "type": "User"}},
                {"id": 9200, "account": {"login": "acme", "id": 88, "type": "Organization"}}]})
        if req.url.path == "/user/installations/9100/repositories":
            return httpx.Response(200, json={"total_count": 2, "repositories": self.repos[:1]})
        if req.url.path.startswith("/app/installations/"):
            return httpx.Response(200, json={"id": int(req.url.path.rsplit("/", 1)[1]), "account": {"login": "acme", "type": "Organization"}, "repository_selection": "selected"})
        return httpx.Response(404)


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'u{i}@example.com');" for i, u in enumerate((U1, U2, U3), 1)))
    pg.psql("".join(f"insert into auth.identities (user_id, provider, provider_id) values ('{u}', 'github', '{70 * 10 + i}');" for i, u in enumerate((U1, U2, U3), 1)))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret=SECRET, github_app_id="42", github_app_slug="speco-app",
                        github_private_key=pem, supabase_jwt_secret=JWT_SECRET, state_secret="s" * 32, app_url="https://app.test")
    fake = FakeGitHub()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    client = TestClient(create_app(settings, gh), follow_redirects=False)
    org1 = client.post("/api/orgs", json={"name": "One", "slug": "one"}, headers=token(U1)).json()["id"]
    org2 = client.post("/api/orgs", json={"name": "Two", "slug": "two"}, headers=token(U2)).json()["id"]
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org1}', '{U3}', 'viewer');", U1)
    return type("Env", (), {"pg": pg, "client": client, "fake": fake, "settings": settings, "org1": org1, "org2": org2, "gh": gh})


def deliver(env, event: str, payload: dict, delivery: str, secret: str = SECRET):
    body = json.dumps(payload).encode()
    return env.client.post("/webhooks/github", content=body, headers={"X-Hub-Signature-256": sign(body, secret), "X-GitHub-Event": event, "X-GitHub-Delivery": delivery, "Content-Type": "application/json"})


GH = {U1: 701, U2: 702, U3: 703}                       # the GitHub account each person signed in with


def link(env, org: str, user: str, installation_id: int):
    # GitHub says who installed it: the installation webhook arrives with that person as `sender`
    deliver(env, "installation", {"action": "created", "installation": {"id": installation_id}, "sender": {"id": GH[user]}}, f"inst-{installation_id}-{user}-{time.time()}")
    url = env.client.post("/api/github/install-url", json={"org_id": org}, headers=token(user)).json()["url"]
    state = url.split("state=")[1]
    return env.client.get(f"/github/setup?installation_id={installation_id}&state={state}")


# ------------------------------------------------------------------ sign-in
def test_the_api_needs_a_valid_supabase_token(env):
    # verifies 013/FR-016
    assert env.client.get("/api/orgs").status_code == 401
    assert env.client.get("/api/orgs", headers=token(U1, secret="x" * 40)).status_code == 401
    assert env.client.get("/api/orgs", headers=token(U1, exp=-10)).status_code == 401
    assert env.client.get("/api/orgs", headers=token(U1)).status_code == 200


def test_people_list_only_their_own_organizations(env):
    # verifies 013/FR-002
    assert [o["slug"] for o in env.client.get("/api/orgs", headers=token(U1)).json()] == ["one"]
    assert [o["slug"] for o in env.client.get("/api/orgs", headers=token(U2)).json()] == ["two"]


def test_creating_an_organization_validates_the_slug(env):
    assert env.client.post("/api/orgs", json={"name": "X", "slug": "Bad Slug!"}, headers=token(U1)).status_code == 422
    assert env.client.post("/api/orgs", json={"name": "X", "slug": "one"}, headers=token(U1)).status_code == 422


# ------------------------------------------------------------------ install round trip
def test_state_is_signed_and_expires():
    s = make_state("k" * 32, "org", "user", ttl=60, now=1000)
    assert read_state("k" * 32, s, now=1030)["org"] == "org"
    for bad, now in ((s, 1100), (s[:-2] + "xx", 1030), ("garbage", 1030)):
        with pytest.raises(StateError):
            read_state("k" * 32, bad, now=now)
    with pytest.raises(StateError):
        read_state("other" * 8, s, now=1030)


def test_only_owners_and_admins_can_start_a_github_install(env):
    assert env.client.post("/api/github/install-url", json={"org_id": env.org1}, headers=token(U3)).status_code == 403   # viewer
    assert env.client.post("/api/github/install-url", json={"org_id": env.org1}, headers=token(U2)).status_code == 404   # not a member: looks nonexistent
    r = env.client.post("/api/github/install-url", json={"org_id": env.org1}, headers=token(U1))
    assert r.status_code == 200 and r.json()["url"].startswith("https://github.com/apps/speco-app/installations/new?state=")


def test_the_install_round_trip_stores_the_installation_and_repositories_under_that_company(env):
    # verifies 013/FR-012
    r = link(env, env.org1, U1, 9001)
    assert r.status_code == 303 and r.headers["location"] == "https://app.test/connect?installed=2"
    assert env.pg.rows(f"select external_id, account_login from public.connections where org_id = '{env.org1}';") == ["9001|acme"]
    assert env.pg.rows(f"select full_name from public.repositories where org_id = '{env.org1}' order by 1;") == ["acme/app", "acme/web"]
    repos = env.client.get(f"/api/orgs/{env.org1}/repositories", headers=token(U1)).json()
    assert [x["full_name"] for x in repos] == ["acme/app", "acme/web"]


def test_another_company_cannot_see_those_repositories(env):
    # verifies 013/FR-002
    assert env.client.get(f"/api/orgs/{env.org1}/repositories", headers=token(U2)).status_code == 404
    assert env.pg.rows(f"select count(*) from public.repositories where org_id = '{env.org1}';", U2) == ["0"]


def test_an_installation_cannot_be_claimed_by_a_second_company(env):
    # verifies 013/FR-013
    r = link(env, env.org2, U2, 9001)                               # already linked to org 1
    assert r.status_code == 409
    assert env.pg.rows("select org_id from public.connections where external_id = '9001';") == [env.org1]


def test_a_forged_or_stale_install_callback_is_refused(env):
    assert env.client.get("/github/setup?installation_id=1&state=garbage").status_code == 400
    old = make_state(env.settings.state_secret, env.org1, U1, ttl=60, now=time.time() - 3600)
    assert env.client.get(f"/github/setup?installation_id=1&state={old}").status_code == 400
    demoted = make_state(env.settings.state_secret, env.org1, U3, 60)                 # a viewer can't have started it
    assert env.client.get(f"/github/setup?installation_id=1&state={demoted}").status_code == 403


# ------------------------------------------------------------------ webhooks
def push(files: list[str], after: str, ref: str = "refs/heads/main", repo_id: int = 501) -> dict:
    return {"ref": ref, "after": after, "repository": {"id": repo_id, "default_branch": "main"}, "commits": [{"added": files, "modified": [], "removed": []}]}


def pending_jobs(env) -> list[str]:
    return env.pg.rows("select payload->>'sha' from public.jobs where status = 'pending' order by id;")


def test_a_bad_signature_is_rejected_and_nothing_is_stored(env):
    # verifies 013/FR-014
    before = env.pg.rows("select count(*) from public.webhook_events;")
    assert deliver(env, "push", push(["specs/x/spec.md"], "z1"), "bad-1", secret="wrong").status_code == 401
    assert env.client.post("/webhooks/github", content=b"{}", headers={"X-GitHub-Event": "push", "X-GitHub-Delivery": "bad-2"}).status_code == 401
    assert env.pg.rows("select count(*) from public.webhook_events;") == before


def test_a_push_that_touches_specs_queues_one_job_even_if_repeated(env):
    # verifies 013/FR-015, FR-010, SC-003
    assert deliver(env, "push", push(["specs/001/spec.md"], "sha-1"), "d-push-1").json() == {"status": "queued"}
    assert deliver(env, "push", push(["specs/001/spec.md"], "sha-1"), "d-push-1").json() == {"status": "duplicate"}        # GitHub retry
    assert deliver(env, "push", push(["specs/002/plan.md"], "sha-2"), "d-push-2").json() == {"status": "queued"}           # newer push
    assert pending_jobs(env) == ["sha-2"]                                                                                       # collapsed into one
    assert env.pg.rows("select count(*) from public.webhook_events where delivery_id = 'd-push-1';") == ["1"]
    assert env.pg.rows(f"select last_sha from public.repositories where org_id = '{env.org1}' and external_id = '501';") == ["sha-2"]


def test_a_push_that_does_not_touch_specs_or_other_branches_queues_nothing(env):
    # verifies 013/FR-015
    jobs = pending_jobs(env)
    assert deliver(env, "push", push(["src/app.py"], "sha-3"), "d-push-3").json() == {"status": "ok"}
    assert deliver(env, "push", push(["specs/001/spec.md"], "sha-4", ref="refs/heads/feature"), "d-push-4").json() == {"status": "ignored"}
    assert pending_jobs(env) == jobs


def test_a_push_for_an_unknown_repository_is_recorded_and_ignored(env):
    assert deliver(env, "push", push(["specs/x"], "s", repo_id=99999), "d-push-5").json() == {"status": "unlinked"}
    assert env.pg.rows("select outcome from public.webhook_events where delivery_id = 'd-push-5';") == ["unlinked"]


def test_repositories_added_and_removed_follow_the_installation(env):
    p = {"action": "added", "installation": {"id": 9001}, "repositories_added": [{"id": 503, "full_name": "acme/new"}], "repositories_removed": []}
    assert deliver(env, "installation_repositories", p, "d-ir-1").json() == {"status": "ok"}
    p = {"action": "removed", "installation": {"id": 9001}, "repositories_added": [], "repositories_removed": [{"id": 502, "full_name": "acme/web"}]}
    deliver(env, "installation_repositories", p, "d-ir-2")
    rows = env.pg.rows(f"select full_name, status from public.repositories where org_id = '{env.org1}' order by 1;")
    assert rows == ["acme/app|active", "acme/new|active", "acme/web|removed"]


def test_events_for_an_installation_nobody_linked_yet_are_kept_not_applied(env):
    p = {"action": "created", "installation": {"id": 77777}}
    assert deliver(env, "installation", p, "d-inst-0").json() == {"status": "unlinked"}
    assert env.pg.rows("select count(*) from public.connections where external_id = '77777';") == ["0"]


def test_suspending_and_deleting_an_installation(env):
    deliver(env, "installation", {"action": "suspend", "installation": {"id": 9001}}, "d-inst-1")
    assert env.pg.rows("select status from public.connections where external_id = '9001';") == ["suspended"]
    # a suspended installation no longer queues work
    jobs = pending_jobs(env)
    assert deliver(env, "push", push(["specs/009/spec.md"], "sha-9"), "d-push-9").json() == {"status": "unlinked"}
    assert pending_jobs(env) == jobs
    deliver(env, "installation", {"action": "unsuspend", "installation": {"id": 9001}}, "d-inst-2")
    deliver(env, "installation", {"action": "deleted", "installation": {"id": 9001}}, "d-inst-3")
    assert env.pg.rows(f"select distinct status from public.repositories where org_id = '{env.org1}';") == ["removed"]


def test_a_failed_delivery_is_not_marked_done_so_the_retry_runs_again(env, monkeypatch):
    # verifies 013/SC-003
    from speco_cloud import webhooks
    calls = {"n": 0}
    real = webhooks.HANDLERS["installation"]

    def flaky(conn, p):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("database hiccup")
        return real(conn, p)

    monkeypatch.setitem(webhooks.HANDLERS, "installation", flaky)
    p = {"action": "created", "installation": {"id": 12345}}
    assert deliver(env, "installation", p, "d-flaky").status_code == 500
    assert env.pg.rows("select processed_at is null, error is not null from public.webhook_events where delivery_id = 'd-flaky';") == ["t|t"]
    assert deliver(env, "installation", p, "d-flaky").json() == {"status": "unlinked"}                      # the retry processed it
    assert env.pg.rows("select processed_at is not null, error is null from public.webhook_events where delivery_id = 'd-flaky';") == ["t|t"]


# ------------------------------------------------------------------ the service runs with least privilege
def test_the_service_connection_cannot_rewrite_decisions(env):
    from speco_cloud.db import service_tx
    with pytest.raises(Exception, match="permission denied"):
        with service_tx(env.settings) as conn:
            conn.execute("update public.approvals set reason = 'x'")


def test_jobs_are_claimed_once_and_only_when_due(env):
    from speco_cloud.db import service_tx
    env.pg.psql("update public.jobs set status = 'done' where status = 'running';")
    with service_tx(env.settings) as conn:
        first = conn.execute("select * from public.claim_job()").fetchone()
        again = conn.execute("select * from public.claim_job()").fetchone()
    assert first and first["status"] == "running" and first["attempts"] == 1
    assert again is None or again["id"] != first["id"]
    env.pg.psql(f"update public.jobs set status = 'done' where id = {first['id']};")
    env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, run_after) select org_id, id, 'sync_repo', now() + interval '1 hour' from public.repositories where full_name = 'acme/app' and org_id = '{env.org1}';")
    with service_tx(env.settings) as conn:
        assert conn.execute("select * from public.claim_job() where run_after > now()").fetchone() is None
    pg_users = env.pg.fails("select * from public.claim_job();", U1)
    assert "permission denied" in pg_users


# ------------------------------------------------------------------ the browser app (spec 015)
def test_only_the_web_app_origin_may_call_the_api_from_a_browser(env):
    # verifies 015/SC-002
    ask = lambda origin: env.client.options("/api/orgs", headers={"Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})  # noqa: E731
    assert ask("https://app.test").headers.get("access-control-allow-origin") == "https://app.test"
    assert "access-control-allow-origin" not in ask("https://evil.example").headers
    r = env.client.get("/api/orgs", headers={**token(U1), "Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers                                         # the browser would not let that page read the answer


def test_the_repository_list_tells_the_app_what_it_needs(env):
    inst = env.pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{env.org2}', 'github', '424242', 'two', 'Organization') returning id;", "service")[0]
    env.pg.psql(f"""insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{env.org2}', '{inst}', '9991', 'two/live'), ('{env.org2}', '{inst}', '9992', 'two/gone');
                    update public.repositories set status = 'removed' where external_id = '9992';""", "service")
    repos = env.client.get(f"/api/orgs/{env.org2}/repositories", headers=token(U2)).json()
    assert [r["full_name"] for r in repos] == ["two/live"]                                         # removed repositories are not listed
    assert {"id", "full_name", "status", "code_consent", "last_synced_at"} <= set(repos[0]) and repos[0]["code_consent"] is False


def test_the_company_list_says_what_role_the_person_has(env):
    assert [(o["slug"], o["role"]) for o in env.client.get("/api/orgs", headers=token(U1)).json()] == [("one", "owner")]
    assert [(o["slug"], o["role"]) for o in env.client.get("/api/orgs", headers=token(U3)).json()] == [("one", "viewer")]


# ------------------------------------------------------------------ both ways Supabase signs tokens
def test_asymmetric_supabase_tokens_are_verified_with_the_published_key_and_nothing_else(env):
    # verifies 013/FR-016
    from cryptography.hazmat.primitives.asymmetric import ec
    from speco_cloud.auth import AuthError, verify_jwt

    key, other = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())

    class Jwks:                                         # what PyJWKClient returns for the project's published key
        def get_signing_key_from_jwt(self, _token):
            return type("K", (), {"key": key.public_key()})()

    def mint(k, alg="ES256", **extra):
        return jwt.encode({"sub": U1, "aud": "authenticated", "exp": int(time.time()) + 600, **extra}, k, algorithm=alg, headers={"kid": "k1"})

    assert verify_jwt(mint(key), "", jwks=Jwks())["sub"] == U1
    with pytest.raises(AuthError):                      # signed by somebody else
        verify_jwt(mint(other), "", jwks=Jwks())
    with pytest.raises(AuthError):                      # expired
        verify_jwt(mint(key, exp=int(time.time()) - 5), "", jwks=Jwks())
    with pytest.raises(AuthError):                      # a project without JWKS accepts no asymmetric token
        verify_jwt(mint(key), JWT_SECRET)
    # algorithm confusion: an HS256 token is only ever checked against the shared secret, never against the published public key
    with pytest.raises(AuthError):
        verify_jwt(token(U1)["Authorization"][7:], "", jwks=Jwks())                  # HS256 with no secret configured: refused
    with pytest.raises(AuthError):                      # `none` and unknown algorithms
        verify_jwt(jwt.encode({"sub": U1, "aud": "authenticated"}, None, algorithm="none"), JWT_SECRET, jwks=Jwks())
    assert verify_jwt(token(U1)["Authorization"][7:], JWT_SECRET, jwks=Jwks())["sub"] == U1      # the older kind keeps working next to it


def test_an_install_started_on_github_has_no_state_and_links_nothing(env):
    r = env.client.get("/github/setup?installation_id=777")
    assert r.status_code == 200 and "specs/" in r.text and 'href="https://app.test/connect"' in r.text
    assert env.pg.rows("select count(*) from public.connections where external_id = '777';") == ["0"]


def test_the_cron_tick_needs_its_secret(env, monkeypatch):
    from dataclasses import replace

    from speco_cloud import worker
    ran = []
    monkeypatch.setattr(worker, "periodic", lambda *a: ran.append("periodic"))
    monkeypatch.setattr(worker, "drain", lambda *a: ran.append("drain") or [{"job": 1}])
    assert env.client.get("/internal/tick", headers={"Authorization": "Bearer "}).status_code == 401     # no secret configured: always refused
    client = TestClient(create_app(replace(env.settings, cron_secret="c" * 32), env.gh))
    assert client.get("/internal/tick", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/internal/tick", headers={"Authorization": "Bearer " + "c" * 32}).json() == {"jobs": 1}
    assert ran == ["periodic", "drain"]


def test_on_vercel_jobs_run_inside_the_request_that_queued_them():
    base = {"DATABASE_URL": "x", "GITHUB_WEBHOOK_SECRET": "w"}
    assert Settings.from_env({**base, "VERCEL": "1"}).inline_jobs and Settings.from_env({**base, "SPECO_INLINE_JOBS": "1"}).inline_jobs
    assert not Settings.from_env(base).inline_jobs


# ------------------------------------------------------------------ one click: the installations the person already has on GitHub
def discover(env, user=U1, github_token="gho_ok"):
    return env.client.post("/api/github/installations", json={"github_token": github_token}, headers=token(user))


def test_an_installation_on_the_persons_own_account_comes_with_a_claim_and_an_organizations_does_not(env):
    own, org = discover(env).json()
    assert (own["account"], own["account_type"], own["repositories"], own["linked_org"]) == ("ana", "User", 2, None) and own["claim"]
    assert (org["account"], org["claim"], org["repositories"]) == ("acme", None, None)        # any member sees it; only an admin may choose on GitHub
    assert discover(env, github_token="gho_bad").status_code == 401
    assert env.client.post("/api/github/installations", json={"github_token": "gho_ok"}).status_code == 401           # Speco session first


def test_a_claim_links_the_installation_in_one_click_and_only_for_whoever_got_it(env):
    claim = discover(env).json()[0]["claim"]
    assert env.client.post(f"/api/orgs/{env.org2}/github/link", json={"claim": claim}, headers=token(U2)).status_code == 400   # U1's claim
    assert env.client.post(f"/api/orgs/{env.org1}/github/link", json={"claim": claim}, headers=token(U3)).status_code == 403   # a viewer
    assert env.client.get(f"/github/setup?installation_id=9100&state={claim}").status_code == 400                          # not an install state
    r = env.client.post(f"/api/orgs/{env.org1}/github/link", json={"claim": claim}, headers=token(U1))
    assert r.status_code == 200 and r.json() == {"repositories": 2}
    assert env.pg.rows(f"select external_id from public.connections where org_id = '{env.org1}' and external_id = '9100';") == ["9100"]
    assert discover(env).json()[0]["linked_org"] == env.org1 and discover(env).json()[0]["claim"] is None


def test_the_install_link_can_go_straight_to_one_github_account(env):
    url = env.client.post("/api/github/install-url", json={"org_id": env.org1, "target_id": 88}, headers=token(U1)).json()["url"]
    assert url.startswith("https://github.com/apps/speco-app/installations/new/permissions?target_id=88&state=")


# ------------------------------------------------------------------ the installation id in the address bar proves nothing
def setup_with_own_state(env, user: str, installation_id: int):
    url = env.client.post("/api/github/install-url", json={"org_id": env.org2}, headers=token(user)).json()["url"]
    return env.client.get(f"/github/setup?installation_id={installation_id}&state={url.split('state=')[1]}")


def test_an_admin_cannot_link_an_installation_somebody_else_made(env):
    r = setup_with_own_state(env, U2, 9300)                 # U2 owns org 2; nobody told GitHub U2 installed 9300
    assert r.status_code == 303 and r.headers["location"] == "https://app.test/connect?github=unverified"
    assert env.pg.rows("select count(*) from public.connections where external_id = '9300';") == ["0"]


def test_someone_who_signed_in_by_email_is_asked_to_use_github(env):
    env.pg.psql(f"delete from auth.identities where user_id = '{U2}';")
    try:
        r = setup_with_own_state(env, U2, 9301)
        assert r.headers["location"] == "https://app.test/connect?github=sign-in"
    finally:
        env.pg.psql(f"insert into auth.identities (user_id, provider, provider_id) values ('{U2}', 'github', '702');")


def test_the_identity_function_is_only_for_the_service(env):
    assert env.pg.psql(f"select public.github_account_id('{U1}');", U1, check=False).returncode != 0
    assert env.pg.rows(f"select public.github_account_id('{U1}');", "service") == ["701"]
