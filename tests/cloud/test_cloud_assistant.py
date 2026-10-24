"""Spec 020 FR-004..FR-008, FR-014 · the assistant of a company is the first thing that spends 'turn' credits.
Real Postgres and the real service; the model is a fake that streams a canned answer and reports its tokens."""
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

from speco_cloud import assistant, credits  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402

JWT_SECRET = "j" * 40
OWNER, MEMBER, VIEWER, STRANGER = ("60000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3, 4))


def bearer(user: str, **extra) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600, **extra}, JWT_SECRET, algorithm="HS256")}


class FakeChat:
    """Streams two chunks and reports 2 000 tokens in and 500 out: 2 000 + 5 x 500 = 4 500 weighted = 1 credit."""

    def __init__(self):
        self.calls, self.system, self.messages, self.fail = 0, "", [], False

    def chat(self, system: str, messages: list[dict], usage: dict):
        self.calls += 1
        self.system, self.messages = system, messages
        yield "Hola "
        if self.fail:
            usage["input"] = 2000
            raise RuntimeError("provider down with a secret key sk-123")
        yield "mundo"
        usage["input"], usage["output"] = 2000, 500


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'a{i}@example.com');" for i, u in enumerate((OWNER, MEMBER, VIEWER, STRANGER), 1)))
    org = pg.rows("select public.create_organization('Assistant Co', 'assistant-co');", OWNER)[0]
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{MEMBER}', 'member'), ('{org}', '{VIEWER}', 'viewer');", OWNER)
    inst = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '7700', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '771', 'acme/app') returning id;", "service")[0]
    feat = pg.rows(f"insert into public.features (org_id, repo_id, key) values ('{org}', '{repo}', '001-invites') returning id;", "service")[0]
    snap = pg.rows(f"""insert into public.spec_snapshots (org_id, feature_id, commit_sha, files_hash, files) values ('{org}', '{feat}', 'abc', 'h', '{{"spec.md": "# Invitations\\nOnly owners invite."}}') returning id;""", "service")[0]
    report = json.dumps({"feature": "001-invites", "summary": {"blocker": 1, "warning": 0, "suggestion": 0}, "findings": [{"severity": "blocker", "rule": "COV001", "ids": ["FR-001"], "message": "FR-001 has no task", "location": {"file": "spec.md", "line": 3}}]})
    pg.psql(f"insert into public.reviews (org_id, snapshot_id, verdict, summary, report, engine_version) values ('{org}', '{snap}', 'blocked', '{{}}', '{report}', '0.1');", "service")
    pg.psql(f"""insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha) values ('{org}', '{repo}', 'Annual plans are refunded within 14 days', 'annual plans refunded', 'money', 'high', 'spec', 'high', 'spec@1', 'abc');""", "service")
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, app_url="https://app.test")
    model = FakeChat()
    return type("Env", (), {"pg": pg, "settings": settings, "org": org, "model": model, "client": TestClient(create_app(settings, chat_model=model))})


def ask(env, user=OWNER, org=None, **body):
    body.setdefault("messages", [{"role": "user", "content": "¿Qué espera mi decisión?"}])
    return env.client.post(f"/api/orgs/{org or env.org}/assistant", json=body, headers=bearer(user))


def events(r) -> list[dict]:
    return [json.loads(ln[6:]) for ln in r.text.split("\n\n") if ln.startswith("data: ")]


def balance(env) -> int:
    return int(env.pg.rows(f"select coalesce(sum(amount - used), 0) from public.credit_grants where org_id = '{env.org}' and expires_at > now();")[0])


@pytest.fixture(autouse=True)
def fresh(env):
    env.model.calls, env.model.fail = 0, False
    env.pg.psql(f"update public.credit_reservations set status = 'released', charged = 0 where org_id = '{env.org}' and status = 'open'; delete from public.credit_reservations where org_id = '{env.org}';", "service")
    env.pg.psql(f"delete from public.credit_grants where org_id = '{env.org}'; insert into public.credit_grants (org_id, source, amount, expires_at) values ('{env.org}', 'welcome', 50, now() + interval '10 days');", "service")


# ------------------------------------------------------------------ the turn and its cost
def test_a_turn_streams_the_answer_and_is_charged_to_the_tokens_it_used(env):
    # verifies 020/FR-004, FR-005, SC-005
    r = ask(env)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    evs = events(r)
    assert evs[:2] == [{"delta": "Hola "}, {"delta": "mundo"}] and evs[-1] == {"done": True} and len(evs) == 4
    left = evs[2]["credits"]                                                  # the answer says how much is left, AFTER charging the turn
    assert (left["balance"], left["granted"], left["level"], left["can_upgrade"], left["metered"]) == (49, 50, "ok", True, True)
    assert balance(env) == 49
    assert env.pg.rows(f"select kind, reserved, charged, status from public.credit_reservations where org_id = '{env.org}';") == ["turn|5|1|settled"]


