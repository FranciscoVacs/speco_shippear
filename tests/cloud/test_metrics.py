"""Spec 022 · product metrics: the capture endpoints, the derived views and the report. Real Postgres with the real migrations."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

import jwt  # noqa: E402
import psycopg  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from speco_cloud import metrics_report as mr  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402

JWT_SECRET = "j" * 40
U1, U2, U3, U4, U5 = ("50000000-0000-0000-0000-00000000000%d" % i for i in range(1, 6))
MONTH = "2026-11"


def bearer(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'm{i}@example.com');" for i, u in enumerate((U1, U2, U3, U4, U5), 1)))
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, app_url="https://app.test")
    return type("Env", (), {"pg": pg, "settings": settings, "client": TestClient(create_app(settings))})


def conn(env):
    c = psycopg.connect(env.settings.database_url, row_factory=dict_row)
    c.execute("set role service_role")
    return c


def make_org(env, user: str, slug: str, signed_up: str, first_result_after_min: float | None = None, reviews: int = 0) -> str:
    """A company created on `signed_up`, with an owner. With `first_result_after_min`, `reviews` reviews: the first that many minutes after
    signing up and one more each following day."""
    org = env.pg.rows(f"insert into public.organizations (name, slug, created_at) values ('{slug}', '{slug}', '{signed_up}') returning id;", "service")[0]
    env.pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{user}', 'owner');", "service")
    if first_result_after_min is None:
        return org
    # the smallest chain of rows a review hangs from, in one place so a schema change breaks one helper and not every test
    conn_, repo, feat = (env.pg.rows(sql, "service")[0] for sql in (
        f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '{slug}', '{slug}', 'Organization') returning id;",
        f"insert into public.repositories (org_id, connection_id, external_id, full_name) select '{org}', id, '{slug}', 'x/{slug}' from public.connections where org_id = '{org}' returning id;",
        f"insert into public.features (org_id, repo_id, key) select '{org}', id, '001-x' from public.repositories where org_id = '{org}' returning id;"))
    del conn_, repo
    for i in range(max(reviews, 1)):
        snap = env.pg.rows(f"insert into public.spec_snapshots (org_id, feature_id, commit_sha, files_hash, files) values ('{org}', '{feat}', 'abc', '{slug}-{i}', '{{}}') returning id;", "service")[0]
        env.pg.psql(f"""insert into public.reviews (org_id, snapshot_id, verdict, summary, report, engine_version, created_at)
                        values ('{org}', '{snap}', 'ready', '{{}}', '{{}}', 'test', timestamptz '{signed_up}' + interval '{first_result_after_min} minutes' + {i} * interval '1 day');""", "service")
    return org


def test_acquisition_first_touch_wins(env):
    # verifies 022/FR-004
    r = env.client.post("/api/acquisition", json={"channel": "pr_footer", "door": "code"}, headers=bearer(U1))
    assert r.status_code == 201 and r.json() == {"recorded": True}
    assert env.client.post("/api/acquisition", json={"channel": "community:x"}, headers=bearer(U1)).json() == {"recorded": False}
    assert env.pg.rows(f"select channel from public.acquisition where user_id = '{U1}';") == ["pr_footer"]
    assert env.client.post("/api/acquisition", json={"channel": "Bad Channel!"}, headers=bearer(U2)).status_code == 422


def test_capture_tables_are_closed_to_people(env):
    # verifies 022/FR-011
    for t in ("acquisition", "pmf_responses", "marketing_spend", "metrics_excluded_orgs"):
        assert "permission denied" in env.pg.fails(f"select * from public.{t};", U1)
    assert "permission denied" in env.pg.fails("select * from metrics.org_facts;", U1)


def test_report_on_an_empty_database_is_honest(env):
    # verifies 022/FR-002, FR-009
    with conn(env) as c:
        text = mr.render(mr.collect(c, "2030-01", 0.04, 0.05, None, 0.8))
    assert "sin datos" in text and "LTV: no calculable" in text and "Sin respuestas" in text


def test_views_and_report(env):
    # verifies 022/FR-002, FR-003, FR-005, FR-008, SC-003
    fast = make_org(env, U1, "fast", "2026-11-03 10:00+00", first_result_after_min=3, reviews=4)     # activated in 3 min, 4 reviews: a habit
    slow = make_org(env, U2, "slow", "2026-11-04 10:00+00", first_result_after_min=90, reviews=1)    # activated, but not in 5 minutes
    make_org(env, U3, "never", "2026-11-05 10:00+00")                                              # signed up, never got a result
    internal = make_org(env, U4, "dogfood", "2026-11-06 10:00+00", first_result_after_min=1, reviews=1)
    env.pg.psql(f"insert into public.metrics_excluded_orgs (org_id, reason) values ('{internal}', 'speco on speco');", "service")
    env.pg.psql(f"insert into public.acquisition (user_id, channel, door) values ('{U2}', 'community:foo', 'idea'), ('{U3}', 'community:foo', 'idea') on conflict do nothing;", "service")
    env.pg.psql("insert into public.marketing_spend (month, channel, amount_usd) values ('2026-11-01', 'community:foo', 100);", "service")

    with conn(env) as c:
        d = mr.collect(c, MONTH, usd_per_credit=0.04, sms_usd=0.05, arpa=None, margin=0.8)
    assert d["funnel"]["signups"] == 3                                  # the excluded company is not counted
    assert d["funnel"]["activated"] == 2 and d["funnel"]["activated_fast"] == 1
    assert d["ttv"]["p50"] == pytest.approx(46.5, abs=0.1)              # median of 3 and 90 minutes
    assert d["habit"]["matured"] == 2 and d["habit"]["habit"] == 1
    segs = {(s["door"], s["channel"]): s for s in d["by_segment"]}
    assert segs[("idea", "community:foo")]["signups"] == 2 and segs[("idea", "community:foo")]["activated"] == 1
    assert d["cost"]["marketing_usd"] == 100.0 and round(d["cost"]["total_usd"], 2) == 100.15   # + 3 signups × 0.05 of SMS
    assert round(d["cost"]["per_activated"], 2) == 50.08

    text = mr.render(d)
    assert "⚠ n=3, no concluyente" in text and "50.08 USD" in text and "LTV: no calculable" in text
    assert fast and slow


def test_retention_and_churn_count_only_real_activity(env):
    with conn(env) as c:
        d = mr.collect(c, MONTH, 0.04, 0.05, arpa=None, margin=0.8)
    # `fast` reviewed on days 0..3 after signup: active in week 0 only, so week 1 retention is 0 of the cohorts old enough
    w1 = d["retention"]["w1"]
    assert w1["base"] >= 3 and w1["kept"] == 0
    assert d["churn"]["base"] == 0                                      # nobody was active in Sep–Oct, so there is nothing that could churn


def test_ellis_gate_and_verdict(env):
    # verifies 022/FR-007
    org = env.pg.rows(f"select org_id from metrics.org_facts limit 1;", "service")[0]
    users = [f"51000000-0000-0000-0000-{i:012d}" for i in range(40)]
    env.pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', 'e{i}@example.com');" for i, u in enumerate(users)))
    answers = ["very"] * 18 + ["somewhat"] * 14 + ["not"] * 6 + ["na"] * 2
    env.pg.psql("".join(f"insert into public.pmf_responses (org_id, user_id, round, disappointed) values ('{org}', '{u}', '2026-Q4', '{a}');" for u, a in zip(users, answers)), "service")
    with conn(env) as c:
        d = mr.collect(c, MONTH, 0.04, 0.05, None, 0.8)
    assert d["ellis"]["n"] == 38 and d["ellis"]["very"] == 18           # "I no longer use it" is not counted
    text = mr.render(d)
    assert "47 % «muy decepcionado»" in text and "señal de ajuste" in text


def test_ltv_is_a_labelled_scenario(env):
    # verifies 022/FR-009
    with conn(env) as c:
        d = mr.collect(c, MONTH, 0.04, 0.05, arpa=50, margin=0.8)
    # no churn base in the month: the scenario must not invent an LTV from nothing
    assert d["scenario"] is None
    assert d["churn"]["base"] == 0


def test_pmf_survey_endpoint_one_answer_per_quarter(env):
    # verifies 022/FR-006
    org = env.pg.rows("select public.create_organization('Survey', 'survey-co');", U5)[0]
    r = env.client.post(f"/api/orgs/{org}/pmf-survey", json={"disappointed": "very", "main_benefit": "decisions in one place"}, headers=bearer(U5))
    assert r.status_code == 201 and r.json()["recorded"] is True
    assert env.client.post(f"/api/orgs/{org}/pmf-survey", json={"disappointed": "not"}, headers=bearer(U5)).json()["recorded"] is False
    assert env.pg.rows(f"select disappointed from public.pmf_responses where user_id = '{U5}';") == ["very"]
    assert env.client.post(f"/api/orgs/{org}/pmf-survey", json={"disappointed": "maybe"}, headers=bearer(U5)).status_code == 422
    assert env.client.post(f"/api/orgs/{org}/pmf-survey", json={"disappointed": "very"}, headers=bearer(U1)).status_code == 404     # not a member of that company


def test_cli_writes_markdown(env, tmp_path):
    out = tmp_path / "r.md"
    assert mr.main(["--database-url", env.settings.database_url, "--service-role", "service_role", "--month", MONTH, "-o", str(out)]) == 0
    assert out.read_text().startswith("# Métricas de producto · 2026-11")
    with pytest.raises(SystemExit):
        mr.main(["--database-url", env.settings.database_url, "--service-role", "x; drop table y"])


def test_pmf_survey_is_due_only_for_someone_who_came_back(env):
    U6, U7 = "50000000-0000-0000-0000-000000000006", "50000000-0000-0000-0000-000000000007"
    env.pg.psql(f"insert into auth.users (id, email) values ('{U6}', 'm6@example.com'), ('{U7}', 'm7@example.com');")
    old = make_org(env, U6, "veteran", "2026-01-05 10:00+00", first_result_after_min=3, reviews=3)          # result months ago, active on three days
    new = make_org(env, U7, "newcomer", "2099-01-05 10:00+00", first_result_after_min=3, reviews=3)         # the "first result" has not happened yet (future dates)
    due = lambda org, u: env.client.get(f"/api/orgs/{org}/pmf-survey/due", headers=bearer(u)).json()
    assert due(old, U6) == {"due": True}
    assert due(new, U7) == {"due": False}
    env.client.post(f"/api/orgs/{old}/pmf-survey", json={"disappointed": "very"}, headers=bearer(U6))
    assert due(old, U6) == {"due": False}                                                                   # answered this quarter
    assert env.client.get(f"/api/orgs/{old}/pmf-survey/due", headers=bearer(U1)).status_code == 404        # not a member


# ---------------------------------------------------------------------------------------------- spec 025 · value delivered
def add_review(env, org: str, slug: str, n: int, findings: list[tuple[str, str, str]], at: str) -> None:
    """A review of the feature `slug` whose report holds `findings` as (fingerprint, rule, severity)."""
    import json
    feat = env.pg.rows(f"select f.id from public.features f join public.repositories r on r.id = f.repo_id where r.org_id = '{org}';", "service")[0]
    snap = env.pg.rows(f"insert into public.spec_snapshots (org_id, feature_id, commit_sha, files_hash, files) values ('{org}', '{feat}', 'v{n}', '{slug}-v{n}', '{{}}') returning id;", "service")[0]
    rep = json.dumps({"findings": [{"fingerprint": f, "rule": r, "severity": s, "message": f"{r} problem"} for f, r, s in findings]})
    summary = json.dumps({"blocker": sum(s == "blocker" for _, _, s in findings), "warning": sum(s == "warning" for _, _, s in findings), "suggestion": 0})
    env.pg.psql(f"insert into public.reviews (org_id, snapshot_id, verdict, summary, report, engine_version, created_at) "
                f"values ('{org}', '{snap}', 'blocked', '{summary}', '{rep}', 'test', '{at}');", "service")


@pytest.fixture(scope="module")
def value_env(env):
    u = "52000000-0000-0000-0000-000000000001"
    env.pg.psql(f"insert into auth.users (id, email) values ('{u}', 'v1@example.com');")
    org = make_org(env, u, "valueco", "2026-12-01 09:00+00", first_result_after_min=1, reviews=1)        # makes the feature chain; its empty review is the first
    # v1 (Dec 02): two blockers and a warning; v2 (Dec 10): one blocker and the warning are gone, a new suggestion-free spec otherwise
    add_review(env, org, "valueco", 1, [("aaaaaaaaaaaa", "COV001", "blocker"), ("bbbbbbbbbbbb", "PRD002", "blocker"), ("cccccccccccc", "QUA001", "warning")], "2026-12-02 10:00+00")
    add_review(env, org, "valueco", 2, [("aaaaaaaaaaaa", "COV001", "blocker")], "2026-12-10 10:00+00")
    feat = env.pg.rows(f"select id from public.features where org_id = '{org}';", "service")[0]
    return type("V", (), {"org": org, "user": u, "feature": feat})


def test_lifecycle_derives_resolved_findings(env, value_env):
    # verifies 025/FR-001
    rows = env.pg.rows(f"select fingerprint || ':' || (resolved_at is not null)::text from metrics.finding_lifecycle where org_id = '{value_env.org}' order by fingerprint;", "service")
    assert rows == ["aaaaaaaaaaaa:false", "bbbbbbbbbbbb:true", "cccccccccccc:true"]       # still present in the latest review vs. gone from it


def test_value_report_counts_only_what_was_resolved(env, value_env):
    # verifies 025/FR-001, FR-002
    with conn(env) as c:
        v = mr.collect_value(c, "2026-12", 4, 16, org_id=value_env.org)
    assert v["resolved"]["blockers"] == 1 and v["resolved"]["warnings"] == 1 and v["resolved"]["decisions_protected"] == 1 and v["resolved"]["contradictions"] == 0
    assert v["open_blockers"] == 1 and v["hours"] is None                                 # no answers: no hours invented
    assert "Sin respuestas del cliente" in mr.render_value(v)
    with conn(env) as c:
        assert mr.collect_value(c, "2026-11", 4, 16, org_id=value_env.org)["resolved"]["blockers"] == 0     # resolved in December, not November


def test_counterfactual_endpoint_and_hours(env, value_env):
    base = f"/api/orgs/{value_env.org}/resolved-findings"
    pending = env.client.get(f"{base}/pending", headers=bearer(value_env.user)).json()
    assert {p["fingerprint"] for p in pending} == {"bbbbbbbbbbbb", "cccccccccccc"}         # the unresolved blocker is not asked about
    ok = env.client.post(f"{base}/bbbbbbbbbbbb/outcome", json={"feature_id": value_env.feature, "answer": "yes"}, headers=bearer(value_env.user))
    assert ok.status_code == 201 and ok.json() == {"recorded": True}
    assert env.client.post(f"{base}/bbbbbbbbbbbb/outcome", json={"feature_id": value_env.feature, "answer": "no"}, headers=bearer(value_env.user)).json() == {"recorded": False}
    assert env.client.post(f"{base}/aaaaaaaaaaaa/outcome", json={"feature_id": value_env.feature, "answer": "yes"}, headers=bearer(value_env.user)).status_code == 404    # not resolved
    assert env.client.post(f"{base}/bbbbbbbbbbbb/outcome", json={"feature_id": value_env.feature, "answer": "maybe"}, headers=bearer(value_env.user)).status_code == 422
    assert env.client.get(f"{base}/pending", headers=bearer(U1)).status_code == 404       # not a member
    assert {p["fingerprint"] for p in env.client.get(f"{base}/pending", headers=bearer(value_env.user)).json()} == {"cccccccccccc"}
    with conn(env) as c:
        v = mr.collect_value(c, "2026-12", 4, 16, org_id=value_env.org)
    assert v["outcomes"]["yes"] == 1 and v["hours"]["low"] == 4 and v["hours"]["high"] == 16
    assert "Retrabajo evitado, estimado: 4 a 16 horas" in mr.render_value(v)


def test_outcomes_table_is_closed_and_cli_takes_org(env, value_env, tmp_path):
    # verifies 025/FR-008
    assert "permission denied" in env.pg.fails("select * from public.finding_outcomes;", value_env.user)
    assert "permission denied" in env.pg.fails("select * from metrics.finding_lifecycle;", value_env.user)
    out = tmp_path / "v.md"
    assert mr.main(["--database-url", env.settings.database_url, "--service-role", "service_role", "--month", "2026-12", "--org", value_env.org, "-o", str(out)]) == 0
    assert out.read_text().startswith("## Valor entregado")
    with pytest.raises(SystemExit):
        mr.main(["--database-url", env.settings.database_url, "--org", "x'; drop table y; --"])
