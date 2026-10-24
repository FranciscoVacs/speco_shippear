"""scripts/apply_migrations.py, the step of .github/workflows/deploy-api.yml that brings production to the code before it is deployed.
Each test gets its own empty database in the shared throwaway cluster (cluster_fixture.py), with the Supabase pieces stubbed."""
from __future__ import annotations

import itertools
import os
import subprocess
import sys
from pathlib import Path

import psycopg
import pytest
from cluster_fixture import MIGRATIONS, pg  # noqa: F401  (session fixture)

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "apply_migrations.py"
STUB = Path(__file__).parent / "supabase_stub.sql"
_names = itertools.count()


@pytest.fixture
def db(pg):
    """-> the URL of a new database with only the Supabase stub, the state of a fresh Supabase project."""
    name = f"migrate_{next(_names)}"
    pg.psql(f"create database {name};")
    url = f"postgresql://postgres@/{name}?host={pg.sock}"
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(STUB.read_text())
    return url


def run(url: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=False,
                          env={**os.environ, "POSTGRES_URL_NON_POOLING": url})


def recorded(url: str) -> list[str]:
    with psycopg.connect(url) as conn:
        return [r[0] for r in conn.execute("select name from public._speco_migrations order by name")]


def test_a_fresh_database_gets_every_migration_once(db):
    first = run(db)
    assert first.returncode == 0, first.stderr
    assert recorded(db) == [m.name for m in MIGRATIONS]
    again = run(db)
    assert again.returncode == 0, again.stderr
    assert "no pending migrations" in again.stdout


def test_check_lists_what_is_pending_and_changes_nothing(db):
    r = run(db, "--check")
    assert r.returncode == 0, r.stderr
    assert r.stdout.count("pending ") == len(MIGRATIONS)
    assert recorded(db) == []
    with psycopg.connect(db) as conn:
        assert conn.execute("select to_regclass('public.organizations')").fetchone()[0] is None


def test_only_the_missing_ones_run_and_records_keep_the_existing_form(db):
    """Production's record was filled by hand; whatever form it uses (here, names without .sql), new rows follow it."""
    *old, last = MIGRATIONS
    with psycopg.connect(db, autocommit=True) as conn:
        for m in old:
            conn.execute(m.read_text())
        conn.execute("create table public._speco_migrations (name text primary key, applied_at timestamptz not null default now())")
        for m in old:
            conn.execute("insert into public._speco_migrations (name) values (%s)", (m.stem,))
    r = run(db)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == f"applying {last.name}"
    assert recorded(db)[-1] == last.stem


def test_refuses_a_migrated_schema_with_an_empty_record(db):
    with psycopg.connect(db, autocommit=True) as conn:
        conn.execute(MIGRATIONS[0].read_text())
    r = run(db)
    assert r.returncode != 0
    assert "record what is already applied" in r.stderr


def test_a_failing_migration_leaves_no_record_and_no_half_schema(db, tmp_path):
    first = run(db)
    assert first.returncode == 0, first.stderr
    broken = tmp_path / "migrations"
    broken.mkdir()
    for m in MIGRATIONS:
        (broken / m.name).write_text(m.read_text())
    (broken / "29991231000001_broken.sql").write_text("create table public.half (id int);\nselect 1/0;\n")
    script = tmp_path / "apply_migrations.py"
    script.write_text(SCRIPT.read_text().replace('Path(__file__).resolve().parents[1] / "supabase" / "migrations"', repr(str(broken))))
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, check=False,
                       env={**os.environ, "POSTGRES_URL_NON_POOLING": db})
    assert r.returncode != 0
    assert "29991231000001_broken.sql" not in recorded(db)
    with psycopg.connect(db) as conn:
        assert conn.execute("select to_regclass('public.half')").fetchone()[0] is None
