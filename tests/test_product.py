"""Phase 4: product layer (goals, decisions, assumptions)."""
import json

import pytest

from conftest import ROOT
from specreview.cli import main
from specreview.mcp import Server
from specreview.parser import load_feature
from specreview.product import check_product, load_product, product_report

SUBS = ROOT / "examples" / "subscriptions"


def run(capsys, *argv):
    code = main([*map(str, argv)])
    cap = capsys.readouterr()
    return code, cap.out, cap.err


def by_rule(findings):
    out = {}
    for f in findings:
        out.setdefault(f.rule, []).append(f)
    return out


def test_goals_and_decisions_are_parsed_in_both_styles(tmp_path):
    (tmp_path / "product").mkdir()
    (tmp_path / "product" / "goals.md").write_text("- **G-1**: One\n- G-2 - Two\n## G-3: Three\n")
    (tmp_path / "product" / "decisions.md").write_text(
        "## D-001: Keep it simple\n**Status**: Superseded by D-002\n**Out of scope**: Foo, bar baz\n## D-002 — Newer\n")
    ctx = load_product(tmp_path)
    assert list(ctx.goals) == ["G-1", "G-2", "G-3"] and ctx.goals["G-2"].text == "Two"
    d1, d2 = ctx.decisions["D-001"], ctx.decisions["D-002"]
    assert d1.status == "superseded" and d1.out_of_scope == ["foo", "bar baz"] and d2.status == "accepted"


def test_opt_in_no_product_folder_no_findings(make_feature):
    # verifies 009/FR-006
    d = make_feature("# Feature Specification: x\n## Requirements\n### Functional Requirements\n- **FR-001**: System MUST log in\n")
    assert check_product(load_feature(d)) == []


def test_example_finds_each_product_rule():
    # verifies 009/FR-001, FR-002, FR-005
    r = by_rule(check_product(load_feature(SUBS)))
    assert {"PRD002", "PRD003", "PRD005"} <= set(r) and "PRD001" not in r
    blocker = [f for f in r["PRD003"] if f.severity.key == "blocker"]
    assert blocker and blocker[0].ids == ["D-003"]                       # cites a superseded decision: explicit, so a blocker
    inferred = [f for f in r["PRD003"] if f.severity.key == "warning"]
    assert inferred and inferred[0].ids == ["FR-002", "D-002"]            # found only by text: a warning
    assert [f.ids for f in r["PRD002"]] == [["G-9"]]
    assert len(r["PRD005"]) == 1 and "expense reports" in r["PRD005"][0].message   # the one with a source is not flagged


def test_feature_without_goal_is_flagged_only_when_goals_exist(tmp_path):
    # verifies 009/FR-003
    spec = "# Feature Specification: x\n\n**Status**: Draft\n\n## Requirements\n### Functional Requirements\n- **FR-001**: System MUST log in\n"
    d = tmp_path / "specs" / "001-x"
    d.mkdir(parents=True)
    (d / "spec.md").write_text(spec)
    (tmp_path / "product").mkdir()
    (tmp_path / "product" / "decisions.md").write_text("## D-001: x\n")
    assert check_product(load_feature(d)) == []                           # no goals defined: nothing to map to
    (tmp_path / "product" / "goals.md").write_text("- **G-1**: A goal\n")
    f = check_product(load_feature(d))
    assert [x.rule for x in f] == ["PRD001"] and f[0].severity.key == "warning"


def test_word_boundaries_in_out_of_scope(tmp_path):
    # verifies 009/FR-002
    d = tmp_path / "specs" / "001-x"
    d.mkdir(parents=True)
    (d / "spec.md").write_text("# Feature Specification: x\n\n**Goals**: G-1\n\n## Requirements\n### Functional Requirements\n"
                               "- **FR-001**: System MUST show a discounted-looking badge for the premier tier\n"
                               "- **FR-002**: System MUST apply a discount at checkout\n")
    (tmp_path / "product").mkdir()
    (tmp_path / "product" / "goals.md").write_text("- **G-1**: g\n")
    (tmp_path / "product" / "decisions.md").write_text("## D-1: no\n**Out of scope**: discount\n")
    ids = [f.ids for f in check_product(load_feature(d)) if f.rule == "PRD003"]
    assert ["FR-002", "D-1"] in ids


