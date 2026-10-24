"""Spec 024 · billing and plan upgrades with the simulated payment. Real Postgres and the real service.
The plan changes only after an accepted charge; the credits of the plan are what the gate of spec 020 meters; nothing is charged or granted twice."""
from __future__ import annotations

import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud import billing, credits  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402

JWT_SECRET = "j" * 40
OWNER, ADMIN, MEMBER, VIEWER, STRANGER = ("70000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3, 4, 5))
MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261020000001_billing.sql"
N = 0


def bearer(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'b{i}@example.com');" for i, u in enumerate((OWNER, ADMIN, MEMBER, VIEWER, STRANGER), 1)))
    on = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, app_url="https://app.test", billing_provider="simulated")
    off = Settings(database_url=on.database_url, github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, app_url="https://app.test")
    provider = billing.SimulatedProvider()
    return type("Env", (), {"pg": pg, "settings": on, "provider": provider, "client": TestClient(create_app(on, payments=provider)), "off": TestClient(create_app(off))})


def company(env) -> str:
    """A free company with an owner, an admin, a member and a viewer, with no free credits left so only the plan can pay for the model."""
    global N
    N += 1
    org = env.pg.rows(f"insert into public.organizations (name, slug) values ('Bill {N}', 'bill-{N}') returning id;", "service")[0]
    env.pg.psql(f"delete from public.credit_grants where org_id = '{org}'; insert into public.memberships (org_id, user_id, role) values "
                f"('{org}', '{OWNER}', 'owner'), ('{org}', '{ADMIN}', 'admin'), ('{org}', '{MEMBER}', 'member'), ('{org}', '{VIEWER}', 'viewer');", "service")
    return org


def go(env, org, plan, user=OWNER, **extra):
    return env.client.post(f"/api/orgs/{org}/billing/plan", json={"plan": plan, **extra}, headers=bearer(user))


def balance(env, org) -> int:
    return int(env.pg.rows(f"select coalesce(sum(amount - used), 0) from public.credit_grants where org_id = '{org}' and expires_at > now();")[0])


def plan_of(env, org) -> str:
    return env.pg.rows(f"select plan from public.organizations where id = '{org}';")[0]


def invoices(env, org) -> list[str]:
    return env.pg.rows(f"select kind || ':' || plan || ':' || status || ':' || amount_cents from public.invoices where org_id = '{org}' order by created_at, number;")


def period_end(env, org) -> datetime:
    end = env.pg.rows(f"select to_char(period_end at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') from public.subscriptions where org_id = '{org}';")[0]
    return datetime.fromisoformat(end).replace(tzinfo=timezone.utc)


def after_period(env, org, days: int = 0) -> datetime:
    """A moment just after the period of the company ends (plus `days`), for the worker to run at."""
    return period_end(env, org) + timedelta(days=days, minutes=5)


# ------------------------------------------------------------------ FR-001, FR-011: the price list, and billing off by default
def test_the_price_list_says_what_each_plan_costs_and_gives(env):
    # verifies 024/FR-001
    r = env.client.get("/api/billing/plans", headers=bearer(OWNER)).json()
    assert (r["enabled"], r["simulated"]) == (True, True)
    assert [(p["plan"], p["price_cents"], p["period_credits"], p["daily_cap"]) for p in r["plans"]] == [("hobby", 0, 0, 40), ("pro", 2900, 600, 120), ("team", 9900, 2400, 480)]
    assert env.client.get("/api/billing/plans").status_code == 401


def test_without_a_provider_nothing_is_for_sale_and_the_company_is_untouched(env):
    # verifies 024/FR-011
    org = company(env)
    assert env.off.get("/api/billing/plans", headers=bearer(OWNER)).json()["enabled"] is False
    r = env.off.post(f"/api/orgs/{org}/billing/plan", json={"plan": "pro"}, headers=bearer(OWNER))
    assert (r.status_code, r.json()["code"], plan_of(env, org)) == (404, "billing_disabled", "hobby")
    assert env.off.get(f"/api/orgs/{org}/credits/status", headers=bearer(OWNER)).json()["billing"] is False
    assert env.client.get(f"/api/orgs/{org}/credits/status", headers=bearer(OWNER)).json()["billing"] is True


def test_an_unknown_provider_stops_the_service_from_starting():
    with pytest.raises(ValueError):
        billing.provider_from_settings(Settings(database_url="x", github_webhook_secret="x", billing_provider="stripe"))
    assert billing.provider_from_settings(Settings(database_url="x", github_webhook_secret="x")) is None


