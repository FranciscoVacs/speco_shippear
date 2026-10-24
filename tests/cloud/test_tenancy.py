"""Spec 013 · multi-tenant schema, tested against a real Postgres with the Supabase pieces stubbed (see cluster_fixture.py).
Every test is about something that must NOT be possible: another company's rows, an unauthorized decision, a rewritten history."""
from __future__ import annotations

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

ALICE = "00000000-0000-0000-0000-00000000000a"   # owner of org A
BOB = "00000000-0000-0000-0000-00000000000b"     # approver in A
CAROL = "00000000-0000-0000-0000-00000000000c"   # viewer in A
DAVE = "00000000-0000-0000-0000-00000000000d"    # owner of org B
ERIN = "00000000-0000-0000-0000-00000000000e"    # admin in A


@pytest.fixture(scope="module")
def world(pg):
    """Two companies with the same shape of data: A (alice, bob, carol, erin) and B (dave)."""
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', '{n}@example.com');" for u, n in
                    [(ALICE, "alice"), (BOB, "bob"), (CAROL, "carol"), (DAVE, "dave"), (ERIN, "erin")]))
    org_a = pg.rows("select public.create_organization('Acme', 'acme');", ALICE)[0]
    org_b = pg.rows("select public.create_organization('Beta', 'beta');", DAVE)[0]
    pg.psql(f"""insert into public.memberships (org_id, user_id, role) values
                ('{org_a}', '{BOB}', 'approver'), ('{org_a}', '{CAROL}', 'viewer'), ('{org_a}', '{ERIN}', 'admin');""", ALICE)
    ids = {}
    for tag, org in (("a", org_a), ("b", org_b)):
        inst, repo, feat, snap = (pg.rows(sql, "service")[0] for sql in (
            f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '{1000 if tag == 'a' else 2000}', 'acme-{tag}', 'Organization') returning id;",
            f"insert into public.repositories (org_id, connection_id, external_id, full_name) select '{org}', id, '{1 if tag == 'a' else 2}', 'org-{tag}/app' from public.connections where org_id = '{org}' returning id;",
            f"insert into public.features (org_id, repo_id, key) select '{org}', id, '001-invites' from public.repositories where org_id = '{org}' returning id;",
            f"insert into public.spec_snapshots (org_id, feature_id, commit_sha, files_hash, files) select '{org}', id, 'abc', 'h-{tag}', '{{}}' from public.features where org_id = '{org}' returning id;",
        ))
        pg.psql(f"insert into public.reviews (org_id, snapshot_id, verdict, summary, report, engine_version) values ('{org}', '{snap}', 'blocked', '{{}}', '{{}}', '0.1');", "service")
        ids[tag] = {"org": org, "inst": inst, "repo": repo, "feat": feat, "snap": snap}
    return ids


TABLES = ["organizations", "memberships", "connections", "repositories", "features", "spec_snapshots", "reviews"]


def org_col(t: str) -> str:
    return "id" if t == "organizations" else "org_id"


# ------------------------------------------------------------------ FR-001, FR-002, NFR-001: isolation
def test_creating_an_organization_makes_the_creator_its_owner(pg, world):
    # verifies 013/FR-001
    assert pg.rows(f"select role from public.memberships where org_id = '{world['a']['org']}' and user_id = '{ALICE}';", ALICE) == ["owner"]
    pg.fails("select public.create_organization('X', 'xx');", "anon")                       # anon cannot even call it


def test_nobody_creates_an_organization_by_inserting_into_the_table(pg, world):
    pg.fails("insert into public.organizations (name, slug) values ('Evil', 'evil');", ALICE)


@pytest.mark.parametrize("table", TABLES)
def test_a_person_sees_only_their_own_organizations_rows(pg, world, table):
    # verifies 013/FR-002, SC-001
    col = org_col(table)
    a, b = world["a"]["org"], world["b"]["org"]
    assert pg.rows(f"select count(*) from public.{table} where {col} = '{b}';", ALICE) == ["0"]
    assert pg.rows(f"select count(*) from public.{table} where {col} = '{a}';", DAVE) == ["0"]
    assert int(pg.rows(f"select count(*) from public.{table} where {col} = '{a}';", ALICE)[0]) >= 1
    assert pg.rows(f"select count(*) from public.{table} where {col} <> '{a}';", ALICE) == ["0"]      # nothing else leaks in


