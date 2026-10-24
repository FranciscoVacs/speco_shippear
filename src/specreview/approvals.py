"""Approvals: who approved which version of a spec, in an append-only, hash-chained log (`.specreview/approvals.jsonl`).

Each entry stores the hash of the spec files it was given on, the verdict at that moment and the previous entry's hash, so
(a) a spec edited after an approval is visibly *stale*, and (b) rewriting or deleting history breaks the chain and `verify`
says where. The file lives in the repository: the audit trail is reviewed and versioned like the specs themselves.
"""
from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .members import Member, get as get_member
from .suppress import DIR

LOG_FILE = "approvals.jsonl"
FILES = ("spec.md", "plan.md", "tasks.md", "data-model.md", "values.md")   # values.md: decided numbers a PR moves (spec 031)
DECISIONS = ("approved", "approved_with_conditions", "rejected", "delegated")
NEEDS_REASON = {"approved_with_conditions", "rejected", "delegated"}
_lock = threading.Lock()


class PolicyError(Exception):
    """A request the approval policy refuses (wrong role, missing reason, blocked without override...)."""

    def __init__(self, message: str, code: str = "policy"):
        super().__init__(message)
        self.code = code


def sha(data: bytes | str) -> str:
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode("utf-8")).hexdigest()


def spec_hashes(feature_dir: Path) -> dict[str, str]:
    return {n: sha((feature_dir / n).read_bytes()) for n in FILES if (feature_dir / n).is_file()}


def spec_hash(files: dict[str, str]) -> str:
    """One hash for a version of the spec. Mirrored in the web demo (same canonical form), so keep both in sync."""
    return sha("".join(f"{n}:{files[n]}\n" for n in sorted(files)))


def _entry_hash(e: dict) -> str:
    return sha(json.dumps({k: v for k, v in e.items() if k != "hash"}, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def _path(root: Path) -> Path:
    return Path(root) / DIR / LOG_FILE


def read_log(root: Path) -> list[dict]:
    p = _path(root)
    if not p.is_file():
        return []
    out = []
    for n, line in enumerate(p.read_text(encoding="utf-8").split("\n"), 1):  # not splitlines(): it also cuts at U+0085 / U+2028, which json leaves raw
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            raise ValueError(f"{p}:{n}: línea inválida en el registro de aprobaciones") from None
    return out


def verify(root: Path) -> dict:
    """Walk the chain. {"ok": bool, "count": n, "broken_at": entry id | None, "reason": str}."""
    prev = "genesis"
    entries = read_log(root)
    for e in entries:
        if e.get("prev") != prev:
            return {"ok": False, "count": len(entries), "broken_at": e.get("id"), "reason": "la cadena no enlaza con la entrada anterior (¿se borró o reordenó algo?)"}
        if e.get("hash") != _entry_hash(e):
            return {"ok": False, "count": len(entries), "broken_at": e.get("id"), "reason": "el contenido de la entrada no coincide con su hash (¿se editó?)"}
        prev = e["hash"]
    return {"ok": True, "count": len(entries), "broken_at": None, "reason": ""}


def history(root: Path, feature: str | None = None) -> list[dict]:
    return [e for e in reversed(read_log(root)) if feature is None or e["feature"] == feature]


@dataclass
class Status:
    state: str                    # none | approved | approved_with_conditions | rejected | delegated
    stale: bool                   # the spec changed after the latest entry
    changed_files: list[str]
    latest: dict | None

    def to_dict(self) -> dict:
        return {"state": self.state, "stale": self.stale, "changed_files": self.changed_files, "latest": self.latest}


def status(root: Path, feature: str, feature_dir: Path) -> Status:
    latest = next(iter(history(root, feature)), None)
    if latest is None:
        return Status("none", False, [], None)
    now = spec_hashes(feature_dir)
    then = latest.get("files", {})
    changed = sorted(n for n in {*now, *then} if now.get(n) != then.get(n))
    return Status(latest["decision"], bool(changed), changed, latest)


def record(root: Path, feature: str, feature_dir: Path, by: Member, decision: str, review: dict, reason: str = "",
           conditions: list[str] | None = None, delegate_to: str | None = None, override: bool = False,
           via: str = "api", now: datetime | None = None) -> dict:
    """Validate against the policy and append one entry. `review` is the report dict (to_dict) of the feature right now."""
    if decision not in DECISIONS:
        raise PolicyError(f"decisión inválida {decision!r}; opciones: {', '.join(DECISIONS)}", "bad_request")
    if not by.can_approve:
        raise PolicyError(f"{by.name} tiene el rol «{by.role}»: sólo un approver puede aprobar, rechazar o delegar", "forbidden")
    reason = (reason or "").strip()
    conditions = [c.strip() for c in (conditions or []) if c and c.strip()]
    if decision in NEEDS_REASON and not reason:
        raise PolicyError("esta decisión necesita un motivo", "bad_request")
    if decision == "approved_with_conditions" and not conditions:
        raise PolicyError("aprobar con condiciones necesita al menos una condición", "bad_request")
    if decision == "delegated":
        target = get_member(root, delegate_to or "")
        if target is None or not target.can_approve:
            raise PolicyError("hay que delegar en un miembro con rol approver", "bad_request")
        if target.id == by.id:
            raise PolicyError("no se puede delegar en uno mismo", "bad_request")
    elif delegate_to:
        raise PolicyError("delegate_to sólo vale con la decisión «delegated»", "bad_request")
    d = review["decision"]
    if decision.startswith("approved") and not d["can_implement"]:
        if not override:
            raise PolicyError(f"{feature} tiene bloqueantes: no se puede aprobar sin override", "blocked")
        if not reason:
            raise PolicyError("aprobar con bloqueantes (override) necesita un motivo", "bad_request")
    files = spec_hashes(feature_dir)
    with _lock:
        log = read_log(root)
        v = verify(root)
        if not v["ok"]:
            raise PolicyError(f"el registro de aprobaciones está roto en {v['broken_at']}: {v['reason']}", "tampered")
        e = {"v": 1, "id": f"a_{len(log) + 1:06d}", "feature": feature, "decision": decision, "reason": reason,
             "conditions": conditions, "delegate_to": delegate_to, "override": bool(override and decision.startswith("approved") and not d["can_implement"]),
             "by": {**by.public(), "via": via}, "at": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "spec_hash": spec_hash(files), "files": files, "verdict": d["verdict"],
             "open": {"decision": d["waiting_on"]["decision"], "team": d["waiting_on"]["team"],
                      "blockers": review["summary"].get("blocker", 0)},
             "prev": log[-1]["hash"] if log else "genesis"}
        e["hash"] = _entry_hash(e)
        p = _path(root)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(e, ensure_ascii=False) + "\n")
    return e