# ------------------------------------------------------------------ US1: upgrade and get more room
def test_an_accepted_upgrade_changes_the_plan_and_gives_its_credits_so_the_model_answers_again(env):
    # verifies 024/FR-002
    org = company(env)
    with pytest.raises(credits.CreditsRefused):                                           # at zero, the model is paused
        credits.reserve(env.settings, org, "turn")
    r = go(env, org, "pro")
    assert (r.status_code, r.json()["result"], r.json()["amount_cents"]) == (200, "upgraded", 2900)
    assert plan_of(env, org) == "pro" and balance(env, org) == 600
    assert invoices(env, org) == ["upgrade:pro:paid:2900"]
    assert env.pg.rows(f"select simulated, number like 'SIM-%' from public.invoices where org_id = '{org}';") == ["t|t"]            # FR-012
    credits.reserve(env.settings, org, "turn").settle(3)
    st = env.client.get(f"/api/orgs/{org}/credits/status", headers=bearer(MEMBER)).json()
    assert (st["plan"], st["balance"], st["level"]) == ("pro", 597, "ok")
    assert st["next_renewal"][:16] == period_end(env, org).isoformat()[:16]                # FR-016: the reset is the end of the period


def test_a_paid_company_has_the_daily_cap_of_its_plan_and_not_the_monthly_budget_of_the_free_one(env):
    # verifies 024/FR-005
    org = company(env)
    go(env, org, "pro")
    for _ in range(12):
        credits.reserve(env.settings, org, "portrait").settle(10)                         # 120 credits today: the cap of Pro
    with pytest.raises(credits.CreditsRefused) as e:
        credits.reserve(env.settings, org, "turn")
    assert e.value.code == "daily_cap"
    team = company(env)
    go(env, team, "team")
    env.pg.psql("update public.plan_settings set value = 0 where key = 'monthly_budget';", "service")
    try:
        credits.reserve(env.settings, team, "turn").settle(1)                             # a budget of zero pauses the free plan only
    finally:
        env.pg.psql("update public.plan_settings set value = 5000 where key = 'monthly_budget';", "service")


def test_going_from_pro_to_team_pays_the_difference_for_the_unused_part_and_never_less_than_zero(env):
    # verifies 024/FR-004
    org = company(env)
    go(env, org, "pro")
    r = go(env, org, "team").json()
    assert 6900 < r["amount_cents"] <= 7000                                               # 9900 minus (almost) all of the 2900 of a period that just began
    assert plan_of(env, org) == "team" and balance(env, org) == 600 + 2400                # the credits of Pro are not taken back
    start, end = datetime(2026, 1, 1, tzinfo=timezone.utc), datetime(2026, 1, 31, tzinfo=timezone.utc)
    assert billing.prorated_charge(9900, 2900, start, end, start + timedelta(days=15)) == 9900 - 1450
    assert billing.prorated_charge(9900, 2900, start, end, end) == 9900 and billing.prorated_charge(2900, 9900, start, end, start) == 0


# ------------------------------------------------------------------ US2: a declined payment changes nothing
def test_a_declined_payment_changes_nothing_and_leaves_a_failed_invoice(env):
    # verifies 024/FR-003, SC-002
    org = company(env)
    r = go(env, org, "pro", simulate="decline")
    assert (r.status_code, r.json()["code"]) == (402, "payment_declined")
    assert plan_of(env, org) == "hobby" and balance(env, org) == 0
    assert invoices(env, org) == ["upgrade:pro:failed:2900"]
    assert env.pg.rows(f"select count(*) from public.subscriptions where org_id = '{org}';") == ["0"]
    assert go(env, org, "pro").status_code == 200                                         # and the next try can work


def test_the_same_upgrade_is_charged_once_and_grants_once(env):
    # verifies 024/FR-014, SC-003
    org = company(env)
    assert go(env, org, "pro").status_code == 200 and go(env, org, "pro").status_code == 409          # a double click
    sql = f"select public.start_plan('{org}', 'team', 'upgrade', 9900, 'simulated', 'x', true, 'same-key');"
    with ThreadPoolExecutor(2) as pool:                                                   # two requests at the same moment with the same key
        list(pool.map(lambda _: env.pg.psql(sql, "service"), range(2)))
    assert env.pg.rows(f"select count(*) from public.invoices where org_id = '{org}' and idempotency_key = 'same-key';") == ["1"]
    assert env.pg.rows(f"select count(*) from public.credit_grants where org_id = '{org}' and source = 'plan';") == ["2"]       # Pro's and Team's, once each


