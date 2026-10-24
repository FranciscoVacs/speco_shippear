"""Spec 018 · the remote MCP endpoint, through the real service and schema. An AI agent authorized by a person reads what the person reads
and can decide nothing; tokens that are not an authorized client's are refused. Supabase's OAuth server is simulated only in that the tests
mint the tokens it would issue (HS256 with the project secret; the claims are the documented ones: iss, aud, sub, client_id)."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.mcp_server import TOOLS  # noqa: E402

SECRET = "m" * 40
SUPABASE = "https://proj.supabase.co"
PUBLIC = "https://speco-api.test"
ALICE, BOB = "70000000-0000-0000-0000-00000000000a", "70000000-0000-0000-0000-00000000000b"
CLIENT = "claude-connector-uuid"


def token(user: str, client_id: str | None = CLIENT, iss: str = f"{SUPABASE}/auth/v1", exp: int = 3600) -> str:
    claims = {"sub": user, "aud": "authenticated", "iss": iss, "exp": int(time.time()) + exp, **({"client_id": client_id} if client_id else {})}
    return jwt.encode(claims, SECRET, algorithm="HS256")


def rpc(client, method: str, params: dict | None = None, tok: str | None = None, id_: int | None = 1):
    body = {"jsonrpc": "2.0", "method": method, **({"id": id_} if id_ is not None else {}), **({"params": params} if params is not None else {})}
    return client.post("/mcp", json=body, headers={"Authorization": f"Bearer {tok}"} if tok else {})


@pytest.fixture(scope="module")
def env(pg):
    pg.psql(f"insert into auth.users (id, email) values ('{ALICE}', 'alice@example.com'), ('{BOB}', 'bob@example.com');")
    org_a = pg.rows("select public.create_organization('Alice Co', 'alice-co');", ALICE)[0]
    org_b = pg.rows("select public.create_organization('Bob Co', 'bob-co');", BOB)[0]
    ids = {}
    for tag, org, gh in (("a", org_a, 9100), ("b", org_b, 9200)):
        inst = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '{gh}', '{tag}', 'Organization') returning id;", "service")[0]
        repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '{gh}', 'co-{tag}/app') returning id;", "service")[0]
        pg.psql(f"insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha) values ('{org}', '{repo}', 'Secret rule of company {tag.upper()} about refunds', 'k-{tag}', 'money', 'high', 'spec', 'high', 'test', 'c');", "service")
        feat = pg.rows(f"insert into public.features (org_id, repo_id, key) values ('{org}', '{repo}', '001-x') returning id;", "service")[0]
        snap = pg.rows(f"insert into public.spec_snapshots (org_id, feature_id, commit_sha, files_hash, files) values ('{org}', '{feat}', 'c', 'h', '{{}}') returning id;", "service")[0]
        pg.psql(f"""insert into public.reviews (org_id, snapshot_id, verdict, summary, report, engine_version) values ('{org}', '{snap}', 'needs_decision', '{{"blocker": 1, "warning": 0, "suggestion": 0}}',
                    '{{"findings": [{{"rule": "CON001", "severity": "blocker", "ids": ["FR-001"], "message": "two rules disagree", "owner": "decision"}}]}}', '0.1');""", "service")
        ids[tag] = {"org": org, "repo": repo}
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x" * 16, supabase_jwt_secret=SECRET, supabase_url=SUPABASE, public_url=PUBLIC, app_url="https://app.test")
    return type("Env", (), {"pg": pg, "client": TestClient(create_app(settings)), "ids": ids})


def call(env, user: str, name: str, args: dict | None = None, **kw):
    r = rpc(env.client, "tools/call", {"name": name, "arguments": args or {}}, token(user, **kw))
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    return res["isError"], res["content"][0]["text"]


# ------------------------------------------------------------------ discovery and who may call
def test_a_client_with_no_access_is_told_where_to_get_authorized(env):
    # verifies 018/FR-003
    r = rpc(env.client, "initialize", {})
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == f'Bearer resource_metadata="{PUBLIC}/.well-known/oauth-protected-resource/mcp"'
    for path in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"):
        meta = env.client.get(path).json()
        assert meta == {"resource": f"{PUBLIC}/mcp", "authorization_servers": [f"{SUPABASE}/auth/v1"], "bearer_methods_supported": ["header"], "resource_name": "Speco", "scopes_supported": ["openid", "email", "profile", "phone"]}


def test_only_the_access_of_an_authorized_client_is_accepted(env):
    # verifies 018/FR-006
    assert rpc(env.client, "ping", None, token(ALICE)).status_code == 200
    assert rpc(env.client, "ping", None, token(ALICE, client_id=None)).status_code == 401               # the person's own web session is not an agent
    assert rpc(env.client, "ping", None, token(ALICE, iss="https://other.supabase.co/auth/v1")).status_code == 401   # another issuer
    assert rpc(env.client, "ping", None, token(ALICE, exp=-5)).status_code == 401
    assert rpc(env.client, "ping", None, "garbage").status_code == 401
    assert env.client.get("/mcp").status_code == 405


def test_an_agents_access_is_refused_by_the_web_api(env):
    # verifies 018/SC-002
    h = {"Authorization": f"Bearer {token(ALICE)}"}
    assert env.client.get("/api/orgs", headers=h).status_code == 403
    rid = env.pg.rows(f"select id from public.business_rules where org_id = '{env.ids['a']['org']}';")[0]
    assert env.client.post(f"/api/rules/{rid}/decision", json={"action": "confirm"}, headers=h).status_code == 403
    assert env.pg.rows(f"select status from public.business_rules where id = '{rid}';") == ["proposed"]
    # and the person's own web session keeps working there
    assert env.client.get("/api/orgs", headers={"Authorization": f"Bearer {token(ALICE, client_id=None)}"}).status_code == 200


# ------------------------------------------------------------------ the protocol
def test_initialize_and_the_tool_list(env):
    init = rpc(env.client, "initialize", {"protocolVersion": "2025-06-18"}, token(ALICE)).json()["result"]
    assert init["protocolVersion"] == "2025-06-18" and init["capabilities"] == {"tools": {"listChanged": False}} and init["serverInfo"]["name"] == "speco"
    assert rpc(env.client, "initialize", {"protocolVersion": "1999-01-01"}, token(ALICE)).json()["result"]["protocolVersion"] == "2025-06-18"
    tools = rpc(env.client, "tools/list", {}, token(ALICE)).json()["result"]["tools"]
    assert {t["name"] for t in tools} == set(TOOLS) and all(t["annotations"]["readOnlyHint"] for t in tools)


def test_there_is_no_tool_that_decides_anything(env):
    # verifies 018/FR-009, SC-002
    names = {t["name"] for t in rpc(env.client, "tools/list", {}, token(ALICE)).json()["result"]["tools"]}
    assert not any(w in n for n in names for w in ("decide", "approve", "confirm", "reject", "freeze", "acknowledge", "consent", "create", "delete", "update", "write", "set_"))
    r = rpc(env.client, "tools/call", {"name": "decide_rule", "arguments": {}}, token(ALICE)).json()
    assert r["error"]["code"] == -32602


def test_notifications_have_no_answer_and_bad_messages_get_protocol_errors(env):
    assert rpc(env.client, "notifications/initialized", None, token(ALICE), id_=None).status_code == 202
    assert rpc(env.client, "no/such/method", {}, token(ALICE)).json()["error"]["code"] == -32601
    r = env.client.post("/mcp", content=b"{not json", headers={"Authorization": f"Bearer {token(ALICE)}", "Content-Type": "application/json"})
    assert r.status_code == 400 and r.json()["error"]["code"] == -32700


# ------------------------------------------------------------------ what an agent can see
def test_an_agent_sees_what_its_person_sees_and_nothing_of_other_companies(env):
    # verifies 018/FR-005, FR-007
    err, text = call(env, ALICE, "pending_decisions")
    data = json.loads(text)
    assert not err and data["company"] == "alice-co" and data["your_role"] == "owner"
    assert [r["statement"] for r in data["rules_waiting_for_a_person"]] == ["Secret rule of company A about refunds"]
    assert data["features_that_need_a_decision_or_are_blocked"] == [{"feature": "001-x", "verdict": "needs_decision"}]
    assert "Secret rule of company B" not in text
    _, text_b = call(env, BOB, "pending_decisions")
    assert "company B" in text_b and "company A" not in text_b


def test_asking_for_another_companys_data_is_a_tool_error_not_a_leak(env):
    # verifies 018/FR-005
    err, text = call(env, ALICE, "list_rules", {"org": "bob-co", "status": "proposed"})
    assert err and "no company 'bob-co'" in text and "Secret rule" not in text
    err, text = call(env, ALICE, "get_review", {"feature": "001-x"})
    data = json.loads(text)
    assert not err and data["verdict"] == "needs_decision" and data["findings"][0]["rule"] == "CON001"


def test_the_other_read_tools(env):
    assert [o["slug"] for o in json.loads(call(env, ALICE, "list_organizations")[1])] == ["alice-co"]
    assert json.loads(call(env, ALICE, "list_features")[1])[0]["verdict"] == "needs_decision"
    assert json.loads(call(env, ALICE, "list_baselines")[1]) == [] and json.loads(call(env, ALICE, "list_drift")[1]) == []
    assert call(env, ALICE, "list_rules", {"status": "bogus"})[0] is True                                  # validated
    assert call(env, ALICE, "get_review")[0] is True                                                         # `feature` is required


# ------------------------------------------------------------------ checking a draft spec
def test_checking_a_draft_reviews_it_and_stores_nothing(env):
    # verifies 018/FR-008
    before = env.pg.rows("select (select count(*) from public.features) + (select count(*) from public.spec_snapshots) + (select count(*) from public.reviews);")
    spec = "# Feature Specification: Draft\n\n## Requirements\n\n- **FR-001**: The system MUST be fast\n- **FR-002**: The system MUST email the invitee within 60 seconds\n"
    err, text = call(env, ALICE, "check_spec", {"spec": spec})
    data = json.loads(text)
    assert not err and data["stored"] is False and data["summary"]["warning"] + data["summary"]["blocker"] >= 1
    assert any(f["rule"].startswith("QUA") and "FR-001" in (f["ids"] or []) for f in data["findings"])        # "fast" is not testable
    assert env.pg.rows("select (select count(*) from public.features) + (select count(*) from public.spec_snapshots) + (select count(*) from public.reviews);") == before
    assert call(env, ALICE, "check_spec", {"spec": "  "})[0] is True
    assert call(env, ALICE, "check_spec", {"spec": "x" * 300_000})[0] is True                                  # size cap


# ------------------------------------------------------------------ the guarantee that matters
def test_even_with_the_agents_access_the_database_refuses_a_decision(env):
    # verifies 018/FR-011, SC-002
    from speco_cloud.db import user_tx
    rid = env.pg.rows(f"select id from public.business_rules where org_id = '{env.ids['a']['org']}';")[0]
    with pytest.raises(Exception, match="agents cannot decide"):
        with user_tx(env.client.app.state.settings, ALICE, CLIENT) as conn:
            conn.execute("select public.decide_rule(%s, 'confirm')", (rid,))
    with user_tx(env.client.app.state.settings, ALICE) as conn:                                                 # the person herself can
        conn.execute("select public.decide_rule(%s, 'confirm')", (rid,))
    assert env.pg.rows(f"select status from public.business_rules where id = '{rid}';") == ["confirmed"]
