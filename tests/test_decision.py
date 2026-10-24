"""Phase 3: findings -> verdict / owner / risk."""
import json

from conftest import EXAMPLE
from specreview.cli import main
from specreview.decision import DECISION_RULES, RISK, summarize
from specreview.findings import Finding, Severity
from specreview.model import Loc
from specreview.rules import BY_ID


def f(rule, sev):
    return Finding(rule, sev, ["FR-001"], Loc("spec.md", 1), "m")


def test_every_rule_has_a_risk_and_decision_rules_exist():
    assert set(RISK) == set(BY_ID)                          # a new rule cannot ship without a risk class
    assert DECISION_RULES <= set(BY_ID)


def test_verdict_precedence():
    assert summarize([])["verdict"] == "ready"
    assert summarize([f("QUA003", Severity.SUGGESTION)])["verdict"] == "ready"             # suggestions never change it
    assert summarize([f("QUA002", Severity.WARNING)])["verdict"] == "needs_work"
    assert summarize([f("COV001", Severity.BLOCKER)])["verdict"] == "blocked"
    both = summarize([f("COV001", Severity.BLOCKER), f("QUA004", Severity.BLOCKER)])
    assert both["verdict"] == "needs_decision" and both["can_implement"] is False
    assert both["waiting_on"] == {"decision": 1, "team": 1}


def test_a_decision_warning_still_needs_the_approver_but_does_not_block_building():
    s = summarize([f("COV002", Severity.WARNING)])
    assert s["verdict"] == "needs_decision" and s["can_implement"] is True


def test_risk_counts_and_top_risk():
    s = summarize([f("QUA002", Severity.WARNING), f("QUA006", Severity.WARNING), f("CON001", Severity.BLOCKER)])
    assert s["risks"] == {"intent_drift": 1, "context_decay": 0, "unverifiable": 2} and s["top_risk"] == "unverifiable"
    assert summarize([])["top_risk"] is None


def test_json_carries_decision_block_and_per_finding_owner(capsys):
    main([str(EXAMPLE), "-f", "json", "--no-baseline", "--fail-on", "never"])
    d = json.loads(capsys.readouterr().out)
    assert d["decision"]["verdict"] in {"needs_decision", "blocked"} and d["decision"]["waiting_on"]["team"] > 0
    assert all(x["owner"] in {"decision", "team"} and x["risk"] for x in d["findings"])
    assert sum(d["decision"]["waiting_on"].values()) == sum(1 for x in d["findings"] if x["severity"] != "suggestion")