@pytest.mark.parametrize("table", TABLES)
def test_anonymous_visitors_see_nothing(pg, world, table):
    # verifies 013/SC-001
    r = pg.psql(f"select count(*) from public.{table};", "anon", check=False)
    assert r.returncode != 0 or r.stdout.strip() == "0"


def test_a_person_cannot_join_or_edit_another_organization(pg, world):
    b = world["b"]["org"]
    pg.fails(f"insert into public.memberships (org_id, user_id, role) values ('{b}', '{ALICE}', 'owner');", ALICE)
    pg.psql(f"update public.organizations set name = 'Hacked' where id = '{b}';", ALICE)
    assert pg.rows(f"select name from public.organizations where id = '{b}';", DAVE) == ["Beta"]      # the update touched 0 rows


def test_only_the_service_writes_github_data(pg, world):
    a = world["a"]
    pg.fails(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{a['org']}', '{a['inst']}', '99', 'x/y');", ALICE)
    pg.fails(f"update public.reviews set verdict = 'ready' where org_id = '{a['org']}';", ALICE)


def test_a_row_cannot_point_at_another_organizations_row(pg, world):
    # verifies 013/FR-009
    a, b = world["a"], world["b"]
    err = pg.fails(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{b['org']}', '{a['inst']}', '77', 'x/y');", "service")
    assert "foreign key" in err


# ------------------------------------------------------------------ FR-007: never without an owner
def test_the_last_owner_cannot_leave_or_be_demoted(pg, world):
    # verifies 013/FR-007
    a = world["a"]["org"]
    assert "at least one owner" in pg.fails(f"delete from public.memberships where org_id = '{a}' and user_id = '{ALICE}';", ALICE)
    assert "at least one owner" in pg.fails(f"update public.memberships set role = 'admin' where org_id = '{a}' and user_id = '{ALICE}';", ALICE)


def test_an_admin_cannot_hand_out_the_owner_role(pg, world):
    a = world["a"]["org"]
    assert "only an owner" in pg.fails(f"update public.memberships set role = 'owner' where org_id = '{a}' and user_id = '{CAROL}';", ERIN)
    assert "only an owner" in pg.fails(f"delete from public.memberships where org_id = '{a}' and user_id = '{ALICE}';", ERIN)


def test_owners_can_share_ownership_and_then_step_down(pg, world):
    a = world["a"]["org"]
    pg.psql(f"update public.memberships set role = 'owner' where org_id = '{a}' and user_id = '{ERIN}';", ALICE)
    pg.psql(f"update public.memberships set role = 'admin' where org_id = '{a}' and user_id = '{ALICE}';", ERIN)
    pg.psql(f"update public.memberships set role = 'owner' where org_id = '{a}' and user_id = '{ALICE}';", ERIN)
    pg.psql(f"update public.memberships set role = 'admin' where org_id = '{a}' and user_id = '{ERIN}';", ALICE)
    assert pg.rows(f"select count(*) from public.memberships where org_id = '{a}' and role = 'owner';", ALICE) == ["1"]


# ------------------------------------------------------------------ FR-003, FR-006: who can decide
def approve(pg, w, who, decision="approved", reason="", extra="", by=None):
    a = w["a"]
    cols = f"org_id, feature_id, snapshot_id, decision, reason, by_user{', ' + extra.split('=')[0] if extra else ''}"
    vals = f"'{a['org']}', '{a['feat']}', '{a['snap']}', '{decision}', '{reason}', '{by or who}'{', ' + extra.split('=', 1)[1] if extra else ''}"
    return f"insert into public.approvals ({cols}) values ({vals});"


def test_viewers_and_members_cannot_approve(pg, world):
    pg.fails(approve(pg, world, CAROL), CAROL)


def test_an_approver_decides_only_as_themselves(pg, world):
    pg.fails(approve(pg, world, BOB, by=ALICE), BOB)
    pg.psql(approve(pg, world, BOB), BOB)


def test_nobody_decides_in_another_organization(pg, world):
    pg.fails(approve(pg, world, DAVE), DAVE)


def test_anything_but_a_plain_approval_needs_a_reason(pg, world):
    # verifies 013/FR-006
    assert "check" in pg.fails(approve(pg, world, BOB, "rejected", ""), BOB)
    pg.psql(approve(pg, world, BOB, "rejected", "wrong scope"), BOB)
    assert "check" in pg.fails(approve(pg, world, BOB, "approved", "", "override=true"), BOB)


def test_a_delegate_must_be_someone_who_can_approve(pg, world):
    assert "delegate" in pg.fails(approve(pg, world, BOB, "delegated", "out of office", f"delegate_to='{CAROL}'"), BOB)
    pg.psql(approve(pg, world, BOB, "delegated", "out of office", f"delegate_to='{ALICE}'"), BOB)


# ------------------------------------------------------------------ FR-004, FR-005, FR-008: chain, append-only, verification
def test_approvals_are_chained_and_verifiable(pg, world):
    # verifies 013/FR-004
    a = world["a"]["org"]
    assert pg.rows(f"select ok, broken_at, checked > 0 from public.verify_approvals('{a}');", ALICE) == ["t||t"]
    seqs = pg.rows(f"select string_agg(seq::text, ',' order by seq) from public.approvals where org_id = '{a}';", ALICE)[0]
    assert seqs.split(",") == [str(i) for i in range(1, len(seqs.split(",")) + 1)]
    assert pg.rows(f"select prev_hash from public.approvals where org_id = '{a}' and seq = 1;", ALICE) == ["0" * 64]


def test_nobody_can_edit_or_delete_an_approval(pg, world):
    # verifies 013/FR-005
    a = world["a"]["org"]
    # people and the service do not even have the privilege...
    for who in (ALICE, "service"):
        assert "permission denied" in pg.fails(f"update public.approvals set reason = 'x' where org_id = '{a}';", who)
        assert "permission denied" in pg.fails(f"delete from public.approvals where org_id = '{a}';", who)
    # ...and the table's owner (the superuser running migrations) is stopped by the triggers
    assert "append-only" in pg.fails(f"update public.approvals set reason = 'x' where org_id = '{a}';")
    assert "append-only" in pg.fails(f"delete from public.approvals where org_id = '{a}';")
    assert "append-only" in pg.fails("truncate public.approvals;")


def test_tampering_is_detected_and_points_at_the_entry(pg, world):
    # verifies 013/FR-008, SC-002
    a = world["a"]["org"]
    # the only way past the triggers is switching them off as superuser; the chain still gives it away
    pg.psql(f"""alter table public.approvals disable trigger approvals_no_change;
                update public.approvals set reason = 'rewritten history' where org_id = '{a}' and seq = 2;
                alter table public.approvals enable trigger approvals_no_change;""")
    assert pg.rows(f"select ok, broken_at from public.verify_approvals('{a}');", ALICE) == ["f|2"]


def test_chains_are_per_organization(pg, world):
    # verifies 013/FR-004
    b = world["b"]
    pg.psql(f"insert into public.approvals (org_id, feature_id, snapshot_id, decision, by_user) values ('{b['org']}', '{b['feat']}', '{b['snap']}', 'approved', '{DAVE}');", DAVE)
    assert pg.rows(f"select seq, prev_hash from public.approvals where org_id = '{b['org']}';", DAVE) == ["1|" + "0" * 64]
    assert pg.rows(f"select ok from public.verify_approvals('{b['org']}');", DAVE) == ["t"]


# ------------------------------------------------------------------ FR-010, FR-011: webhooks
def test_a_repeated_delivery_is_processed_once(pg, world):
    # verifies 013/FR-010
    ins = "insert into public.webhook_events (delivery_id, event, payload) values ('d-1', 'push', '{}') on conflict (delivery_id) do nothing returning id;"
    assert len(pg.rows(ins, "service")) == 1
    assert pg.rows(ins, "service") == []


def test_signed_in_people_cannot_read_webhook_payloads(pg, world):
    # verifies 013/FR-011
    pg.fails("select * from public.webhook_events;", ALICE)
    pg.fails("select * from public.webhook_events;", "anon")
