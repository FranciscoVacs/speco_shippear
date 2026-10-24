"""Signed, short-lived `state` for the GitHub App install round trip: it ties the installation GitHub reports back to the
company and the person who started it, so nobody can attach an installation to someone else's company."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time


class StateError(Exception):
    pass


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_state(secret: str, org_id: str, user_id: str, ttl: int = 600, now: float | None = None, extra: dict | None = None) -> str:
    data = {**(extra or {}), "org": org_id, "user": user_id, "exp": int((now if now is not None else time.time()) + ttl)}
    body = _b64(json.dumps(data, separators=(",", ":")).encode())
    return body + "." + _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())


def read_state(secret: str, token: str, now: float | None = None) -> dict:
    try:
        body, sig = token.split(".", 1)
        expected = _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, sig):
            raise StateError("bad signature")
        data = json.loads(_unb64(body))
    except (ValueError, KeyError) as e:
        raise StateError("malformed state") from e
    if (now if now is not None else time.time()) > data.get("exp", 0):
        raise StateError("expired")
    return data
