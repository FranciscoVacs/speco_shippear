"""Spec 020 · free plan with credits: the ledger, the gate, the caps, and that deterministic work never needs a credit.
Real Postgres with the real migrations; the model is a fake that reports how many tokens it used."""
from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
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

from speco_cloud import credits, worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402

JWT_SECRET = "j" * 40
A, B, C, D = ("40000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3, 4))


def bearer(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'c{i}@example.com');" for i, u in enumerate((A, B, C, D), 1)))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", github_app_id="42", github_private_key=pem,
                        supabase_jwt_secret=JWT_SECRET, app_url="https://app.test")
    fake = FakeRepo()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    org_a = pg.rows("select public.create_organization('Credits A', 'credits-a');", A)[0]
    return type("Env", (), {"pg": pg, "settings": settings, "gh": gh, "fake": fake, "org_a": org_a, "client": TestClient(create_app(settings, gh))})


def balance(env, org: str) -> int:
    return int(env.pg.rows(f"select coalesce(sum(amount - used), 0) from public.credit_grants where org_id = '{org}' and expires_at > now();")[0])


def bare_org(env, name: str, grants: list[tuple[int, str]] | None = None) -> str:
    """A company inserted by the service with no grants of its own, plus the given (amount, expires-in) grants."""
    org = env.pg.rows(f"insert into public.organizations (name, slug) values ('{name}', '{name.lower().replace(' ', '-')}') returning id;", "service")[0]
    env.pg.psql(f"delete from public.credit_grants where org_id = '{org}';", "service")
    for amount, expires in grants or []:
        env.pg.psql(f"insert into public.credit_grants (org_id, source, amount, expires_at) values ('{org}', 'welcome', {amount}, now() + interval '{expires}');", "service")
    return org


@pytest.fixture
def setting(env):
    """Changes plan_settings for one test and puts them back."""
    saved = dict(r.split("|") for r in env.pg.rows("select key, value from public.plan_settings;"))

    def set_(key: str, value: int):
        env.pg.psql(f"update public.plan_settings set value = {value} where key = '{key}';", "service")
    yield set_
    for k, v in saved.items():
        env.pg.psql(f"update public.plan_settings set value = {v} where key = '{k}';", "service")


# ------------------------------------------------------------------ FR-001, FR-003, FR-010: what a company starts with
def test_a_new_company_holds_its_welcome_and_its_monthly_credits(env):
    assert env.pg.rows(f"select source, amount from public.credit_grants where org_id = '{env.org_a}' order by source;") == ["monthly|30", "welcome|20"]
    assert balance(env, env.org_a) == 50


def test_the_second_company_of_the_same_person_gets_no_free_credits(env):
    # verifies 020/FR-010
    second = env.pg.rows("select public.create_organization('Credits A2', 'credits-a2');", A)[0]
    assert env.pg.rows(f"select free_plan from public.organizations where id = '{second}';") == ["f"]
    assert balance(env, second) == 0
    assert env.pg.rows(f"select free_plan from public.organizations where id = '{env.org_a}';") == ["t"]


def test_deleting_the_free_company_does_not_give_the_person_another_free_plan(env):
    # verifies 020/FR-010
    first = env.pg.rows("select public.create_organization('Credits B', 'credits-b');", B)[0]
    env.pg.psql(f"delete from public.organizations where id = '{first}';")
    again = env.pg.rows("select public.create_organization('Credits B again', 'credits-b-again');", B)[0]
    assert balance(env, again) == 0


def test_monthly_credits_are_granted_once_per_month_and_only_to_free_companies(env):
    org = bare_org(env, "Monthly Co")
    free2 = bare_org(env, "Not Free Co")
    env.pg.psql(f"update public.organizations set free_plan = false where id = '{free2}';", "service")
    for _ in range(3):
        env.pg.psql("select public.grant_monthly_credits();", "service")
    assert env.pg.rows(f"select count(*), sum(amount) from public.credit_grants where org_id = '{org}' and source = 'monthly';") == ["1|30"]
    assert balance(env, free2) == 0


