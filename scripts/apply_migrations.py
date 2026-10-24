"""Applies the pending migrations of supabase/migrations to the production database, in order (docs/35).

    POSTGRES_URL_NON_POOLING=... python scripts/apply_migrations.py           # apply what is pending
    POSTGRES_URL_NON_POOLING=... python scripts/apply_migrations.py --check   # list what is pending, change nothing

The applied ones are recorded in public._speco_migrations (RLS on, no access for anon or authenticated). Each migration runs in its own
transaction together with its record, so a failure leaves the database at the previous migration. A session advisory lock keeps two
deploys from applying at once. It refuses to run when the record is empty but the schema already exists: that database was migrated by
another path and replaying from the first file would fail halfway or, worse, not fail."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS = Path(__file__).resolve().parents[1] / "supabase" / "migrations"
LOCK = 0x5BEC0  # any constant shared by every run of this script


def _registry(conn: psycopg.Connection) -> tuple[str, set[str]]:
    """The column that names a migration in public._speco_migrations, and the names already there. Creates the table on a new database."""
    conn.execute("""create table if not exists public._speco_migrations (
                      name text primary key, applied_at timestamptz not null default now())""")
    conn.execute("alter table public._speco_migrations enable row level security")
    conn.execute("revoke all on public._speco_migrations from anon, authenticated")
    cols = [r[0] for r in conn.execute("""select column_name from information_schema.columns
                                          where table_schema = 'public' and table_name = '_speco_migrations' and data_type = 'text'
                                          order by ordinal_position""")]
    col = next((c for c in ("name", "version", "filename", "migration") if c in cols), None)
    if col is None:
        sys.exit(f"public._speco_migrations has no column naming the migration (text columns: {cols}); fix the script, not the table")
    return col, {r[0] for r in conn.execute(f'select "{col}" from public._speco_migrations')}


def _is_applied(path: Path, applied: set[str]) -> bool:
    # the record may hold the file name, the name without .sql or only the timestamp, depending on who applied it
    return bool({path.name, path.stem, path.stem.split("_", 1)[0]} & applied)


def _stored_form(path: Path, applied: set[str]) -> str:
    """Writes new records in the same form as the existing ones."""
    if any(a.endswith(".sql") for a in applied):
        return path.name
    if applied and all(a.isdigit() for a in applied):
        return path.stem.split("_", 1)[0]
    return path.stem if applied else path.name


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="list the pending migrations and exit without applying them")
    args = ap.parse_args()
    url = os.environ.get("POSTGRES_URL_NON_POOLING")
    if not url:
        sys.exit("POSTGRES_URL_NON_POOLING is not set (the direct connection: the pooler on 6543 cannot run DDL in a transaction safely)")
    files = sorted(MIGRATIONS.glob("*.sql"))
    with psycopg.connect(url, autocommit=True, prepare_threshold=None) as conn:
        conn.execute("select pg_advisory_lock(%s)", (LOCK,))
        col, applied = _registry(conn)
        pending = [f for f in files if not _is_applied(f, applied)]
        if not applied and conn.execute("select to_regclass('public.organizations')").fetchone()[0] is not None:
            sys.exit("the schema exists but public._speco_migrations is empty: record what is already applied before running this")
        done = [f for f in files if f not in pending]
        if done and pending and pending[0] < done[-1]:
            sys.exit(f"{pending[0].name} is older than {done[-1].name}, which is applied: a migration was added out of order")
        for f in pending:
            print(f"{'pending' if args.check else 'applying'} {f.name}", flush=True)
            if args.check:
                continue
            with conn.transaction():
                conn.execute(f.read_text(encoding="utf-8"))
                conn.execute(f'insert into public._speco_migrations ("{col}") values (%s)', (_stored_form(f, applied),))
        if not pending:
            print("no pending migrations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
