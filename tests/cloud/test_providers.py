"""Spec 019 part 1 · code providers: the schema is provider neutral, a repository that is only available is never read, and the choice of
reader follows the provider of the connection."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

from speco_cloud import worker  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.providers import Providers, coerce  # noqa: E402
from speco_cloud.providers.github import GitHubReader  # noqa: E402

U = "70000000-0000-0000-0000-00000000000a"


@pytest.fixture(scope="module")
def world(pg):
    pg.psql(f"insert into auth.users (id, email) values ('{U}', 'prov@example.com');")
    org = pg.rows("select public.create_organization('Prov Co', 'prov-co');", U)[0]
    return {"pg": pg, "org": org, "settings": Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x")}


def test_two_providers_may_share_an_external_id_but_one_provider_may_not_repeat_it(world):
    pg, org = world["pg"], world["org"]
    pg.psql(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '555', 'a', 'Organization'), ('{org}', 'bitbucket', '555', 'b', 'Workspace');", "service")
    assert "connections_provider_external_key" in pg.fails(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '555', 'c', 'Organization');", "service")
    assert "connections_provider_check" in pg.fails(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'gitlab', '1', 'c', 'Organization');", "service")


def test_a_repository_that_is_only_available_is_not_read(world):
    # verifies 019/FR-003
    pg, org = world["pg"], world["org"]
    conn = pg.rows(f"select id from public.connections where org_id = '{org}' and provider = 'bitbucket';")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name, status) values ('{org}', '{conn}', '{{abc}}', 'acme/found', 'available') returning id;", "service")[0]
    pg.psql(f"insert into public.jobs (org_id, repo_id, kind) values ('{org}', '{repo}', 'sync_repo');", "service")
    out = worker.run_once(world["settings"], object())          # a reader is never even asked for
    assert out["skipped"] and "gone" in out["skipped"]
    assert pg.fails(f"update public.repositories set status = 'archived' where id = '{repo}';", "service")


def test_the_reader_follows_the_provider():
    class App:
        def installation_token(self, n):
            return f"tok-{n}"

        def resolve_ref(self, token, name, ref):
            return f"{token}:{name}:{ref}"

    p = coerce(App())
    assert isinstance(p, Providers) and coerce(p) is p
    r = p.reader({"provider": "github", "full_name": "o/r", "connection_external_id": "9"})
    assert isinstance(r, GitHubReader) and r.resolve_ref("main") == "tok-9:o/r:main"
    with pytest.raises(ValueError):
        p.reader({"provider": "svn", "full_name": "o/r", "connection_external_id": "1"})


def test_no_signed_in_person_can_touch_the_secrets_table(world):
    # verifies 019/FR-008, SC-002
    pg, org = world["pg"], world["org"]
    conn = pg.rows(f"select id from public.connections where org_id = '{org}' and provider = 'bitbucket';")[0]
    pg.psql(f"insert into public.connection_secrets (connection_id, org_id, credentials) values ('{conn}', '{org}', 'ciphertext');", "service")
    assert "permission denied" in pg.fails("select credentials from public.connection_secrets;", U)
    assert "permission denied" in pg.fails("select count(*) from public.connection_secrets;", "anon")
    assert pg.rows("select count(*) from public.connection_secrets;", "service") == ["1"]