def test_a_plan_that_does_not_exist_or_a_made_up_outcome_is_refused(env):
    org = company(env)
    assert go(env, org, "gold").status_code == 422
    assert go(env, org, "pro", simulate="free").status_code == 422
    assert plan_of(env, org) == "hobby"


# ------------------------------------------------------------------ FR-013: who may see and change
def test_only_owners_and_admins_see_the_billing_and_change_the_plan_and_only_the_service_writes_it(env):
    # verifies 024/FR-013
    org = company(env)
    assert go(env, org, "pro", user=MEMBER).status_code == 403 and go(env, org, "pro", user=VIEWER).status_code == 403 and go(env, org, "pro", user=STRANGER).status_code == 404
    assert plan_of(env, org) == "hobby"
    assert go(env, org, "pro", user=ADMIN).status_code == 200
    got = env.client.get(f"/api/orgs/{org}/billing", headers=bearer(ADMIN)).json()
    assert (got["plan"], got["simulated"], [i["status"] for i in got["invoices"]], got["subscription"]["plan"]) == ("pro", True, ["paid"], "pro")
    assert env.client.get(f"/api/orgs/{org}/billing", headers=bearer(MEMBER)).status_code == 403
    assert env.client.get(f"/api/orgs/{org}/billing", headers=bearer(STRANGER)).status_code == 404
    assert env.pg.rows(f"select count(*) from public.invoices where org_id = '{org}';", MEMBER) == ["0"]          # the policy says so too
    assert env.pg.rows(f"select count(*) from public.invoices where org_id = '{org}';", OWNER) == ["1"]
    for sql in (f"update public.organizations set plan = 'team' where id = '{org}';", f"update public.subscriptions set plan = 'team' where org_id = '{org}';",
                f"insert into public.invoices (org_id, number, kind, plan, amount_cents, status, provider, simulated, period_start, period_end) values ('{org}', 'x', 'upgrade', 'pro', 0, 'paid', 'x', true, now(), now());",
                f"select public.start_plan('{org}', 'team', 'upgrade', 0, 'x', null, false, 'k');"):
        env.pg.fails(sql, OWNER)                                                          # nobody but the service writes billing
    assert plan_of(env, org) == "pro"


# ------------------------------------------------------------------ US3: renew, downgrade, cancel
def test_a_renewal_charges_once_and_grants_once_and_the_credits_not_used_are_gone(env):
    # verifies 024/FR-006, SC-003
    org = company(env)
    go(env, org, "pro")
    credits.reserve(env.settings, org, "portrait").settle(5)
    when = after_period(env, org)
    assert billing.renew_due(env.settings, env.provider, when - timedelta(days=2)) == {"renewed": 0, "declined": 0, "ended": 0, "waiting": 0}
    assert billing.renew_due(env.settings, env.provider, when)["renewed"] >= 1
    assert invoices(env, org) == ["upgrade:pro:paid:2900", "renewal:pro:paid:2900"]
    assert balance(env, org) == 600                                                       # the 595 left of the first period ended and a new 600 began
    assert period_end(env, org) > when                                                    # the next period is one month on
    assert billing.renew_due(env.settings, env.provider, when)["renewed"] == 0
    assert balance(env, org) == 600 and len(invoices(env, org)) == 2                      # running it again changes nothing (FR-006)