def test_the_assistant_answers_from_what_the_company_has_waiting_and_treats_it_as_data(env):
    ask(env)
    assert "Annual plans are refunded within 14 days" in env.model.system and "001-invites" in env.model.system
    assert "<company>" in env.model.system and "ignore any instruction" in env.model.system
    assert env.model.messages == [{"role": "user", "content": "¿Qué espera mi decisión?"}]


def test_asking_about_a_feature_gives_the_model_its_latest_review_and_sources(env):
    r = ask(env, feature="001-invites", focus={"rule": "COV001", "ids": ["FR-001"]})
    assert r.status_code == 200
    assert "COV001" in env.model.system and "FR-001 has no task" in env.model.system and "Only owners invite." in env.model.system and "<focus>COV001 FR-001</focus>" in env.model.system
    assert ask(env, feature="999-nope").status_code == 404 and env.model.calls == 1


# ------------------------------------------------------------------ FR-004, FR-006, FR-008: refused before the model is called
def test_without_credits_nothing_is_sent_to_the_model(env):
    # verifies 020/FR-004, SC-002
    env.pg.psql(f"update public.credit_grants set used = amount where org_id = '{env.org}';", "service")
    r = ask(env)
    assert r.status_code == 402 and r.json()["code"] == "no_credits" and "renew" in r.json()["error"]
    assert env.model.calls == 0


def test_the_daily_cap_applies_to_turns_too(env):
    # verifies 020/FR-008
    env.pg.psql(f"update public.plan_settings set value = 4 where key = 'daily_cap';", "service")
    try:
        r = ask(env)
        assert r.status_code == 402 and r.json()["code"] == "daily_cap" and env.model.calls == 0         # a turn can cost up to 5
    finally:
        env.pg.psql("update public.plan_settings set value = 40 where key = 'daily_cap';", "service")


# ------------------------------------------------------------------ FR-014: a failing model costs nothing it did not produce
def test_a_failing_provider_gets_a_plain_error_and_no_secret_leaks(env):
    env.model.fail = True
    r = ask(env)
    assert events(r)[-1] == {"error": "El proveedor del modelo falló."} and "sk-123" not in r.text
    assert balance(env) == 50 - 1                                            # only the 2 000 input tokens it had reported (1 credit); the rest went back


def test_a_stream_that_produced_nothing_is_not_charged(env):
    # verifies 020/FR-014
    class Silent:
        def chat(self, system, messages, usage):
            raise RuntimeError("boom")
            yield ""
    c = TestClient(create_app(env.settings, chat_model=Silent()))
    r = c.post(f"/api/orgs/{env.org}/assistant", json={"messages": [{"role": "user", "content": "hola"}]}, headers=bearer(OWNER))
    assert events(r) == [{"error": "El proveedor del modelo falló."}] and balance(env) == 50


# ------------------------------------------------------------------ FR-007: the size of one turn
def test_one_turn_never_sends_more_than_forty_thousand_tokens(env):
    history = []
    for i in range(40):
        history += [{"role": "user", "content": "u" * 7000 + str(i)}, {"role": "assistant", "content": "a" * 7000}]
    history.append({"role": "user", "content": "la última pregunta"})
    ask(env, messages=history)
    sent = assistant.tokens(env.model.system) + sum(assistant.tokens(m["content"]) for m in env.model.messages)
    assert sent <= credits.TURN_MAX_INPUT_TOKENS
    assert env.model.messages[-1]["content"] == "la última pregunta" and env.model.messages[0]["role"] == "user"


def test_fit_turn_drops_old_messages_first_then_the_data():
    msgs = [{"role": "user", "content": "x" * 3000}, {"role": "assistant", "content": "y" * 3000}, {"role": "user", "content": "z" * 3000}]
    system, kept = assistant.fit_turn("S" * 6000, msgs, limit=3000)
    assert [m["content"][0] for m in kept] == ["z"] and len(system) == 0 + max(3000 - 1000, 0) * 3 and kept[0]["role"] == "user"