# ------------------------------------------------------------------ FR-004, FR-005, FR-014: reserve, settle, release
def test_the_balance_is_reserved_before_the_call_and_charged_to_what_was_used(env):
    # verifies 020/FR-004, FR-005
    org = bare_org(env, "Settle Co", [(20, "10 days")])
    res = credits.reserve(env.settings, org, "portrait")
    assert balance(env, org) == 10                                            # the largest possible cost is held while the model runs
    res.settle(3)
    assert balance(env, org) == 17 and env.pg.rows(f"select status, reserved, charged from public.credit_reservations where id = '{res.id}';") == ["settled|10|3"]


def test_what_was_not_used_goes_back_to_the_grant_it_came_from(env):
    # verifies 020/FR-005
    org = bare_org(env, "Refund Co", [(4, "1 day"), (20, "10 days")])
    res = credits.reserve(env.settings, org, "portrait")                      # 4 from the first grant, 6 from the second
    assert env.pg.rows(f"select amount - used from public.credit_grants where org_id = '{org}' order by expires_at;") == ["0", "14"]
    res.settle(2)                                                              # 8 come back: the 6 and then 2 of the first
    assert env.pg.rows(f"select amount - used from public.credit_grants where org_id = '{org}' order by expires_at;") == ["2", "20"]


def test_soonest_to_expire_is_spent_first(env):
    org = bare_org(env, "Order Co", [(5, "10 days"), (5, "1 day")])
    credits.reserve(Settings(**{**env.settings.__dict__, "portrait_credits": 7}), org, "portrait")
    assert env.pg.rows(f"select amount - used from public.credit_grants where org_id = '{org}' order by expires_at;") == ["0", "3"]


def test_expired_credits_are_not_spendable(env):
    org = bare_org(env, "Expired Co", [(20, "10 days")])
    env.pg.psql(f"update public.credit_grants set expires_at = now() - interval '1 second' where org_id = '{org}';", "service")
    with pytest.raises(credits.CreditsRefused) as e:
        credits.reserve(env.settings, org, "portrait")
    assert e.value.code == "no_credits"


def test_an_action_the_balance_cannot_pay_is_refused_before_anything_is_called(env):
    # verifies 020/FR-004, SC-002
    org = bare_org(env, "Poor Co", [(9, "10 days")])
    called = []
    with pytest.raises(credits.CreditsRefused) as e:
        with credits.metered(env.settings, org, "portrait"):
            called.append(1)
    assert e.value.code == "no_credits" and not called and balance(env, org) == 9
    assert env.pg.rows(f"select count(*) from public.credit_reservations where org_id = '{org}';") == ["0"]


def test_a_failed_call_releases_everything(env):
    # verifies 020/FR-014
    org = bare_org(env, "Failing Co", [(20, "10 days")])
    with pytest.raises(RuntimeError):
        with credits.metered(env.settings, org, "portrait"):
            raise RuntimeError("the model is down")
    assert balance(env, org) == 20 and env.pg.rows(f"select status, charged from public.credit_reservations where org_id = '{org}';") == ["released|0"]


def test_the_model_client_reports_what_it_used_and_that_is_what_is_charged(env):
    # verifies 020/FR-005
    class Reports:
        def take_usage(self):
            return {"input": 12_000, "output": 1_000}                         # 12 000 + 5 x 1 000 = 17 000 weighted = 2 credits
    org = bare_org(env, "Usage Co", [(20, "10 days")])
    with credits.metered(env.settings, org, "portrait", Reports()) as res:
        pass
    assert res.spent == 2 and balance(env, org) == 18
    assert credits.credits_for(0, 0) == 0 and credits.credits_for(1, 0) == 1 and credits.credits_for(10_000, 0) == 1 and credits.credits_for(10_001, 0) == 2


def test_two_requests_at_once_for_a_balance_that_pays_one_are_served_one_after_the_other(env):
    # verifies 020/FR-004, FR-012
    org = bare_org(env, "Race Co", [(10, "10 days")])

    def go(_):
        try:
            return credits.reserve(env.settings, org, "portrait").id
        except credits.CreditsRefused as e:
            return e.code
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(go, range(2)))
    assert sorted(r == "no_credits" for r in results) == [False, True] and balance(env, org) == 0