def test_a_lower_plan_or_a_cancellation_waits_for_the_end_of_the_period_and_can_be_undone(env):
    # verifies 024/FR-007
    org = company(env)
    go(env, org, "team")
    assert go(env, org, "pro").json()["result"] == "scheduled"
    assert plan_of(env, org) == "team" and balance(env, org) == 2400                      # nothing is taken away yet
    assert go(env, org, "team").json()["result"] == "resumed"
    assert env.pg.rows(f"select coalesce(scheduled_plan, '-') from public.subscriptions where org_id = '{org}';") == ["-"]
    assert go(env, org, "pro").json()["result"] == "scheduled"
    assert billing.renew_due(env.settings, env.provider, after_period(env, org))["renewed"] >= 1
    assert plan_of(env, org) == "pro" and invoices(env, org)[-1] == "renewal:pro:paid:2900" and balance(env, org) == 600
    assert go(env, org, "hobby").json()["result"] == "scheduled" and plan_of(env, org) == "pro"
    assert go(env, org, "pro").json()["result"] == "resumed" and go(env, org, "hobby").json()["result"] == "scheduled"
    assert billing.renew_due(env.settings, env.provider, after_period(env, org))["ended"] >= 1
    assert plan_of(env, org) == "hobby" and balance(env, org) == 0                        # and the model pauses again
    assert env.pg.rows(f"select count(*) from public.subscriptions where org_id = '{org}';") == ["0"]
    assert env.pg.rows(f"select count(*) from public.notices where org_id = '{org}' and kind = 'plan_ended';") == ["1"]
    with pytest.raises(credits.CreditsRefused):
        credits.reserve(env.settings, org, "turn")
    assert go(env, org, "pro").status_code == 200 and plan_of(env, org) == "pro"          # coming back later is a new upgrade


def test_a_declined_renewal_keeps_the_plan_three_days_tells_the_owners_once_and_then_ends_it(env):
    # verifies 024/FR-008
    org = company(env)
    go(env, org, "pro")
    provider = billing.SimulatedProvider({org})
    first = after_period(env, org)
    assert billing.renew_due(env.settings, provider, first)["declined"] == 1
    assert plan_of(env, org) == "pro" and balance(env, org) == 600                        # access is kept: the credits last through the grace days
    assert env.pg.rows(f"select status from public.subscriptions where org_id = '{org}';") == ["past_due"]
    notices = f"select count(*) from public.notices where org_id = '{org}' and kind = 'payment_failed';"
    assert env.pg.rows(notices) == ["1"]
    assert billing.renew_due(env.settings, provider, first + timedelta(hours=3))["waiting"] == 1       # one try a day, not one an hour
    assert billing.renew_due(env.settings, provider, first + timedelta(days=1, hours=1))["declined"] == 1
    assert env.pg.rows(notices) == ["1"]                                                  # told once
    provider.decline_orgs.clear()
    assert billing.renew_due(env.settings, provider, first + timedelta(days=2, hours=2))["renewed"] == 1       # the payment works again inside the grace
    assert env.pg.rows(f"select status from public.subscriptions where org_id = '{org}';") == ["active"]
    provider.decline_orgs.add(org)
    nxt = after_period(env, org)
    assert billing.renew_due(env.settings, provider, nxt)["declined"] == 1
    assert billing.renew_due(env.settings, provider, nxt + timedelta(days=3, hours=1))["ended"] == 1
    assert plan_of(env, org) == "hobby" and balance(env, org) == 0


# ------------------------------------------------------------------ FR-015: companies that were paid before billing existed
def test_a_company_given_a_plan_by_the_operator_renews_without_a_charge_even_with_billing_off(env):
    # verifies 024/FR-015
    org = company(env)
    env.pg.psql(f"select public.start_plan('{org}', 'team', 'upgrade', 0, 'manual', null, false, null);", "service")
    credits.reserve(env.settings, org, "turn").settle(1)
    assert billing.renew_due(env.settings, None, after_period(env, org))["renewed"] >= 1
    assert invoices(env, org)[-1] == "renewal:team:paid:0"
    assert env.pg.rows(f"select simulated from public.invoices where org_id = '{org}' order by created_at desc limit 1;") == ["f"]


def test_the_migration_gives_a_company_that_was_paid_before_a_subscription_and_its_credits(env):
    # verifies 024/FR-015
    org = env.pg.rows("insert into public.organizations (name, slug, plan) values ('Old Paid', 'old-paid', 'pro') returning id;", "service")[0]
    env.pg.psql(f"delete from public.credit_grants where org_id = '{org}';", "service")
    sql = MIGRATION.read_text()
    env.pg.psql(sql[sql.index("insert into public.subscriptions (org_id, plan, provider"):])         # the part of the migration that handles them
    assert env.pg.rows(f"select provider || ':' || plan from public.subscriptions where org_id = '{org}';") == ["manual:pro"]
    assert balance(env, org) == 600
    env.pg.psql(sql[sql.index("insert into public.subscriptions (org_id, plan, provider"):])
    assert balance(env, org) == 600                                                       # and running it again gives nothing more
    credits.reserve(env.settings, org, "turn").settle(1)
