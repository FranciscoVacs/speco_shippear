"""Speco's remote MCP endpoint (spec 018): the Model Context Protocol over HTTP (JSON-RPC 2.0 in POST bodies), read only.

Who is calling: an AI agent a PERSON authorized through OAuth. Every tool opens its database work as that person (with the client's
`client_id` in the claims), so row level security shows the agent exactly what the person sees, and the database itself refuses any
decision from such an access (migration 20261016000002). The tool list has NO write tool, by design (D-012, FR-009)."""
from __future__ import annotations

import json
from typing import Any, Callable

from .config import Settings
from .db import user_tx

PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
MAX_SPEC_BYTES = 200 * 1024
SERVER_INFO = {"name": "speco", "version": "0.1.0"}


class ToolError(Exception):
    """Something the agent should be told in words (shown as a tool error, not a protocol error)."""


def _org(conn, ref: str | None) -> dict:
    rows = conn.execute("select o.id, o.name, o.slug, m.role from public.organizations o join public.memberships m on m.org_id = o.id and m.user_id = auth.uid() order by o.created_at").fetchall()
    if not rows:
        raise ToolError("this person has no company in Speco yet")
    if ref:
        hit = [r for r in rows if str(r["id"]) == ref or r["slug"] == ref]
        if not hit:
            raise ToolError(f"no company {ref!r} for this person; available: {', '.join(r['slug'] for r in rows)}")
        return hit[0]
    if len(rows) > 1:
        raise ToolError(f"this person has several companies; pass `org` as one of: {', '.join(r['slug'] for r in rows)}")
    return rows[0]