def comp(env, org: str, plan: str) -> None:
    """Puts a company on a paid plan the way the operator does: no charge, the credits of the plan (spec 024)."""
    env.pg.psql(f"select public.start_plan('{org}', '{plan}', 'upgrade', 0, 'manual', null, false, null);", "service")


def test_a_company_on_a_paid_plan_is_metered_with_the_credits_of_its_plan(env):
    # verifies 024/FR-005
    org = bare_org(env, "Paid Co")
    env.pg.psql(f"update public.organizations set plan = 'pro' where id = '{org}';", "service")
    with pytest.raises(credits.CreditsRefused) as e:                           # a plan with no credits behind it is not a free pass (spec 024 FR-005)
        credits.reserve(env.settings, org, "portrait")
    assert e.value.code == "no_credits"
    comp(env, org, "pro")
    assert balance(env, org) == 600
    res = credits.reserve(env.settings, org, "portrait")
    assert res.id is not None
    res.settle(4)
    assert balance(env, org) == 596


# ------------------------------------------------------------------ FR-008, FR-009: the ceilings
def test_a_company_cannot_use_more_than_the_daily_cap(env, setting):
    # verifies 020/FR-008
    org = bare_org(env, "Daily Co", [(100, "10 days")])
    for _ in range(4):
        credits.reserve(env.settings, org, "portrait").settle(10)
    with pytest.raises(credits.CreditsRefused) as e:
        credits.reserve(env.settings, org, "portrait")
    assert e.value.code == "daily_cap" and balance(env, org) == 60
    setting("daily_cap", 100)
    credits.reserve(env.settings, org, "portrait")                            # the cap is data: raising it applies at once


def test_a_release_does_not_count_against_the_daily_cap(env):
    org = bare_org(env, "Release Co", [(100, "10 days")])
    for _ in range(6):
        credits.reserve(env.settings, org, "portrait").release()
    credits.reserve(env.settings, org, "portrait")


def test_when_the_monthly_budget_of_the_free_plan_is_used_the_model_pauses_for_free_companies_only(env, setting):
    # verifies 024/FR-005
    free = bare_org(env, "Budget Free", [(100, "10 days")])
    paid = bare_org(env, "Budget Paid")
    comp(env, paid, "team")
    env.pg.psql("update public.credit_reservations set status = 'released';", "service")        # start from an empty month
    setting("monthly_budget", 15)
    credits.reserve(env.settings, free, "portrait").settle(10)
    with pytest.raises(credits.CreditsRefused) as e:
        credits.reserve(env.settings, free, "portrait")
    assert e.value.code == "budget"
    assert credits.reserve(env.settings, paid, "portrait").id is not None     # the budget protects the free plan only (spec 024 FR-005)


# ------------------------------------------------------------------ FR-013, FR-012
def test_the_owner_is_told_once_when_less_than_a_fifth_is_left(env):
    # verifies 020/FR-013
    org = bare_org(env, "Low Co", [(30, "10 days")])
    env.pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{C}', 'owner');")
    credits.reserve(env.settings, org, "portrait").settle(10)
    assert env.pg.rows(f"select count(*) from public.notices where org_id = '{org}';") == ["0"]
    credits.reserve(env.settings, org, "portrait").settle(10)               # 10 of 30 left
    credits.reserve(env.settings, org, "portrait").settle(5)                # 5 of 30 left: under a fifth
    credits.reserve(env.settings, org, "turn").settle(1)                    # still under a fifth: told once, not twice
    assert env.pg.rows(f"select user_id, kind, body->>'balance' from public.notices where org_id = '{org}';") == [f"{C}|low_credits|5"]
    assert env.pg.rows(f"select count(*) from public.notices;", D) == ["0"]                            # nobody else sees it
    assert env.pg.rows(f"select count(*) from public.notices;", C) == ["1"]