# ------------------------------------------------------------------ who may ask, and what is refused
def test_who_may_ask(env):
    assert ask(env, user=MEMBER).status_code == 200
    assert ask(env, user=VIEWER).status_code == 403
    assert ask(env, user=STRANGER).status_code == 404                        # not a member looks the same as not existing
    assert ask(env, org="not-a-uuid").status_code == 404
    assert env.client.post(f"/api/orgs/{env.org}/assistant", json={"messages": []}).status_code == 401
    assert env.client.post(f"/api/orgs/{env.org}/assistant", json={"messages": [{"role": "user", "content": "hola"}]}, headers=bearer(OWNER, client_id="an-agent")).status_code == 403
    assert env.model.calls == 1                                              # only the member's request reached the model


def test_bad_histories_are_refused_before_anything_is_reserved(env):
    for messages in ([], [{"role": "assistant", "content": "hola"}], [{"role": "user"}], "hola"):
        r = env.client.post(f"/api/orgs/{env.org}/assistant", json={"messages": messages}, headers=bearer(OWNER))
        assert r.status_code in (400, 422)
    assert env.pg.rows(f"select count(*) from public.credit_reservations where org_id = '{env.org}';") == ["0"] and env.model.calls == 0


def test_without_a_configured_model_the_assistant_says_so(env):
    c = TestClient(create_app(env.settings))
    r = c.post(f"/api/orgs/{env.org}/assistant", json={"messages": [{"role": "user", "content": "hola"}]}, headers=bearer(OWNER))
    assert r.status_code == 503 and r.json()["code"] == "assistant_unavailable"
    assert c.get("/api/assistant", headers=bearer(OWNER)).json()["available"] is False
    assert env.client.get("/api/assistant", headers=bearer(OWNER)).json() == {"available": True, "provider": "anthropic", "model": "claude-sonnet-5-5", "demo": False}


# ------------------------------------------------------------------ a reservation that never settled
def test_a_reservation_left_open_by_a_crash_is_released_after_a_while(env):
    res = credits.reserve(env.settings, env.org, "turn")
    assert balance(env) == 45
    env.pg.psql("select public.release_stale_reservations(30);", "service")
    assert balance(env) == 45                                                # too recent: still running
    env.pg.psql(f"update public.credit_reservations set created_at = now() - interval '2 hours' where id = '{res.id}';", "service")
    assert env.pg.rows("select public.release_stale_reservations(30);", "service") == ["1"]
    assert balance(env) == 50 and env.pg.rows(f"select status from public.credit_reservations where id = '{res.id}';") == ["released"]


# ------------------------------------------------------------------ the real streaming client
def test_the_anthropic_client_streams_text_and_reports_the_tokens_it_used():
    import httpx
    from speco_cloud.portrait.extractors import AnthropicClient
    sse = "\n".join([
        'event: message_start', 'data: {"type":"message_start","message":{"usage":{"input_tokens":1200,"output_tokens":1}}}', '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Ho"}}', '',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"la"}}', '',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}', '', ''])
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, content=sse.encode(), headers={"content-type": "text/event-stream"})
    client = AnthropicClient("k", "m", http=httpx.Client(transport=httpx.MockTransport(handler)))
    usage = {"input": 0, "output": 0}
    assert "".join(client.chat("sys", [{"role": "user", "content": "q"}], usage)) == "Hola"
    assert usage == {"input": 1200, "output": 42} and seen["body"]["stream"] is True and seen["body"]["system"] == "sys"


def test_a_stream_cut_short_is_charged_for_what_was_sent():
    import httpx
    from speco_cloud.portrait.extractors import AnthropicClient
    sse = 'data: {"type":"message_start","message":{"usage":{"input_tokens":900}}}\n\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"' + "a" * 300 + '"}}\n\n'
    client = AnthropicClient("k", "m", http=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=sse.encode()))))
    usage = {"input": 0, "output": 0}
    assert len("".join(client.chat("s", [{"role": "user", "content": "q"}], usage))) == 300 and usage == {"input": 900, "output": 100}


# ------------------------------------------------------------------ the indicator: how close is the limit (FR-015)
def status(env, user=OWNER, org=None):
    return env.client.get(f"/api/orgs/{org or env.org}/credits/status", headers=bearer(user))