def _j(rows: list[dict]) -> list[dict]:
    return [{k: (str(v) if k.endswith("id") or k == "id" else v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows]


# ---------------------------------------------------------------------------------------------- tools (all read only)
def t_list_organizations(conn, args: dict) -> Any:
    return _j(conn.execute("select o.id, o.name, o.slug, m.role from public.organizations o join public.memberships m on m.org_id = o.id and m.user_id = auth.uid() order by o.created_at").fetchall())


def t_pending_decisions(conn, args: dict) -> Any:
    org = _org(conn, args.get("org"))
    rules = conn.execute("select code, statement, category, risk, origin, confidence from public.business_rules where org_id = %s and status = 'proposed' order by case risk when 'high' then 0 when 'medium' then 1 else 2 end, seq limit 25", (org["id"],)).fetchall()
    drift = conn.execute("select r.code, d.kind, d.detail, d.commit_sha from public.drift_findings d join public.business_rules r on r.id = d.rule_id where d.org_id = %s and d.status = 'open' order by d.created_at desc limit 25", (org["id"],)).fetchall()
    feats = conn.execute(
        """select f.key as feature, r.verdict from public.features f
             join lateral (select verdict from public.reviews rv join public.spec_snapshots s on s.id = rv.snapshot_id where s.feature_id = f.id order by rv.created_at desc limit 1) r on true
            where f.org_id = %s and r.verdict in ('needs_decision', 'blocked') order by r.verdict, f.key""", (org["id"],)).fetchall()
    return {"company": org["slug"], "your_role": org["role"], "rules_waiting_for_a_person": _j(rules), "changes_not_decided": _j(drift), "features_that_need_a_decision_or_are_blocked": _j(feats),
            "note": "Only a person decides these, in the Speco app. An agent can read and propose, never decide."}


def t_list_rules(conn, args: dict) -> Any:
    status = args.get("status", "confirmed")
    if status not in ("proposed", "confirmed", "rejected"):
        raise ToolError("status must be proposed, confirmed or rejected")
    org = _org(conn, args.get("org"))
    return _j(conn.execute("select r.code, r.statement, r.category, r.risk, r.origin, r.confidence, r.status, f.full_name as repo from public.business_rules r join public.repositories f on f.id = r.repo_id where r.org_id = %s and r.status = %s order by r.seq", (org["id"], status)).fetchall())


def t_list_features(conn, args: dict) -> Any:
    org = _org(conn, args.get("org"))
    return _j(conn.execute(
        """select f.key as feature, p.full_name as repo, r.verdict, r.summary, r.created_at as reviewed_at from public.features f join public.repositories p on p.id = f.repo_id
             left join lateral (select rv.verdict, rv.summary, rv.created_at from public.reviews rv join public.spec_snapshots s on s.id = rv.snapshot_id where s.feature_id = f.id order by rv.created_at desc limit 1) r on true
            where f.org_id = %s order by f.key""", (org["id"],)).fetchall())


def t_get_review(conn, args: dict) -> Any:
    feature = args.get("feature")
    if not feature:
        raise ToolError("`feature` is required (a folder name under specs/, for example 003-team-invitations)")
    org = _org(conn, args.get("org"))
    row = conn.execute(
        """select rv.verdict, rv.summary, rv.report, rv.created_at from public.reviews rv join public.spec_snapshots s on s.id = rv.snapshot_id join public.features f on f.id = s.feature_id
            where f.org_id = %s and f.key = %s order by rv.created_at desc limit 1""", (org["id"], feature)).fetchone()
    if not row:
        raise ToolError(f"no review for feature {feature!r}")
    order = {"blocker": 0, "warning": 1, "suggestion": 2}
    findings = sorted(row["report"].get("findings", []), key=lambda f: order.get(f.get("severity"), 3))[:25]
    return {"feature": feature, "verdict": row["verdict"], "summary": row["summary"], "reviewed_at": row["created_at"].isoformat(),
            "findings": [{k: f.get(k) for k in ("rule", "severity", "ids", "message", "owner")} for f in findings]}


def t_list_baselines(conn, args: dict) -> Any:
    org = _org(conn, args.get("org"))
    return _j(conn.execute("select name, note, frozen_at, rules_count, hash from public.baselines where org_id = %s order by frozen_at desc", (org["id"],)).fetchall())


def t_list_drift(conn, args: dict) -> Any:
    org = _org(conn, args.get("org"))
    status = args.get("status", "open")
    if status not in ("open", "acknowledged"):
        raise ToolError("status must be open or acknowledged")
    return _j(conn.execute("select r.code, r.statement, d.kind, d.detail, d.commit_sha, d.status, d.created_at from public.drift_findings d join public.business_rules r on r.id = d.rule_id where d.org_id = %s and d.status = %s order by d.created_at desc limit 50", (org["id"], status)).fetchall())


def t_check_spec(conn, args: dict) -> Any:
    """Reviews a DRAFT spec (and optionally its plan and tasks) with the engine. Nothing is stored: the text is parsed in memory."""
    from .worker import review_files                       # imported here: it pulls in the review engine
    spec = args.get("spec")
    if not isinstance(spec, str) or not spec.strip():
        raise ToolError("`spec` (the text of spec.md) is required")
    files = {"specs/draft/spec.md": spec}
    for name in ("plan", "tasks"):
        if isinstance(args.get(name), str) and args[name].strip():
            files[f"specs/draft/{name}.md"] = args[name]
    if sum(len(t.encode()) for t in files.values()) > MAX_SPEC_BYTES:
        raise ToolError("the draft is too large to check (200 KB at most)")
    [r] = review_files(files)
    order = {"blocker": 0, "warning": 1, "suggestion": 2}
    findings = sorted(r["report"].get("findings", []), key=lambda f: order.get(f.get("severity"), 3))[:30]
    return {"verdict": r["report"]["decision"]["verdict"], "summary": r["report"]["summary"], "stored": False,
            "findings": [{k: f.get(k) for k in ("rule", "severity", "ids", "message", "owner")} for f in findings],
            "tip": "Fix the blockers and the questions marked as decisions before an agent implements this."}


def _schema(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or [], "additionalProperties": False}


_ORG = {"org": {"type": "string", "description": "company slug or id; optional when the person has only one"}}
TOOLS: dict[str, tuple[str, dict, Callable]] = {
    "list_organizations": ("The companies this person belongs to in Speco, with their role.", _schema({}), t_list_organizations),
    "pending_decisions": ("What waits for a person's decision: proposed rules, changes to confirmed rules, and features that need a decision or are blocked. Read this BEFORE implementing anything.", _schema(_ORG), t_pending_decisions),
    "list_rules": ("The company's business rules by status (default confirmed = what the company has decided its software does).", _schema({**_ORG, "status": {"type": "string", "enum": ["proposed", "confirmed", "rejected"]}}), t_list_rules),
    "list_features": ("Features (specs) with the verdict of their latest review.", _schema(_ORG), t_list_features),
    "get_review": ("The latest review of one feature: verdict, summary and the most serious findings.", _schema({**_ORG, "feature": {"type": "string"}}, ["feature"]), t_get_review),
    "list_baselines": ("The frozen baselines of the company.", _schema(_ORG), t_list_baselines),
    "list_drift": ("Changes that touched a confirmed rule (open = nobody has decided yet).", _schema({**_ORG, "status": {"type": "string", "enum": ["open", "acknowledged"]}}), t_list_drift),
    "check_spec": ("Review a DRAFT spec (and optionally plan and tasks) before implementing it. Nothing is stored.", _schema({"spec": {"type": "string"}, "plan": {"type": "string"}, "tasks": {"type": "string"}}, ["spec"]), t_check_spec),
}


def tool_list() -> list[dict]:
    return [{"name": n, "description": d, "inputSchema": s, "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False}} for n, (d, s, _f) in TOOLS.items()]


# ---------------------------------------------------------------------------------------------- JSON-RPC
def _err(id_, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


def handle(settings: Settings, claims: dict, msg: Any) -> dict | None:
    """One JSON-RPC message -> its response (None for a notification, which has no answer)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
        return _err(msg.get("id") if isinstance(msg, dict) else None, -32600, "invalid request")
    id_, method, params = msg.get("id"), msg["method"], msg.get("params") or {}
    if "id" not in msg:
        return None                                        # notifications (initialized, cancelled, ...): accepted, no response
    if method == "initialize":
        want = params.get("protocolVersion")
        return {"jsonrpc": "2.0", "id": id_, "result": {"protocolVersion": want if want in PROTOCOLS else PROTOCOLS[0], "capabilities": {"tools": {"listChanged": False}}, "serverInfo": SERVER_INFO,
                "instructions": "Speco keeps what a company has decided about its software. Read pending_decisions before implementing; use check_spec on a draft spec. You can read and propose, never decide: decisions are made by people in the Speco app."}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": id_, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": id_, "result": {"tools": tool_list()}}
    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if name not in TOOLS or not isinstance(args, dict):
            return _err(id_, -32602, f"unknown tool {name!r}")
        try:
            with user_tx(settings, str(claims["sub"]), str(claims.get("client_id") or "")) as conn:
                result = TOOLS[name][2](conn, args)
            return {"jsonrpc": "2.0", "id": id_, "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=1, default=str)}], "isError": False}}
        except ToolError as e:
            return {"jsonrpc": "2.0", "id": id_, "result": {"content": [{"type": "text", "text": str(e)}], "isError": True}}
    return _err(id_, -32601, f"method not found: {method}")