def test_only_the_service_writes_the_ledger_and_only_owners_and_admins_read_it(env):
    # verifies 020/FR-012
    org = env.org_a
    for sql in (f"insert into public.credit_grants (org_id, source, amount, expires_at) values ('{org}', 'welcome', 999, now() + interval '1 day');",
                f"update public.credit_grants set used = 0 where org_id = '{org}';",
                f"select public.reserve_credits('{org}', 1, 'portrait');",
                "select public.grant_monthly_credits();"):
        env.pg.fails(sql, A)
    assert env.pg.rows(f"select count(*) from public.credit_grants where org_id = '{org}';", D) == ["0"]
    assert int(env.pg.rows(f"select count(*) from public.credit_grants where org_id = '{org}';", A)[0]) >= 2
    with pytest.raises(Exception):
        env.pg.psql(f"update public.credit_grants set used = amount + 1 where org_id = '{org}';", "service")        # a balance never goes below zero


# ------------------------------------------------------------------ FR-011: what the API shows
def test_the_usage_api_shows_balance_renewal_and_recent_uses_to_owners_and_admins_only(env):
    # verifies 020/FR-011
    org = bare_org(env, "Api Co", [(20, "10 days")])
    env.pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{A}', 'owner'), ('{org}', '{B}', 'viewer');")
    credits.reserve(env.settings, org, "portrait").settle(4)
    r = env.client.get(f"/api/orgs/{org}/credits", headers=bearer(A))
    assert r.status_code == 200
    body = r.json()
    assert body["balance"] == 16 and body["metered"] is True and body["recent"][0]["credits"] == 4 and body["next_renewal"].endswith("+00:00")
    assert env.client.get(f"/api/orgs/{org}/credits", headers=bearer(B)).status_code == 403
    assert env.client.get(f"/api/orgs/{org}/credits", headers=bearer(D)).status_code == 404
    assert env.client.get("/api/orgs/not-a-uuid/credits", headers=bearer(A)).status_code == 404
    assert env.client.get(f"/api/orgs/{org}/credits").status_code == 401


# ------------------------------------------------------------------ FR-002, FR-006, SC-004: the worker
class ReportingModel:
    def __init__(self):
        self.calls = 0

    def complete(self, system: str, user: str) -> str:
        self.calls += 1
        return json.dumps([])

    def take_usage(self):
        return {"input": 12_000, "output": 1_000} if self.calls else {"input": 0, "output": 0}


def test_the_portrait_is_charged_to_the_tokens_the_model_used_and_still_built_when_credits_run_out(env):
    # verifies 020/FR-002, FR-005, SC-002, SC-004
    org = bare_org(env, "Worker Credits", [(12, "10 days")])
    inst = env.pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '7900', 'acme', 'Organization') returning id;", "service")[0]
    repo = env.pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name, code_consent_at, code_consent_by) values ('{org}', '{inst}', '991', 'acme/shop', now(), '{D}') returning id;", "service")[0]
    model = ReportingModel()

    def run(kind: str):
        env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, payload) values ('{org}', '{repo}', '{kind}', '{{}}');", "service")
        return worker.run_once(env.settings, env.gh, model)

    out = run("portrait")
    assert out["code_analysis"] == "on" and out["credits"] == 2 and balance(env, org) == 10 and model.calls == 1
    out = run("portrait")                                                      # 10 left: pays one more run of 10, charged 2
    assert out["code_analysis"] == "on" and balance(env, org) == 8
    env.pg.psql(f"update public.credit_grants set used = amount where org_id = '{org}';", "service")
    out = run("portrait")                                                      # nothing left: the model pauses, the deterministic portrait is still built
    assert out["code_analysis"] == "paused: no_credits" and model.calls == 2 and out["proposed"] == 0 and out["credits"] == 0
    out = run("sync_repo")                                                     # and reviews never needed a credit
    assert "reviews" in out and out["inventory"] > 0
    assert env.pg.rows(f"select count(*) from public.credit_reservations where org_id = '{org}' and status = 'open';") == ["0"]
