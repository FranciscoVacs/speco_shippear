"""From findings to a decision: who has to act, what it puts at risk, and whether the feature can be built.

A reviewer reads findings; the person who approves a feature asks "can the team build this, and is anything waiting on me?".
This module is the single source for that translation (the CLI JSON, the MCP tools and the web app all read it), so the
answer cannot drift between surfaces.

* owner  - "decision": only a product owner can resolve it (scope, which of two rules wins, an open question).
           "team": the authors of the spec can fix it without anyone deciding anything.
* risk   - the failure mode it feeds (the three in the product brief): intent_drift (the agent will guess),
           context_decay (pieces of the spec no longer agree or no longer trace), unverifiable (nobody can tell if it is done).
"""
from __future__ import annotations

from .findings import Finding, Severity

DECISION_RULES = {"COV002", "COV003", "QUA004", "CON001", "CON002", "PRD001", "PRD003", "PRD004", "PRD005", "PRD006", "PRD007"}

RISK = {
    "COV000": "context_decay", "COV001": "intent_drift", "COV002": "intent_drift", "COV003": "intent_drift",
    "COV004": "intent_drift", "COV005": "context_decay", "COV006": "context_decay",
    "QUA001": "intent_drift", "QUA002": "unverifiable", "QUA003": "unverifiable", "QUA004": "intent_drift",
    "QUA005": "unverifiable", "QUA006": "unverifiable", "QUA007": "unverifiable", "QUA008": "unverifiable",
    "CON001": "intent_drift", "CON002": "intent_drift",
    "PRD001": "intent_drift", "PRD002": "context_decay", "PRD003": "context_decay", "PRD004": "intent_drift", "PRD005": "intent_drift", "PRD006": "context_decay", "PRD007": "context_decay",
}
RISKS = ("intent_drift", "context_decay", "unverifiable")
VERDICTS = ("ready", "needs_work", "blocked", "needs_decision")      # increasing urgency for the approver


def owner_of(rule: str) -> str:
    return "decision" if rule in DECISION_RULES else "team"


def risk_of(rule: str) -> str:
    return RISK.get(rule, "context_decay")


def summarize(findings: list[Finding]) -> dict:
    """Report-level block: verdict, who is waiting on whom, risks. Suggestions never change the verdict."""
    live = [f for f in findings if f.severity >= Severity.WARNING]
    blockers = [f for f in live if f.severity == Severity.BLOCKER]
    mine = [f for f in live if owner_of(f.rule) == "decision"]
    if mine:
        verdict = "needs_decision"
    elif blockers:
        verdict = "blocked"
    elif live:
        verdict = "needs_work"
    else:
        verdict = "ready"
    risks = {r: 0 for r in RISKS}
    for f in live:
        risks[risk_of(f.rule)] += 1
    return {
        "verdict": verdict,
        "can_implement": not blockers,
        "waiting_on": {"decision": len(mine), "team": len(live) - len(mine)},
        "risks": risks,
        "top_risk": max(RISKS, key=lambda r: risks[r]) if live else None,
    }
