"""Spec 021 · referrals: a link, a pending referral that survives the sign-up, a reward only at the first result, and the ways cheating does not pay.
Real Postgres with the real migrations; the worker hook runs the real job."""
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
from test_portrait import FakeRepo  # noqa: E402

from speco_cloud import worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402

JWT_SECRET = "j" * 40
_n = [0]


def uid() -> str:
    _n[0] += 1
    return "50000000-0000-0000-0000-%012d" % _n[0]


def bearer(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


@pytest.fixture(scope="module")
def env(pg):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", github_app_id="42", github_private_key=pem,
                        supabase_jwt_secret=JWT_SECRET, app_url="https://app.test")
    fake = FakeRepo()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    return type("Env", (), {"pg": pg, "settings": settings, "gh": gh, "client": TestClient(create_app(settings, gh))})


def person(env, phone: str | None = None, age: str = "0 seconds") -> str:
    u = uid()
    ph = f"'{phone}'" if phone else "null"
    env.pg.psql(f"insert into auth.users (id, email, phone, created_at) values ('{u}', '{u}@example.com', {ph}, now() - interval '{age}');")
    return u


def company(env, user: str, slug: str | None = None) -> str:
    slug = slug or "co-" + user[-6:]
    return env.pg.rows(f"select public.create_organization('Co {slug}', '{slug}');", user)[0]


def code_of(env, user: str) -> str:
    return env.pg.rows("select public.my_referral_code();", user)[0]


def claim(env, code: str, user: str) -> bool:
    return env.pg.rows(f"select public.claim_referral('{code}');", user)[0] == "t"


def balance(env, org: str) -> int:
    return int(env.pg.rows(f"select coalesce(sum(amount - used), 0) from public.credit_grants where org_id = '{org}' and expires_at > now();")[0])


def activate(env, org: str) -> int:
    return int(env.pg.rows(f"select public.referral_activate('{org}');", "service")[0])


def summary(env, user: str) -> dict:
    import json
    return json.loads(env.pg.rows("select public.referral_summary();", user)[0])


@pytest.fixture
def setting(env):
    saved = dict(r.split("|") for r in env.pg.rows("select key, value from public.plan_settings;"))

    def set_(key: str, value: int):
        env.pg.psql(f"update public.plan_settings set value = {value} where key = '{key}';", "service")
    yield set_
    for k, v in saved.items():
        env.pg.psql(f"update public.plan_settings set value = {v} where key = '{k}';", "service")


# ------------------------------------------------------------------ FR-001: the code
def test_everyone_has_one_stable_hard_to_guess_code(env):
    a, b = person(env), person(env)
    ca = code_of(env, a)
    assert len(ca) == 12 and ca == code_of(env, a) and ca != code_of(env, b)
    env.pg.fails("select public.my_referral_code();", "anon")


# ------------------------------------------------------------------ FR-003, FR-004, FR-007: only a new, different person is recorded
def test_a_new_account_with_a_code_becomes_a_pending_referral(env):
    ref, new = person(env, "+5491100000001"), person(env, "+5491100000002")
    assert claim(env, code_of(env, ref), new)
    assert summary(env, ref)["signed_up"] == 1 and summary(env, ref)["activated"] == 0
    assert not claim(env, code_of(env, ref), new)                                # a person is invited at most once


@pytest.mark.parametrize("why", ["self", "unknown", "has_company", "old_account"])
def test_who_cannot_be_recorded(env, why):
    # verifies 021/FR-004, FR-007
    ref = person(env)
    code = code_of(env, ref)
    if why == "self":
        who = ref
    elif why == "unknown":
        who, code = person(env), "nosuchcode00"
    elif why == "has_company":
        who = person(env)
        company(env, who)                                                        # an account that already works in the product is not new
    else:
        who = person(env, age="3 days")                                          # the link was opened by someone who signed up long before
    assert not claim(env, code, who)
    assert summary(env, ref)["signed_up"] == 0