def test_the_status_says_how_close_the_limit_is_and_when_it_resets(env):
    # verifies 020/FR-015
    body = status(env).json()
    assert (body["balance"], body["granted"], body["level"], body["metered"], body["can_upgrade"], body["turn_cost"]) == (50, 50, "ok", True, True, 5)
    assert body["next_renewal"].endswith("+00:00")
    env.pg.psql(f"update public.credit_grants set used = 41 where org_id = '{env.org}';", "service")             # 9 of 50 left: under a fifth
    assert status(env).json()["level"] == "near"
    env.pg.psql(f"update public.credit_grants set used = 46 where org_id = '{env.org}';", "service")             # 4 left: not enough for a turn (it reserves 5)
    assert status(env).json()["level"] == "full"
    env.pg.psql(f"update public.credit_grants set used = 50 where org_id = '{env.org}';", "service")
    assert status(env).json()["level"] == "full" and status(env).json()["balance"] == 0


def test_the_stream_warns_when_the_turn_took_the_company_near_its_limit(env):
    # verifies 020/FR-016
    env.pg.psql(f"update public.credit_grants set used = 40 where org_id = '{env.org}';", "service")             # 10 left; the turn costs 1 -> 9 of 50
    left = events(ask(env))[-2]["credits"]
    assert (left["balance"], left["level"]) == (9, "near")


def test_a_member_sees_the_summary_but_cannot_upgrade_and_a_viewer_sees_nothing(env):
    # verifies 020/FR-015, FR-017
    m = status(env, user=MEMBER)
    assert m.status_code == 200 and m.json()["can_upgrade"] is False and m.json()["balance"] == 50
    assert status(env, user=VIEWER).status_code == 403 and status(env, user=STRANGER).status_code == 404
    assert status(env, org="nope").status_code == 404 and env.client.get(f"/api/orgs/{env.org}/credits/status").status_code == 401


def test_a_company_on_a_paid_plan_is_metered_and_resets_when_its_period_ends(env):
    org = env.pg.rows("insert into public.organizations (name, slug) values ('Paid Status', 'paid-status') returning id;", "service")[0]
    env.pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{OWNER}', 'owner'); select public.start_plan('{org}', 'pro', 'upgrade', 0, 'manual', null, false, null);", "service")
    body = status(env, org=org).json()
    period_end = env.pg.rows(f"select period_end at time zone 'UTC' from public.subscriptions where org_id = '{org}';")[0]
    assert (body["metered"], body["level"], body["plan"], body["balance"]) == (True, "ok", "pro", 650)      # 600 of the plan + the 50 free credits it already held
    assert body["next_renewal"][:10] == period_end[:10] and body["billing"] is False


def test_a_company_without_free_credits_is_at_its_limit_from_the_start(env):
    org = env.pg.rows("insert into public.organizations (name, slug) values ('No Free', 'no-free') returning id;", "service")[0]
    env.pg.psql(f"update public.organizations set free_plan = false where id = '{org}'; delete from public.credit_grants where org_id = '{org}'; insert into public.memberships (org_id, user_id, role) values ('{org}', '{OWNER}', 'owner');", "service")
    body = status(env, org=org).json()
    assert (body["balance"], body["level"], body["free_plan"]) == (0, "full", False)


# ------------------------------------------------------------------ the upgrade button records the intention (there is no payment yet)
def test_asking_to_upgrade_is_recorded_once_a_day_per_place_and_only_for_owners_and_admins(env):
    # verifies 020/FR-017
    # verifies 024/FR-011
    def up(user, source="pill", org=None):
        return env.client.post(f"/api/orgs/{org or env.org}/upgrade-interest", json={"source": source}, headers=bearer(user))
    assert up(OWNER).status_code == 201 and up(OWNER).status_code == 201
    assert env.pg.rows(f"select source, user_id from public.upgrade_interest where org_id = '{env.org}';") == [f"pill|{OWNER}"]
    assert up(OWNER, "chat_limit").status_code == 201 and env.pg.rows(f"select count(*) from public.upgrade_interest where org_id = '{env.org}';") == ["2"]
    assert up(MEMBER).status_code == 403 and up(VIEWER).status_code == 403 and up(STRANGER).status_code == 404
    assert up(OWNER, "somewhere-else").status_code == 422
    env.pg.fails(f"select count(*) from public.upgrade_interest;", OWNER)                                            # nobody reads it from the app


# ------------------------------------------------------------------ the composer's choice of model and effort
class ChoosingChat(FakeChat):
    """Like FakeChat but takes the choice and reports bigger usage: 20 000 in + 5 x 3 000 out = 35 000 weighted at the base price."""

    def __init__(self):
        super().__init__()
        self.choices = []

    def chat(self, system: str, messages: list[dict], usage: dict, **choice):
        self.calls += 1
        self.choices.append(choice)
        yield "ok"
        usage["input"], usage["output"] = 20_000, 3_000