def test_review_integrates_the_analyzer_and_json_marks_owner(capsys):
    code, out, _ = run(capsys, SUBS, "-f", "json", "--no-baseline", "--fail-on", "never")
    d = json.loads(out)
    prd = [f for f in d["findings"] if f["rule"].startswith("PRD")]
    assert prd and all(f["owner"] == ("team" if f["rule"] == "PRD002" else "decision") for f in prd)
    assert d["decision"]["verdict"] == "needs_decision"
    assert "intent_drift" in {f["risk"] for f in prd} and "context_decay" in {f["risk"] for f in prd}


def test_only_product_filter(capsys):
    _, out, _ = run(capsys, SUBS, "--only", "product", "--color", "never", "--no-baseline", "--fail-on", "never")
    assert "PRD003" in out and "QUA006" not in out


def test_product_report_goal_coverage():
    # verifies 009/FR-004
    rep = product_report(SUBS, {"003-annual-plans": SUBS / "specs" / "003-annual-plans"})
    cov = {g["id"]: g["covered"] for g in rep["goals"]}
    assert cov == {"G-1": False, "G-2": False, "G-3": True, "G-4": False}
    assert {f["ids"][0] for f in rep["findings"]} == {"G-1", "G-2", "G-4"} and all(f["rule"] == "PRD004" for f in rep["findings"])
    assert rep["features_without_goal"] == []


def test_product_subcommand(capsys, tmp_path):
    code, out, _ = run(capsys, "product", SUBS)
    assert code == 0 and "✘ G-1" in out and "✔ G-3" in out
    assert run(capsys, "product", SUBS, "--fail-on", "warning")[0] == 1
    code, out, _ = run(capsys, "product", SUBS, "-f", "json")
    assert json.loads(out)["decisions"][0]["id"] == "D-001"
    code, _, err = run(capsys, "product", tmp_path)
    assert code == 2 and "opt-in" in err


def test_mcp_product_overview_and_blockers_include_product_decisions():
    s = Server(SUBS)
    r = s.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "product_overview", "arguments": {}}})["result"]
    assert not r["isError"] and len(r["structuredContent"]["goals"]) == 4
    b = s.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_blockers", "arguments": {}}})["result"]["structuredContent"]
    assert b["can_implement"] is False and b["blockers"][0]["rule"] == "PRD003"
    assert {f["rule"] for f in b["needs_product_decision"]} >= {"PRD003", "PRD005"}


def test_mcp_product_overview_without_product_dir_is_a_tool_error(make_repo):
    r = Server(make_repo({"001-a": "good"})).handle(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "product_overview", "arguments": {}}})["result"]
    assert r["isError"] and "opt-in" in r["content"][0]["text"]


def test_deployment_facts_are_not_user_assumptions(tmp_path):
    d = tmp_path / "specs" / "001-x"
    d.mkdir(parents=True)
    (d / "spec.md").write_text("# Feature Specification: x\n\n**Goals**: G-1\n\n## Requirements\n### Functional Requirements\n"
                               "- **FR-001**: System MUST log in\n\n## Assumptions\n\n- The server runs on the user's own machine\n"
                               "- A real model needs the user's own API key\n- Users want weekly digests\n")
    (tmp_path / "product").mkdir()
    (tmp_path / "product" / "goals.md").write_text("- **G-1**: g\n")
    msgs = [f.message for f in check_product(load_feature(d)) if f.rule == "PRD005"]
    assert len(msgs) == 1 and "weekly digests" in msgs[0]


def test_server_exposes_product_report(tmp_path):
    import threading
    import urllib.request

    from specreview.server import make_server
    srv = make_server(SUBS, "127.0.0.1", 0, None)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        port = srv.server_address[1]
        data = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/product").read())
        assert data[0]["repo"] == "local" and len(data[0]["report"]["goals"]) == 4
    finally:
        srv.shutdown()
    (tmp_path / "specs" / "001-a").mkdir(parents=True)
    (tmp_path / "specs" / "001-a" / "spec.md").write_text("# F\n")
    srv = make_server(tmp_path, "127.0.0.1", 0, None)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        assert json.loads(urllib.request.urlopen(f"http://127.0.0.1:{srv.server_address[1]}/api/product").read()) == []
    finally:
        srv.shutdown()