def test_the_same_phone_on_both_sides_is_refused_even_if_the_sign_in_provider_let_it_through(env):
    # verifies 021/FR-007
    env.pg.psql("alter table auth.users drop constraint users_phone_key;")
    try:
        a, b = person(env, "+5491100002001"), person(env, "+5491100002001")
        assert not claim(env, code_of(env, a), b)
    finally:
        env.pg.psql("delete from auth.users where phone = '+5491100002001'; alter table auth.users add constraint users_phone_key unique (phone);")


def test_an_agent_cannot_claim_or_read(env):
    ref, new = person(env), person(env)
    env.pg.fails(f"select public.claim_referral('{code_of(env, ref)}');", new, client_id="some-agent")
    env.pg.fails("select public.my_referral_code();", ref, client_id="some-agent")
    env.pg.fails("select public.referral_summary();", ref, client_id="some-agent")


def test_the_owner_can_turn_referrals_off_and_what_is_due_is_still_paid(env, setting):
    # verifies 021/FR-011
    ref, early, late = person(env), person(env), person(env)
    company(env, ref)
    assert claim(env, code_of(env, ref), early)
    setting("referrals_enabled", 0)
    assert not claim(env, code_of(env, ref), late)
    assert activate(env, company(env, early)) == 1                              # the reward already due is granted


# ------------------------------------------------------------------ FR-005, FR-006, FR-009, FR-012: the reward
def test_nothing_is_granted_at_sign_up_and_both_are_rewarded_once_at_the_first_result(env):
    # verifies 021/FR-005, FR-006, FR-012, SC-002
    ref, new = person(env), person(env)
    ref_org = company(env, ref)
    assert claim(env, code_of(env, ref), new)
    new_org = company(env, new)
    assert (balance(env, ref_org), balance(env, new_org)) == (50, 50)           # welcome and monthly only: no reward for just signing up
    assert activate(env, new_org) == 1
    assert (balance(env, ref_org), balance(env, new_org)) == (70, 70)
    assert activate(env, new_org) == 0 and balance(env, new_org) == 70          # once
    assert env.pg.rows(f"select count(*) from public.credit_grants where source = 'referral' and org_id in ('{ref_org}', '{new_org}');") == ["2"]
    s = summary(env, ref)
    assert (s["signed_up"], s["activated"], s["credits_earned"], s["cap_left"]) == (1, 1, 20, 9)
    assert env.pg.rows("select kind, body->>'credits' from public.notices where kind = 'referral_reward';", ref) == ["referral_reward|20"]


def test_a_company_with_no_referral_changes_nothing(env):
    u = person(env)
    org = company(env, u)
    assert activate(env, org) == 0 and balance(env, org) == 50


def test_earned_credits_expire_in_six_months_and_cannot_be_moved_or_cashed(env):
    # verifies 021/FR-009
    ref, new = person(env), person(env)
    ref_org = company(env, ref)
    claim(env, code_of(env, ref), new)
    new_org = company(env, new)
    activate(env, new_org)
    months = env.pg.rows(f"select round(extract(epoch from expires_at - now()) / 86400 / 30.4) from public.credit_grants where org_id = '{new_org}' and source = 'referral';")
    assert months == ["6"]
    env.pg.fails(f"update public.credit_grants set org_id = '{new_org}' where org_id = '{ref_org}' and source = 'referral';", ref)
    env.pg.fails(f"insert into public.credit_grants (org_id, source, amount, expires_at) values ('{ref_org}', 'referral', 500, now() + interval '1 day');", ref)