@pytest.fixture
def picking(env):
    from dataclasses import replace
    model = ChoosingChat()
    settings = replace(env.settings, models=("claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"))
    return type("Picking", (), {"model": model, "client": TestClient(create_app(settings, chat_model=model))})


def pick(env, picking, **body):
    body.setdefault("messages", [{"role": "user", "content": "¿Qué espera mi decisión?"}])
    return picking.client.post(f"/api/orgs/{env.org}/assistant", json=body, headers=bearer(OWNER))


def test_the_service_advertises_what_it_offers_only_when_configured(env, picking):
    assert "models" not in env.client.get("/api/assistant", headers=bearer(OWNER)).json()
    info = picking.client.get("/api/assistant", headers=bearer(OWNER)).json()
    assert [m["id"] for m in info["models"]] == ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] and info["model"] == "claude-sonnet-5-5"


def test_a_turn_with_a_choice_is_charged_by_the_price_of_the_model_that_answered(env, picking):
    for model, charged in (("claude-haiku-5-5", 1), ("claude-sonnet-5-5", 4), ("claude-opus-5-5", 7)):     # 35 000 weighted x 0.05 / x 1 / x 2, in credits of 10 000
        before = balance(env)
        assert events(pick(env, picking, model=model, effort="medium"))[-1] == {"done": True}
        assert before - balance(env) == charged, model
    assert picking.model.choices[0] == {"model": "claude-haiku-5-5", "effort": "medium", "max_tokens": 8_000}


def test_the_reservation_is_the_most_the_choice_can_spend(env, picking):
    pick(env, picking, model="claude-opus-5-5", effort="high")             # (40 000 + 5 x 16 000) x 2 / 10 000 = 24 credits held, 7 charged
    pick(env, picking, model="claude-haiku-5-5", effort="low")             # (40 000 + 5 x 4 000) x 0.05 / 10 000 = 0.3: one credit held, one charged
    assert env.pg.rows(f"select reserved, charged from public.credit_reservations where org_id = '{env.org}' order by created_at;") == ["24|7", "1|1"]


def test_a_choice_the_balance_cannot_cover_is_refused_before_the_model_is_called(env, picking):
    env.pg.psql(f"update public.credit_grants set used = 40 where org_id = '{env.org}';", "service")     # 10 left: enough for Haiku, not for Opus at high effort
    r = pick(env, picking, model="claude-opus-5-5", effort="high")
    assert r.status_code == 402 and r.json()["code"] == "no_credits" and picking.model.calls == 0
    assert events(pick(env, picking, model="claude-haiku-5-5", effort="high"))[-1] == {"done": True} and picking.model.calls == 1


@pytest.mark.parametrize("body,status", [({"model": "gpt-9"}, 400), ({"model": "claude-sonnet-5-5", "effort": "max"}, 400),
                                         ({"effort": 3}, 422), ({"model": 5}, 422)])                 # a wrong type never gets past the request model
def test_what_was_not_offered_is_refused_before_anything_is_reserved(env, picking, body, status):
    r = pick(env, picking, **body)
    assert r.status_code == status and picking.model.calls == 0 and balance(env) == 50
    assert status != 400 or r.json()["code"] == "bad_request"


def test_a_service_without_models_cannot_be_made_to_use_one(env):
    r = ask(env, model="claude-opus-5-5", effort="high")
    assert r.status_code == 400 and env.model.calls == 0 and balance(env) == 50
    assert ask(env).status_code == 200 and env.pg.rows(f"select reserved from public.credit_reservations where org_id = '{env.org}';") == ["5"]       # unchanged


def test_the_streaming_client_sends_the_chosen_model_and_effort():
    import httpx
    from speco_cloud.portrait.extractors import AnthropicClient
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(json.loads(req.content))
        return httpx.Response(200, content=b'data: {"type":"message_delta","usage":{"output_tokens":1}}\n\n')
    client = AnthropicClient("k", "claude-sonnet-5-5", http=httpx.Client(transport=httpx.MockTransport(handler)))
    list(client.chat("s", [{"role": "user", "content": "q"}], {"input": 0, "output": 0}))
    list(client.chat("s", [{"role": "user", "content": "q"}], {"input": 0, "output": 0}, max_tokens=16_000, model="claude-opus-5-5", effort="high"))
    assert (seen[0]["model"], seen[0]["max_tokens"], "output_config" in seen[0]) == ("claude-sonnet-5-5", 2000, False)
    assert (seen[1]["model"], seen[1]["max_tokens"], seen[1]["output_config"]) == ("claude-opus-5-5", 16_000, {"effort": "high"})
