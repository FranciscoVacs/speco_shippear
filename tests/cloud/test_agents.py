"""Spec 018 · an AI agent connected through MCP reads what the person reads and decides nothing (D-012, FR-011).
An agent's access token is a Supabase OAuth token: it carries `client_id` and, per Supabase, the same reach as the person's session.
These tests use the real schema and prove the DATABASE refuses every decision for such a token, whatever the route."""
from __future__ import annotations

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

PERSON = "60000000-0000-0000-0000-00000000000a"
AGENT = "claude-connector-1"


@pytest.fixture(scope="module")
def world(pg):
    pg.psql(f"insert into auth.users (id, email) values ('{PERSON}', 'p@example.com');")
    org = pg.rows("select public.create_organization('Agents Co', 'agents-co');", PERSON)[0]
    inst = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '8800', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '880', 'acme/app') returning id;", "service")[0]
    pg.psql(f"insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha) values ('{org}', '{repo}', 'Only owners can invite members', 'k-a', 'permissions', 'high', 'spec', 'high', 'test', 'c'), ('{org}', '{repo}', 'Annual plans are refunded in 14 days', 'k-b', 'money', 'high', 'spec', 'high', 'test', 'c');", "service")
    rule = pg.rows(f"select id from public.business_rules where org_id = '{org}' order by seq limit 1;")[0]
    return {"org": org, "repo": repo, "rule": rule}


def test_an_agent_reads_what_the_person_reads(pg, world):
    # verifies 018/FR-005
    assert pg.rows(f"select count(*) from public.business_rules where org_id = '{world['org']}';", PERSON, client_id=AGENT) == ["2"]
    assert pg.rows("select count(*) from public.organizations;", PERSON, client_id=AGENT) == ["1"]


@pytest.mark.parametrize("sql", [
    "select public.decide_rule('{rule}', 'confirm');",
    "select public.decide_rule('{rule}', 'reject', null, 'no');",
    "select public.freeze_baseline('{org}', 'v1');",
    "select public.acknowledge_drift(gen_random_uuid(), 'fine');",
    "select public.set_code_consent('{repo}', true);",
    "select public.create_organization('Sneaky', 'sneaky-org');",
])
def test_every_decision_function_refuses_an_agent(pg, world, sql):
    # verifies 018/FR-011, SC-002
    assert "agents cannot decide" in pg.fails(sql.format(**world), PERSON, client_id=AGENT)


def test_direct_table_writes_are_refused_too(pg, world):
    # verifies 018/FR-011, SC-002
    org = world["org"]
    # a policy that hides rows from UPDATE/DELETE makes them touch nothing (no error); an INSERT that violates it is an error
    pg.psql(f"update public.organizations set name = 'Hacked' where id = '{org}'; delete from public.memberships where org_id = '{org}';", PERSON, client_id=AGENT)
    assert pg.rows(f"select name from public.organizations where id = '{org}';", PERSON) == ["Agents Co"]
    assert pg.rows(f"select count(*) from public.memberships where org_id = '{org}';", PERSON) == ["1"]
    assert "row-level security" in pg.fails(f"insert into public.memberships (org_id, user_id, role) values ('{org}', gen_random_uuid(), 'viewer');", PERSON, client_id=AGENT)


def test_the_same_person_without_an_agent_can_still_decide(pg, world):
    pg.psql(f"select public.decide_rule('{world['rule']}', 'confirm');", PERSON)
    assert pg.rows(f"select status from public.business_rules where id = '{world['rule']}';", PERSON) == ["confirmed"]
    pg.psql(f"select public.freeze_baseline('{world['org']}', 'v1');", PERSON)
    assert pg.rows(f"select count(*) from public.baselines where org_id = '{world['org']}';", PERSON) == ["1"]


def test_an_empty_client_id_is_not_an_agent(pg, world):
    # a first-party session has no client_id at all; an empty string must not be treated as an agent nor as a person with special reach
    assert pg.rows("select private.is_agent();", PERSON) == ["f"]
    assert pg.rows("select private.is_agent();", PERSON, client_id=AGENT) == ["t"]
