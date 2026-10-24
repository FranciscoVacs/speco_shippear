"""Slack: a digest of what waits for the approver, and one-click Approve / Reject from the message.

Outbound uses an Incoming Webhook (`SLACK_WEBHOOK_URL`). Inbound (button clicks) is `POST /api/slack/interact`, verified with the
app's signing secret (`SLACK_SIGNING_SECRET`, HMAC-SHA256 over `v0:<timestamp>:<body>`, 5-minute window). A click only counts if
the Slack user id is mapped to a member with the approver role (`specreview member add --slack U123`): Slack is the channel,
the member list stays the authority. Conditions and delegation need the app; Slack offers only approve and reject.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs

from . import approvals
from .members import by_slack_id

LABEL = {"needs_decision": "🟣 Necesita tu decisión", "blocked": "🔴 Bloqueada", "needs_work": "🟡 Con el equipo", "ready": "🟢 Lista para construir"}
TOLERANCE = 300


def verify_signature(secret: str, timestamp: str, body: bytes, signature: str, now: float | None = None) -> bool:
    try:
        if abs((now if now is not None else time.time()) - int(timestamp)) > TOLERANCE:
            return False                                           # replay protection
    except (TypeError, ValueError):
        return False
    expected = "v0=" + hmac.new(secret.encode(), b"v0:" + timestamp.encode() + b":" + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _summary_line(rows: list[dict], recorded: int | None) -> str:
    """Spec 012 (FR-012): the three numbers an approver wants, in the product's own words."""
    waiting = sum(1 for r in rows if r["decision"]["verdict"] == "needs_decision")
    ready = sum(1 for r in rows if r["decision"]["verdict"] == "ready")
    parts = [f"{waiting} esperan tu decisión", f"{ready} listas para construir"]
    if recorded is not None:
        parts.append(f"{recorded} decisiones registradas")
    return " · ".join(parts)


def build_digest(rows: list[dict], base_url: str = "", interactive: bool = False, only_pending: bool = True, recorded: int | None = None) -> dict | None:
    """rows: [{feature, repo?, decision: <report 'decision' block>, summary}]. Returns a Slack payload or None if nothing to say.
    `recorded` = decisions in the audit log; when given, the digest says how many there are."""
    pending = [r for r in rows if r["decision"]["verdict"] == "needs_decision"]
    shown = pending if only_pending else rows
    if not shown:
        return None
    n = len(pending)
    head = ("1 spec espera tu decisión" if n == 1 else f"{n} specs esperan tu decisión") if n else "Estado de las specs"
    blocks: list[dict] = [{"type": "header", "text": {"type": "plain_text", "text": head}},
                          {"type": "context", "elements": [{"type": "mrkdwn", "text": _summary_line(rows, recorded)}]}]
    for r in shown:
        d, name = r["decision"], r["feature"]
        link = f"<{base_url.rstrip('/')}/reviews/{name}|{name}>" if base_url else f"`{name}`"
        waiting = d["waiting_on"]
        detail = (f"{waiting['decision']} decisión(es) tuyas · {waiting['team']} del equipo" if waiting["decision"] else f"{waiting['team']} del equipo")
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*{link}*\n{LABEL[d['verdict']]} — {detail}"}})
        if interactive and d["verdict"] in ("needs_decision", "ready"):
            blocks.append({"type": "actions", "elements": [
                {"type": "button", "text": {"type": "plain_text", "text": "Aprobar"}, "style": "primary", "action_id": "sr_approve", "value": name,
                 "confirm": {"title": {"type": "plain_text", "text": "¿Aprobar?"}, "text": {"type": "mrkdwn", "text": f"Se registra tu aprobación de *{name}* en el log de auditoría."},
                             "confirm": {"type": "plain_text", "text": "Aprobar"}, "deny": {"type": "plain_text", "text": "Cancelar"}}},
                {"type": "button", "text": {"type": "plain_text", "text": "Rechazar"}, "style": "danger", "action_id": "sr_reject", "value": name}]})
    return {"text": head, "blocks": blocks}


def post_webhook(url: str, payload: dict, timeout: float = 10.0) -> None:
    if not url.startswith("https://"):
        raise ValueError("el webhook de Slack debe ser https://")
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:                      # noqa: S310 (https enforced above)
            r.read()
    except urllib.error.HTTPError as e:
        raise ValueError(f"Slack respondió {e.code}: {e.read().decode(errors='replace')[:120]}") from None
    except urllib.error.URLError as e:
        raise ValueError(f"no pude llegar a Slack: {e.reason}") from None


def handle_interaction(root: Path, raw_body: bytes, features: dict[str, Path], review_fn) -> dict:
    """The Slack interactivity payload -> an ephemeral reply. Never raises: Slack must always get a message back."""
    try:
        payload = json.loads(parse_qs(raw_body.decode("utf-8"))["payload"][0])
        action = payload["actions"][0]
        slack_id = payload["user"]["id"]
    except (KeyError, IndexError, ValueError):
        return {"response_type": "ephemeral", "text": "No entendí esa acción."}
    decision = {"sr_approve": "approved", "sr_reject": "rejected"}.get(action.get("action_id"))
    feature = str(action.get("value", ""))
    if decision is None or feature not in features:
        return {"response_type": "ephemeral", "text": "Acción o feature desconocida."}
    who = by_slack_id(root, slack_id)
    if who is None:
        return {"response_type": "ephemeral", "text": "Tu usuario de Slack no está vinculado a un miembro. Pedí `specreview member add --slack <tu id>`."}
    try:
        e = approvals.record(root, feature, features[feature], who, decision, review_fn(features[feature]),
                             reason="Rechazado desde Slack" if decision == "rejected" else "", via="slack")
    except approvals.PolicyError as err:
        return {"response_type": "ephemeral", "text": f"No se registró: {err}"}
    verb = "aprobaste" if decision == "approved" else "rechazaste"
    return {"response_type": "ephemeral", "replace_original": False, "text": f"Listo: {verb} *{feature}* ({e['id']})."}
