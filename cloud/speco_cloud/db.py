"""Database access. Every connection DROPS to a least-privilege role before doing anything (defense in depth):
- service work runs as `service_role` (cannot edit approvals even if the code had a bug),
- user work runs as `authenticated` with the person's JWT claims, so row level security decides what they see."""
from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import Settings


def _connect(dsn: str) -> psycopg.Connection:
    # a transaction pooler (Supabase on port 6543) hands each transaction to any backend: server-side prepared statements would not be there
    return psycopg.connect(dsn, row_factory=dict_row, prepare_threshold=None)


@contextmanager
def service_tx(settings: Settings) -> Iterator[psycopg.Connection]:
    conn = _connect(settings.database_url)
    try:
        with conn.transaction():
            conn.execute(f"set local role {settings.service_role}")
            yield conn
    finally:
        conn.close()


@contextmanager
def user_tx(settings: Settings, user_id: str, client_id: str | None = None) -> Iterator[psycopg.Connection]:
    conn = _connect(settings.database_url)
    try:
        with conn.transaction():
            conn.execute("set local role authenticated")
            conn.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": user_id, "role": "authenticated", **({"client_id": client_id} if client_id else {})}),))
            yield conn
    finally:
        conn.close()