# ------------------------------------------------------------------ FR-008: the cap
def test_the_person_who_invites_is_capped_per_month_and_the_invited_company_is_still_rewarded(env, setting):
    # verifies 021/FR-008
    setting("referral_monthly_cap", 2)
    ref = person(env)
    ref_org = company(env, ref)
    news = []
    for _ in range(3):
        n = person(env)
        assert claim(env, code_of(env, ref), n)
        news.append(company(env, n))
    for org in news:
        assert activate(env, org) == 1
    assert [balance(env, o) for o in news] == [70, 70, 70]                       # all three invited companies were rewarded
    assert balance(env, ref_org) == 50 + 40                                       # the person who invited earned for two
    s = summary(env, ref)
    assert (s["activated"], s["credits_earned"], s["cap_left"]) == (3, 40, 0)


def test_the_most_a_person_can_earn_in_a_month_is_two_hundred(env):
    # verifies 021/SC-003
    ref = person(env)
    ref_org = company(env, ref)
    for _ in range(12):
        n = person(env)
        claim(env, code_of(env, ref), n)
        activate(env, company(env, n))
    assert balance(env, ref_org) == 50 + 200


# ------------------------------------------------------------------ FR-013: no company yet
def test_a_reward_due_before_the_person_has_a_company_is_held_for_the_first_one(env):
    ref, new = person(env), person(env)
    claim(env, code_of(env, ref), new)
    activate(env, company(env, new))
    assert summary(env, ref)["held"] == 1 and summary(env, ref)["credits_earned"] == 20
    first = company(env, ref)
    assert balance(env, first) == 50 + 20 and summary(env, ref)["held"] == 0
    second = company(env, ref, "second-" + ref[-6:])
    assert balance(env, second) == 0                                              # only once, and only to the first


# ------------------------------------------------------------------ FR-002, FR-010: the API
def test_the_public_page_learns_only_whether_a_code_is_real(env):
    # verifies 021/FR-002
    ref = person(env)
    code = code_of(env, ref)
    r = env.client.get(f"/api/referrals/check/{code}")
    assert r.status_code == 200 and r.json() == {"valid": True}
    assert env.client.get("/api/referrals/check/nope").json() == {"valid": False}


def test_the_summary_never_names_anyone(env):
    # verifies 021/FR-010
    ref, new = person(env, "+5491100003001"), person(env, "+5491100003002")
    company(env, ref)
    claim(env, code_of(env, ref), new)
    body = env.client.get("/api/referrals/me", headers=bearer(ref)).json()
    assert set(body) == {"code", "signed_up", "activated", "credits_earned", "held", "reward", "monthly_cap", "cap_left"}
    assert new not in str(body) and "+549" not in str(body)
    assert env.client.get("/api/referrals/me").status_code == 401


def test_claiming_through_the_api_before_creating_a_company(env):
    ref, new = person(env), person(env)
    code = code_of(env, ref)
    assert env.client.post("/api/referrals/claim", json={"code": code}, headers=bearer(new)).json() == {"recorded": True}
    assert env.client.post("/api/referrals/claim", json={"code": code}, headers=bearer(new)).json() == {"recorded": False}
    assert env.client.post("/api/referrals/claim", json={"code": code}, headers=bearer(ref)).json() == {"recorded": False}


# ------------------------------------------------------------------ SC-001: the worker hook
def test_the_first_portrait_job_of_the_invited_company_pays_both(env):
    # verifies 021/FR-005, FR-006, SC-001
    ref, new = person(env), person(env)
    ref_org = company(env, ref)
    claim(env, code_of(env, ref), new)
    org = company(env, new)
    inst = env.pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '{8000 + _n[0]}', 'acme', 'Organization') returning id;", "service")[0]
    repo = env.pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '{9000 + _n[0]}', 'acme/shop') returning id;", "service")[0]
    env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, payload) values ('{org}', '{repo}', 'portrait', '{{}}');", "service")
    out = worker.run_once(env.settings, env.gh)
    assert out["referrals"] == 1 and balance(env, org) == 70 and balance(env, ref_org) == 70
    env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, payload) values ('{org}', '{repo}', 'portrait', '{{}}');", "service")
    assert worker.run_once(env.settings, env.gh)["referrals"] == 0
