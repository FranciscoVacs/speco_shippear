"""Spec 027 · what the web app reads and writes about decisions in the cloud: a company's features with their latest review,
one review with the files it was made from, and the hash-chained log of who decided what.

Everything here runs as the signed-in person (`user_tx`), so row level security decides what they see; the only write is
`public.decide_feature`, which the database refuses to anyone who is not an approver, and to every agent."""
from __future__ import annotations

import hashlib
import uuid

from psycopg.types.json import Jsonb
from specreview import approvals as engine

DECISIONS = engine.DECISIONS
NEEDS_REASON = engine.NEEDS_REASON


class Refused(Exception):
    """A request the approval policy turns down, with the HTTP status it deserves and a code the app can act on."""

    def __init__(self, message: str, status: int = 422, code: str = "bad_request"):
        super().__init__(message)
        self.status, self.code = status, code


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def file_hashes(files: dict[str, str]) -> dict[str, str]:
    """{file name: text} -> {file name: sha256}: the same per-file form the browser computes for a version of the spec."""
    return {n: _sha(files[n]) for n in engine.FILES if n in files}


def version_hash(hashes: dict[str, str]) -> str:
    """One hash for a version, from its per-file hashes. The same function the engine and the worker use."""
    return engine.spec_hash(hashes)


def _uuid(value: str, what: str = "feature") -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise Refused(f"{what} not found", 404, "not_found") from None


def split_ref(ref: str) -> tuple[str, str | None]:
    """`<feature>` is the version on the default branch; `<feature>~<snapshot>` is one version, for example the one a pull request proposes."""
    feature, _, snapshot = ref.partition("~")
    return _uuid(feature), (_uuid(snapshot, "version") if snapshot else None)


