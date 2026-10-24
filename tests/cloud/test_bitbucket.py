"""Spec 019 part 2 · Bitbucket Cloud as a code provider: connect a workspace, choose repositories, stay current through signed pushes, keep
the credential secret. Real FastAPI app, real schema, real worker; Bitbucket is a fake HTTP transport."""
from __future__ import annotations

import base64
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
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "cloud"))

import httpx  # noqa: E402
import jwt  # noqa: E402
from cryptography.fernet import Fernet  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud import worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.credentials import Cipher  # noqa: E402
from speco_cloud.providers import Providers  # noqa: E402
from speco_cloud.providers.bitbucket import BitbucketCloud, BitbucketReader, ProviderError  # noqa: E402

JWT_SECRET, PUBLIC = "j" * 40, "https://speco.test"
OWNER, VIEWER, OUTSIDER = ("30000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3))
API, AUTH = "https://api.bitbucket.test/2.0", "https://bb.test/site/oauth2/access_token"
EXAMPLE = ROOT / "examples" / "invitations"
GOOD = {"workspace": "acme", "client_key": "key-1", "client_secret": "THE-SECRET-VALUE"}


def token(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


def example_files() -> dict[str, str]:
    return {str(p.relative_to(EXAMPLE)): p.read_text(encoding="utf-8") for p in (EXAMPLE / "specs").rglob("*.md")}


class FakeBitbucket:
    """The calls we make to Bitbucket Cloud. Three repositories on two pages; `app` holds the specs of the example."""

    def __init__(self):
        self.repos = [{"uuid": "{r-app}", "full_name": "acme/app", "mainbranch": {"name": "main"}},
                      {"uuid": "{r-web}", "full_name": "acme/web", "mainbranch": {"name": "main"}},
                      {"uuid": "{r-old}", "full_name": "acme/old", "mainbranch": {"name": "master"}}]
        self.heads = {"acme/app": "c1", "acme/web": "w1", "acme/old": "o1"}
        self.files = {"c1": example_files(), "c2": example_files()}
        self.noise = {"src/app.py": "print('hi')", "README.md": "# hi"}
        self.scopes = "repository webhook"
        self.hooks: dict[str, dict] = {}
        self.deleted: list[str] = []
        self.busy = False
        self.evil_next = False
        self.requests: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(f"{req.method} {req.url.path}")
        url, path = str(req.url), req.url.path
        if url.startswith(AUTH):
            basic = base64.b64decode(req.headers["authorization"].removeprefix("Basic ")).decode()
            return httpx.Response(401) if basic.startswith("nope:") else httpx.Response(200, json={"access_token": "bb-token", "scopes": self.scopes, "expires_in": 7200})
        assert req.headers["authorization"] == "Bearer bb-token"
        if self.busy:
            return httpx.Response(429, headers={"Retry-After": "60"})
        p = path.removeprefix("/2.0")
        if p == "/workspaces/acme":
            return httpx.Response(200, json={"uuid": "{ws-1}", "slug": "acme"})
        if p == "/workspaces/ghost":
            return httpx.Response(404)
        if p == "/repositories/acme":
            page = int(req.url.params.get("page", "1"))
            vals = self.repos[:2] if page == 1 else self.repos[2:]
            nxt = {} if page > 1 else {"next": ("https://evil.test" if self.evil_next else API) + "/repositories/acme?page=2"}
            return httpx.Response(200, json={"values": vals, **nxt})
        if p == "/workspaces/acme/hooks" and req.method == "POST":
            body = json.loads(req.content)
            uuid = "{hook-%d}" % (len(self.hooks) + 1)
            self.hooks[uuid] = body
            return httpx.Response(201, json={"uuid": uuid})
        if p.startswith("/workspaces/acme/hooks/") and req.method == "DELETE":
            self.deleted.append(p.rsplit("/", 1)[1].replace("%7B", "{").replace("%7D", "}"))
            return httpx.Response(204)
        if "/refs/branches/" in p:
            name = p.split("/repositories/", 1)[1].split("/refs/")[0]
            return httpx.Response(200, json={"target": {"hash": self.heads[name]}}) if name in self.heads else httpx.Response(404)
        if "/src/" in p:
            sha, rest = p.split("/src/", 1)[1].split("/", 1)
            files = self.files[sha]
            if rest == "":                                      # the tree, two pages
                entries = [{"path": f, "type": "commit_file", "size": len(t)} for f, t in {**files, **self.noise}.items()] + [{"path": "specs", "type": "commit_directory"}]
                page = int(req.url.params.get("page", "1"))
                chunk = entries[:5] if page == 1 else entries[5:]
                return httpx.Response(200, json={"values": chunk, **({"next": API + p.removeprefix("/2.0") + "?page=2"} if page == 1 else {})})
            return httpx.Response(200, text=files[rest]) if rest in files else httpx.Response(404)
        return httpx.Response(404)


def signed(secret: str, body: bytes) -> dict:
    return {"X-Hub-Signature": "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest(), "X-Event-Key": "repo:push", "Content-Type": "application/json"}


def push(repo_uuid: str, branch: str, sha: str) -> dict:
    return {"repository": {"uuid": repo_uuid}, "push": {"changes": [{"new": {"type": "branch", "name": branch, "target": {"hash": sha}}}]}}


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'bb{i}@example.com');" for i, u in enumerate((OWNER, VIEWER, OUTSIDER), 1)))
    key = Fernet.generate_key().decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, state_secret="s" * 32,
                        app_url="https://app.test", public_url=PUBLIC, credentials_key=key, bitbucket_api=API, bitbucket_auth=AUTH)
    fake = FakeBitbucket()
    bb = BitbucketCloud(API, AUTH, httpx.Client(transport=httpx.MockTransport(fake)))
    client = TestClient(create_app(settings, bitbucket=bb), follow_redirects=False)
    org = client.post("/api/orgs", json={"name": "Pilot", "slug": "pilot"}, headers=token(OWNER)).json()["id"]
    other = client.post("/api/orgs", json={"name": "Other", "slug": "other"}, headers=token(OUTSIDER)).json()["id"]
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{VIEWER}', 'viewer');", OWNER)
    return type("Env", (), {"pg": pg, "client": client, "fake": fake, "settings": settings, "bb": bb, "cipher": Cipher(key), "org": org, "other": other})


def connect(env, body=None, who=OWNER, org=None):
    return env.client.post(f"/api/orgs/{org or env.org}/connections/bitbucket", json=body or GOOD, headers=token(who))


def count(env, sql: str) -> int:
    return int(env.pg.rows(sql)[0])


# ------------------------------------------------------------------ connect (US1, FR-001..003)
def test_a_credential_that_can_write_is_refused_and_nothing_is_stored(env):
    # verifies 019/FR-002
    env.fake.scopes = "repository repository:write webhook"
    r = connect(env)
    env.fake.scopes = "repository webhook"
    assert r.status_code == 422 and "repository:write" in r.json()["detail"]
    assert count(env, f"select count(*) from public.connections where org_id = '{env.org}';") == 0
    assert count(env, "select count(*) from public.connection_secrets;") == 0


def test_a_wrong_key_or_unknown_workspace_is_a_clear_error(env):
    assert connect(env, {**GOOD, "client_key": "nope"}).status_code == 422
    r = connect(env, {**GOOD, "workspace": "ghost"})
    assert r.status_code == 422 and "workspace" in r.json()["detail"]
    assert connect(env, {**GOOD, "workspace": "../x"}).status_code == 422


def test_only_owners_and_admins_connect_and_outsiders_see_nothing(env):
    # verifies 019/FR-001
    assert connect(env, who=VIEWER).status_code == 403
    assert connect(env, who=OUTSIDER).status_code == 404
    assert count(env, "select count(*) from public.connections;") == 0


def test_a_missing_server_key_is_a_clear_503(env):
    off = TestClient(create_app(Settings(**{**env.settings.__dict__, "credentials_key": ""}), bitbucket=env.bb))
    assert off.post(f"/api/orgs/{env.org}/connections/bitbucket", json=GOOD, headers=token(OWNER)).status_code == 503


def test_connecting_lists_every_repository_as_available_and_reads_none(env):
    # verifies 019/FR-001, FR-003
    r = connect(env)
    assert r.status_code == 201 and r.json()["repositories"] == 3 and r.json()["webhook"] is True      # two pages followed
    env.cid = r.json()["id"]
    assert env.pg.rows(f"select status, count(*) from public.repositories where org_id = '{env.org}' group by status;") == ["available|3"]
    assert count(env, "select count(*) from public.jobs;") == 0                                              # SC-004: nothing is read until chosen
    hook = next(iter(env.fake.hooks.values()))
    assert hook["url"] == f"{PUBLIC}/webhooks/bitbucket/{env.cid}" and hook["events"] == ["repo:push"] and hook["secret"]
    env.hook_secret = hook["secret"]


def test_a_page_address_outside_the_api_is_never_followed(env):
    env.fake.evil_next = True
    r = connect(env)
    env.fake.evil_next = False
    assert r.status_code == 422 and not any("evil" in x for x in env.fake.requests)


# ------------------------------------------------------------------ secrecy (US5, FR-008)
def test_no_credential_is_returned_or_stored_in_clear(env):
    # verifies 019/FR-008, SC-002
    out = env.client.get(f"/api/orgs/{env.org}/connections", headers=token(VIEWER))
    [c] = out.json()
    assert (c["provider"], c["account"], c["available"], c["active"]) == ("bitbucket", "acme", 3, 0) and c["details"]["webhook"] is True
    text = out.text + env.client.get(f"/api/orgs/{env.org}/repositories?status=all", headers=token(VIEWER)).text
    assert "THE-SECRET-VALUE" not in text and "key-1" not in text and env.hook_secret not in text and "credentials" not in text
    stored = env.pg.rows("select credentials || coalesce(webhook_secret, '') from public.connection_secrets;")[0]
    assert "THE-SECRET-VALUE" not in stored and env.hook_secret not in stored
    assert env.cipher.decrypt_json(env.pg.rows("select credentials from public.connection_secrets;")[0]) == {"key": "key-1", "secret": "THE-SECRET-VALUE"}
    assert "permission denied" in env.pg.fails("select credentials from public.connection_secrets;", VIEWER)


# ------------------------------------------------------------------ choose (US2, FR-004)
def repo_ids(env, *names):
    return [env.pg.rows(f"select id from public.repositories where org_id = '{env.org}' and full_name = '{n}';")[0] for n in names]


def test_only_the_chosen_repositories_are_read(env):
    # verifies 019/FR-004
    ids = repo_ids(env, "acme/app", "acme/web")
    assert env.client.post(f"/api/orgs/{env.org}/repositories/select", json={"repo_ids": ids, "selected": True}, headers=token(VIEWER)).status_code == 403
    r = env.client.post(f"/api/orgs/{env.org}/repositories/select", json={"repo_ids": ids, "selected": True}, headers=token(OWNER))
    assert r.json() == {"changed": 2}
    assert env.pg.rows(f"select status, count(*) from public.repositories where org_id = '{env.org}' group by status order by status;") == ["active|2", "available|1"]
    assert count(env, "select count(*) from public.jobs;") == 4                                              # a review and a portrait for each of the two
    assert env.client.post(f"/api/orgs/{env.org}/repositories/select", json={"repo_ids": ids, "selected": True}, headers=token(OWNER)).json() == {"changed": 0}
    assert [x["full_name"] for x in env.client.get(f"/api/orgs/{env.org}/repositories", headers=token(VIEWER)).json()] == ["acme/app", "acme/web"]
    assert [x["full_name"] for x in env.client.get(f"/api/orgs/{env.org}/repositories?status=available", headers=token(VIEWER)).json()] == ["acme/old"]


def test_someone_elses_repository_cannot_be_chosen(env):
    [mine] = repo_ids(env, "acme/old")
    assert env.client.post(f"/api/orgs/{env.other}/repositories/select", json={"repo_ids": [mine], "selected": True}, headers=token(OUTSIDER)).json() == {"changed": 0}


# ------------------------------------------------------------------ read through Bitbucket (US4, FR-007)
def test_the_worker_reads_a_bitbucket_repository_and_stores_the_same_review(env):
    # verifies 019/FR-007
    providers = Providers(bitbucket=env.bb, cipher=env.cipher)
    out = worker.run_once(env.settings, providers)
    while out and "features" not in out:                       # the portrait job may come first
        out = worker.run_once(env.settings, providers)
    assert out["features"] == 1 and out["reviews"] == 1
    [direct] = worker.review_files(example_files())
    stored = json.loads(env.pg.rows("select report::text from public.reviews limit 1;")[0])
    assert stored["summary"] == direct["report"]["summary"] and stored["decision"]["verdict"] == direct["report"]["decision"]["verdict"]


def test_the_files_read_through_bitbucket_are_exactly_the_repository_files(env):
    # verifies 019/FR-007
    reader = BitbucketReader(env.bb, "acme/app", {"key": "key-1", "secret": "x"})
    files, tree = worker.fetch_files(reader, "c1")
    assert files == {p: t for p, t in example_files().items() if worker.FEATURE_FILE.match(p) or worker.PRODUCT_FILE.match(p)}
    assert {e["type"] for e in tree} == {"blob", "tree"} and any(e["path"] == "src/app.py" for e in tree)
    assert reader.get_file_optional("nope.md", "c1") is None
    with pytest.raises(ProviderError):
        reader.get_file("nope.md", "c1")


def test_a_busy_provider_leaves_the_job_to_be_retried(env):
    # verifies 019/FR-012
    pg = env.pg
    [repo] = repo_ids(env, "acme/app")
    pg.psql(f"delete from public.jobs; insert into public.jobs (org_id, repo_id, kind, payload) values ('{env.org}', '{repo}', 'sync_repo', '{{\"sha\": \"c2\"}}');", "service")
    env.bb._cache.clear()
    env.fake.busy = True
    out = worker.run_once(env.settings, Providers(bitbucket=env.bb, cipher=env.cipher))
    env.fake.busy = False
    assert "slow down" in out["error"]
    assert pg.rows("select status, attempts, last_error like '%slow down%' from public.jobs;") == ["pending|1|t"]            # FR-012: not lost, due again later


# ------------------------------------------------------------------ pushes (US3, FR-005, FR-006)
def deliver(env, payload, secret=None, cid=None, request_id="r-1"):
    body = json.dumps(payload).encode()
    return env.client.post(f"/webhooks/bitbucket/{cid or env.cid}", content=body, headers={**signed(secret or env.hook_secret, body), "X-Request-UUID": request_id})


def test_a_push_to_the_main_branch_of_a_chosen_repository_is_queued(env):
    # verifies 019/FR-005
    env.pg.psql("delete from public.jobs;", "service")
    r = deliver(env, push("{r-app}", "main", "c2"), request_id="p-1")
    assert r.status_code == 200 and r.json() == {"status": "queued"}
    assert env.pg.rows("select kind, payload->>'sha' from public.jobs;") == ["sync_repo|c2"]
    assert env.pg.rows(f"select last_sha from public.repositories where external_id = '{{r-app}}';") == ["c2"]
    assert deliver(env, push("{r-app}", "main", "c2"), request_id="p-1").json() == {"status": "duplicate"}


def test_pushes_to_other_branches_and_unchosen_repositories_read_nothing(env):
    # verifies 019/FR-005
    env.pg.psql("delete from public.jobs;", "service")
    assert deliver(env, push("{r-app}", "feature/x", "z"), request_id="p-2").json() == {"status": "ignored"}
    assert deliver(env, push("{r-old}", "master", "z"), request_id="p-3").json() == {"status": "unselected"}
    assert deliver(env, push("{r-new}", "main", "z"), request_id="p-4").json() == {"status": "unknown"}
    assert count(env, "select count(*) from public.jobs;") == 0


def test_a_delivery_with_a_wrong_signature_is_refused_and_not_stored(env):
    # verifies 019/FR-006
    before = count(env, "select count(*) from public.webhook_events where delivery_id like 'bitbucket:%';")
    assert deliver(env, push("{r-app}", "main", "evil"), secret="wrong", request_id="p-5").status_code == 401
    assert env.client.post(f"/webhooks/bitbucket/{env.cid}", content=b"{}", headers={"X-Event-Key": "repo:push"}).status_code == 401
    assert deliver(env, push("{r-app}", "main", "evil"), cid="00000000-0000-0000-0000-000000000000", request_id="p-6").status_code == 401
    assert deliver(env, push("{r-app}", "main", "evil"), cid="not-a-uuid", request_id="p-7").status_code == 401
    assert count(env, "select count(*) from public.webhook_events where delivery_id like 'bitbucket:%';") == before


# ------------------------------------------------------------------ refresh (US2, FR-010) and disconnect (FR-009)
def test_refresh_finds_new_repositories_and_catches_up_moved_branches(env):
    # verifies 019/FR-010
    env.fake.repos = [r for r in env.fake.repos if r["uuid"] != "{r-old}"] + [{"uuid": "{r-new}", "full_name": "acme/new", "mainbranch": {"name": "main"}}]
    env.fake.heads.update({"acme/app": "c3", "acme/web": "w1", "acme/new": "n1"})
    env.fake.files["c3"] = env.fake.files["c1"]
    env.pg.psql(f"update public.repositories set last_sha = 'w1' where external_id = '{{r-web}}';", "service")
    env.pg.psql("delete from public.jobs;", "service")
    assert env.client.post(f"/api/orgs/{env.org}/connections/{env.cid}/refresh", headers=token(VIEWER)).status_code == 403
    r = env.client.post(f"/api/orgs/{env.org}/connections/{env.cid}/refresh", headers=token(OWNER))
    assert r.json() == {"added": 1, "removed": 1, "queued": 1}                       # acme/new appeared, acme/old is gone, only acme/app moved
    assert env.pg.rows("select kind, payload->>'sha' from public.jobs;") == ["sync_repo|c3"]
    assert env.pg.rows(f"select status from public.repositories where full_name = 'acme/new';") == ["available"]


def test_disconnecting_deletes_the_credential_and_the_webhook(env):
    # verifies 019/FR-009
    hook_uuid = env.pg.rows(f"select details->>'webhook_uuid' from public.connections where id = '{env.cid}';")[0]
    assert env.client.post(f"/api/orgs/{env.org}/connections/{env.cid}/disconnect", headers=token(VIEWER)).status_code == 403
    assert env.client.post(f"/api/orgs/{env.org}/connections/{env.cid}/disconnect", headers=token(OWNER)).json() == {"status": "disconnected"}
    assert count(env, "select count(*) from public.connection_secrets;") == 0
    assert hook_uuid in env.fake.deleted
    assert env.pg.rows(f"select status, count(*) from public.repositories where org_id = '{env.org}' group by status;") == ["removed|4"]
    assert deliver(env, push("{r-app}", "main", "c9"), request_id="p-9").status_code == 401                 # the hook no longer verifies
    assert env.client.get(f"/api/orgs/{env.org}/connections", headers=token(OWNER)).json() == []
