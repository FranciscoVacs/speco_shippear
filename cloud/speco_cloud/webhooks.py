"""GitHub webhooks (spec 013, FR-010): verify the signature, store the delivery once, then act on it.
A delivery is stored BEFORE it is processed, and only counts as done once `processed_at` is set: if processing fails GitHub's retry
finds it unprocessed and runs it again; if it already succeeded the retry is a no-op."""
from __future__ import annotations

import hashlib
import hmac

from psycopg import Connection
from psycopg.types.json import Jsonb


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)


def record(conn: Connection, delivery_id: str, event: str, payload: dict) -> tuple[int, bool]:
    """-> (event row id, already processed)"""
    row = conn.execute(
        "insert into public.webhook_events (delivery_id, event, payload) values (%s, %s, %s) on conflict (delivery_id) do nothing returning id",
        (delivery_id, event, Jsonb(payload)),
    ).fetchone()
    if row:
        return row["id"], False
    row = conn.execute("select id, processed_at from public.webhook_events where delivery_id = %s", (delivery_id,)).fetchone()
    return row["id"], row["processed_at"] is not None


def process(conn: Connection, event_id: int, event: str, payload: dict) -> str:
    handler = HANDLERS.get(event)
    org_id, outcome = handler(conn, payload) if handler else (None, "ignored")
    conn.execute("update public.webhook_events set processed_at = now(), org_id = %s, outcome = %s, error = null where id = %s", (org_id, outcome, event_id))
    return outcome


def mark_failed(conn: Connection, event_id: int, error: str) -> None:
    conn.execute("update public.webhook_events set error = %s where id = %s", (error[:500], event_id))


# ---------------------------------------------------------------------------------------------- handlers: each returns (org_id, outcome)
def _installation(conn: Connection, installation_id: int) -> dict | None:
    return conn.execute("select id, org_id from public.connections where provider = 'github' and external_id = %s", (str(installation_id),)).fetchone()


def upsert_repository(conn: Connection, inst: dict, repo: dict) -> None:
    row = conn.execute(
        """insert into public.repositories (org_id, connection_id, external_id, full_name, default_branch)
           values (%s, %s, %s, %s, %s)
           on conflict (org_id, connection_id, external_id) do update
             set full_name = excluded.full_name, status = 'active'
           returning id, last_synced_at""",
        (inst["org_id"], inst["id"], str(repo["id"]), repo["full_name"], repo.get("default_branch") or "main"),
    ).fetchone()
    if row["last_synced_at"] is None:
        enqueue_first_sync(conn, inst["org_id"], row["id"])


def enqueue(conn: Connection, org_id, repo_id, kind: str, payload: dict | None = None) -> None:
    """One pending job per repository and kind: asking again before the worker runs just refreshes it."""
    conn.execute(
        """insert into public.jobs (org_id, repo_id, kind, payload) values (%s, %s, %s, %s)
           on conflict (repo_id, kind) where status = 'pending' do update set payload = excluded.payload, run_after = now(), updated_at = now()""",
        (org_id, repo_id, kind, Jsonb(payload or {})),
    )


def enqueue_first_sync(conn: Connection, org_id, repo_id) -> None:
    """A newly connected repository is read at once (reviews, inventory) and its portrait is proposed (spec 014)."""
    enqueue(conn, org_id, repo_id, "sync_repo")
    enqueue(conn, org_id, repo_id, "portrait")


def _on_installation(conn: Connection, p: dict):
    inst = _installation(conn, p["installation"]["id"])
    if not inst:
        return None, "unlinked"                        # linked later, from the setup callback, by a signed-in owner
    status = {"deleted": "deleted", "suspend": "suspended", "unsuspend": "active"}.get(p.get("action", ""))
    if not status:
        return inst["org_id"], "ignored"
    conn.execute("update public.connections set status = %s where id = %s", (status, inst["id"]))
    if status == "deleted":
        conn.execute("update public.repositories set status = 'removed' where connection_id = %s", (inst["id"],))
    return inst["org_id"], "ok"


def _on_installation_repositories(conn: Connection, p: dict):
    inst = _installation(conn, p["installation"]["id"])
    if not inst:
        return None, "unlinked"
    for repo in p.get("repositories_added", []):
        upsert_repository(conn, inst, repo)
    for repo in p.get("repositories_removed", []):
        conn.execute("update public.repositories set status = 'removed' where org_id = %s and connection_id = %s and external_id = %s", (inst["org_id"], inst["id"], str(repo["id"])))
    return inst["org_id"], "ok"


def _touches_specs(p: dict) -> bool:
    commits = p.get("commits") or []
    if len(commits) >= 20:                             # GitHub truncates the list at 20: assume it may have touched specs
        return True
    return any(path.startswith("specs/") for c in commits for k in ("added", "modified", "removed") for path in c.get(k, []))


def _on_push(conn: Connection, p: dict):
    repo = p.get("repository") or {}
    branch = repo.get("default_branch") or "main"
    if p.get("ref") != f"refs/heads/{branch}":
        return None, "ignored"
    rows = conn.execute(
        """select r.id, r.org_id from public.repositories r join public.connections c on c.id = r.connection_id
            where c.provider = 'github' and r.external_id = %s and r.status = 'active' and c.status = 'active'""",
        (str(repo.get("id")),),
    ).fetchall()
    if not rows:
        return None, "unlinked"
    outcome = "ok"
    for r in rows:
        conn.execute("update public.repositories set last_sha = %s, default_branch = %s where id = %s", (p.get("after"), branch, r["id"]))
        if _touches_specs(p):
            enqueue(conn, r["org_id"], r["id"], "sync_repo", {"sha": p.get("after")})
            outcome = "queued"
    return rows[0]["org_id"], outcome


HANDLERS = {"installation": _on_installation, "installation_repositories": _on_installation_repositories, "push": _on_push}


# ---------------------------------------------------------------------------------------------- Bitbucket (spec 019): one webhook per connection
def process_bitbucket(conn: Connection, event_id: int, event: str, payload: dict, connection: dict) -> str:
    handler = BITBUCKET_HANDLERS.get(event)
    outcome = handler(conn, payload, connection) if handler else "ignored"
    conn.execute("update public.webhook_events set processed_at = now(), org_id = %s, outcome = %s, error = null where id = %s", (connection["org_id"], outcome, event_id))
    return outcome


def _bb_push(conn: Connection, p: dict, c: dict) -> str:
    uuid = (p.get("repository") or {}).get("uuid")
    repo = conn.execute("select id, org_id, default_branch, status from public.repositories where connection_id = %s and external_id = %s", (c["id"], uuid)).fetchone()
    if not repo:
        return "unknown"                                  # created after the connection: a refresh finds it
    if repo["status"] != "active":
        return "unselected"                               # FR-005: only repositories the company chose are read
    outcome = "ignored"
    for change in (p.get("push") or {}).get("changes") or []:
        new = change.get("new") or {}
        if new.get("type") == "branch" and new.get("name") == repo["default_branch"] and (new.get("target") or {}).get("hash"):
            sha = new["target"]["hash"]
            conn.execute("update public.repositories set last_sha = %s where id = %s", (sha, repo["id"]))
            enqueue(conn, repo["org_id"], repo["id"], "sync_repo", {"sha": sha})
            outcome = "queued"
    return outcome


BITBUCKET_HANDLERS = {"repo:push": _bb_push}