# ---------------------------------------------------------------------------------------------- what the app lists and opens
def list_features(conn, org_id: str) -> list[dict]:
    """Every feature of the repositories the company reads, with its latest branch version and that version's latest review."""
    rows = conn.execute(
        """select f.id, f.key, p.full_name as repo, s.id as snapshot_id, s.files_hash, r.verdict, r.summary, r.created_at as reviewed_at
             from public.features f
             join public.repositories p on p.id = f.repo_id and p.status = 'active'
             join lateral (select id, files_hash from public.spec_snapshots where feature_id = f.id and source = 'branch' order by created_at desc limit 1) s on true
             left join lateral (select verdict, summary, created_at from public.reviews where snapshot_id = s.id order by created_at desc limit 1) r on true
            where f.org_id = %s order by p.full_name, f.key""",
        (org_id,),
    ).fetchall()
    return [{"id": str(r["id"]), "feature": r["key"], "repo": r["repo"], "summary": r["summary"], "verdict": r["verdict"],
             "snapshot_id": str(r["snapshot_id"]), "files_hash": r["files_hash"], "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None} for r in rows]


def get_review(conn, org_id: str, ref: str) -> dict | None:
    feature, snapshot = split_ref(ref)
    row = conn.execute(
        """select f.key, p.full_name as repo, s.id as snapshot_id, s.files, s.files_hash, s.source, rv.report, rv.verdict
             from public.features f
             join public.repositories p on p.id = f.repo_id
             join lateral (select * from public.spec_snapshots x where x.feature_id = f.id and (%s::uuid is null and x.source = 'branch' or x.id = %s::uuid) order by x.created_at desc limit 1) s on true
             left join lateral (select report, verdict from public.reviews where snapshot_id = s.id order by created_at desc limit 1) rv on true
            where f.id = %s and f.org_id = %s""",
        (snapshot, snapshot, feature, org_id),
    ).fetchone()
    if not row or row["report"] is None:
        return None
    return {"report": row["report"], "sources": row["files"], "feature": row["key"], "repo": row["repo"],
            "snapshot_id": str(row["snapshot_id"]), "files_hash": row["files_hash"], "source": row["source"]}


# ---------------------------------------------------------------------------------------------- people and the log
def people(conn, org_id: str) -> list[dict]:
    return [{"id": str(r["user_id"]), "name": r["name"], "role": r["role"]} for r in conn.execute("select * from public.org_people(%s)", (org_id,)).fetchall()]


def _entry(row: dict, who: dict[str, dict]) -> dict:
    report = row["report"] or {}
    d = report.get("decision") or {}
    by = who.get(str(row["by_user"]), {"id": str(row["by_user"]), "name": str(row["by_user"])[:8], "role": ""})
    return {
        "id": str(row["id"]), "snapshot_id": str(row["snapshot_id"]), "feature": str(row["feature_id"]), "feature_key": row["key"], "repo": row["repo"], "decision": row["decision"], "reason": row["reason"],
        "conditions": row["conditions"], "delegate_to": str(row["delegate_to"]) if row["delegate_to"] else None, "override": row["override"],
        "by": {**by, "via": "app"}, "at": row["at"].isoformat(), "spec_hash": row["files_hash"], "files": file_hashes(row["files"]),
        "verdict": d.get("verdict", row["verdict"] or ""), "seq": row["seq"], "source": row["source"],
        "open": {"decision": (d.get("waiting_on") or {}).get("decision", 0), "team": (d.get("waiting_on") or {}).get("team", 0), "blockers": (report.get("summary") or {}).get("blocker", 0)},
    }


def history(conn, org_id: str, feature: str | None = None) -> list[dict]:
    who = {p["id"]: p for p in people(conn, org_id)}
    rows = conn.execute(
        """select a.id, a.seq, a.feature_id, a.snapshot_id, a.decision, a.reason, a.conditions, a.delegate_to, a.override, a.by_user, a.at,
                  s.files, s.files_hash, s.source, f.key, p.full_name as repo, rv.report, rv.verdict
             from public.approvals a
             join public.spec_snapshots s on s.id = a.snapshot_id
             join public.features f on f.id = a.feature_id
             join public.repositories p on p.id = f.repo_id
             left join lateral (select report, verdict from public.reviews where snapshot_id = s.id order by created_at desc limit 1) rv on true
            where a.org_id = %s and (%s::uuid is null or a.feature_id = %s::uuid) order by a.seq desc limit 200""",
        (org_id, feature, feature),
    ).fetchall()
    return [_entry(r, who) for r in rows]


def verify(conn, org_id: str) -> dict:
    r = conn.execute("select * from public.verify_approvals(%s)", (org_id,)).fetchone()
    return {"ok": r["ok"], "broken_at": r["broken_at"], "count": r["checked"]}


def record(conn, org_id: str, user: str, ref: str, files: dict[str, str], decision: str, reason: str = "", conditions: list[str] | None = None,
           delegate_to: str | None = None, override: bool = False) -> dict:
    """One person decides one version of one feature. `files` are the per-file hashes of the version they were looking at: if the spec moved
    since, the version is not known and nothing is recorded."""
    feature, _ = split_ref(ref)
    if decision not in DECISIONS:
        raise Refused(f"decisión inválida {decision!r}; opciones: {', '.join(DECISIONS)}")
    role = conn.execute("select role from public.memberships where org_id = %s and user_id = %s", (org_id, user)).fetchone()
    if not role or role["role"] not in ("owner", "admin", "approver"):
        raise Refused("sólo un owner, un admin o un approver puede decidir", 403, "forbidden")
    reason = (reason or "").strip()
    conditions = [c.strip() for c in (conditions or []) if c and c.strip()]
    if decision in NEEDS_REASON and not reason:
        raise Refused("esta decisión necesita un motivo")
    if decision == "approved_with_conditions" and not conditions:
        raise Refused("aprobar con condiciones necesita al menos una condición")
    if decision == "delegated":
        target = conn.execute("select 1 from public.org_people(%s) where user_id = %s and role in ('owner', 'admin', 'approver')", (org_id, delegate_to or None)).fetchone() if delegate_to else None
        if not target:
            raise Refused("hay que delegar en un miembro que pueda aprobar")
        if delegate_to == user:
            raise Refused("no se puede delegar en uno mismo")
    elif delegate_to:
        raise Refused("delegate_to sólo vale con la decisión «delegated»")
    files_hash = version_hash(files)
    snap = conn.execute(
        """select s.id, rv.report from public.spec_snapshots s
             left join lateral (select report from public.reviews where snapshot_id = s.id order by created_at desc limit 1) rv on true
            where s.feature_id = %s and s.org_id = %s and s.files_hash = %s""",
        (feature, org_id, files_hash),
    ).fetchone()
    if not snap:
        raise Refused("esa versión de la feature cambió o no se conoce: recargá y volvé a mirarla", 409, "stale")
    d = ((snap["report"] or {}).get("decision")) or {}
    blocked = decision.startswith("approved") and d.get("can_implement") is False
    if blocked and not override:
        raise Refused("la feature tiene bloqueantes: no se puede aprobar sin override", 409, "blocked")
    if blocked and not reason:
        raise Refused("aprobar con bloqueantes (override) necesita un motivo")
    new = conn.execute(
        "select public.decide_feature(%s, %s, %s, %s, %s, %s, %s) as id",
        (feature, files_hash, decision, reason, Jsonb(conditions), delegate_to, bool(override and blocked)),
    ).fetchone()["id"]
    return next(e for e in history(conn, org_id, feature) if e["id"] == str(new))
