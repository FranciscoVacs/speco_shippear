"""People who may approve, and the tokens that identify them (`.specreview/members.json`).

Tokens are random 256-bit secrets shown once; only their SHA-256 is stored, so the file can be committed and reviewed in a
pull request (who may approve is itself a decision worth reviewing). Roles: `approver` (may approve / reject / delegate),
`member` and `viewer` (read only).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .suppress import DIR

MEMBERS_FILE = "members.json"
ROLES = ("approver", "member", "viewer")


@dataclass(frozen=True)
class Member:
    id: str
    name: str
    email: str
    role: str
    slack: str = ""

    @property
    def can_approve(self) -> bool:
        return self.role == "approver"

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "email": self.email, "role": self.role}


def _path(root: Path) -> Path:
    return Path(root) / DIR / MEMBERS_FILE


def _load_raw(root: Path) -> list[dict]:
    p = _path(root)
    if not p.is_file():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("members", [])
    except json.JSONDecodeError as e:
        raise ValueError(f"{p}: JSON inválido ({e})") from None


def _save(root: Path, members: list[dict]) -> None:
    p = _path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"version": 1, "members": members}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _to_member(m: dict) -> Member:
    return Member(m["id"], m["name"], m.get("email", ""), m["role"], m.get("slack", ""))


def list_members(root: Path, include_revoked: bool = False) -> list[Member]:
    return [_to_member(m) for m in _load_raw(root) if include_revoked or not m.get("revoked")]


def add_member(root: Path, name: str, role: str, email: str = "", slack: str = "", today: date | None = None) -> tuple[Member, str]:
    """Create a member and return (member, token). The token is not recoverable afterwards."""
    if role not in ROLES:
        raise ValueError(f"rol inválido {role!r}; opciones: {', '.join(ROLES)}")
    if not name.strip():
        raise ValueError("el miembro necesita un nombre")
    raw = _load_raw(root)
    if email and any(m.get("email", "").lower() == email.lower() and not m.get("revoked") for m in raw):
        raise ValueError(f"ya existe un miembro con el email {email}")
    token = "sr_" + secrets.token_urlsafe(32)
    mid = f"m_{secrets.token_hex(3)}"
    raw.append({"id": mid, "name": name.strip(), "email": email, "role": role, "slack": slack,
                "token_sha256": _hash(token), "created": (today or date.today()).isoformat(), "revoked": False})
    _save(root, raw)
    return _to_member(raw[-1]), token


def revoke_member(root: Path, ident: str) -> Member:
    raw = _load_raw(root)
    for m in raw:
        if ident in (m["id"], m.get("email")) and not m.get("revoked"):
            m["revoked"] = True
            _save(root, raw)
            return _to_member(m)
    raise ValueError(f"no hay un miembro activo {ident!r}")


def authenticate(root: Path, token: str | None) -> Member | None:
    if not token:
        return None
    h = _hash(token)
    found = None
    for m in _load_raw(root):                       # compare every entry: no early exit that leaks which one matched
        if hmac.compare_digest(m.get("token_sha256", ""), h) and not m.get("revoked"):
            found = _to_member(m)
    return found


def by_slack_id(root: Path, slack_id: str) -> Member | None:
    return next((m for m in list_members(root) if slack_id and m.slack == slack_id), None)


def get(root: Path, ident: str) -> Member | None:
    return next((m for m in list_members(root) if ident in (m.id, m.email)), None)
