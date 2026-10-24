import json
from pathlib import Path

import pytest

from conftest import EXAMPLE
from specreview.analyzers import run_all
from specreview.cli import main
from specreview.findings import Finding, Severity
from specreview.model import Loc
from specreview.parser import load_feature
from specreview.report import build_report, render_json, render_markdown, render_text, sort_findings

GOLDEN = Path(__file__).parent / "golden"


@pytest.fixture
def report(example):
    f = load_feature(example)
    return build_report(f, run_all(f))


# ---------- snapshots (regenerate deliberately: specreview examples/invitations > tests/golden/invitations.txt) ----------
def test_text_snapshot(report):
    # verifies 001/FR-010, FR-007
    assert render_text(report) == (GOLDEN / "invitations.txt").read_text()


def test_markdown_snapshot(report):
    # verifies 001/FR-015
    assert render_markdown(report) == (GOLDEN / "invitations.md").read_text()


# ---------- text format ----------
def test_one_finding_per_line_by_default(report):
    # verifies 001/FR-010
    lines = render_text(report).splitlines()
    finding_lines = [l for l in lines if l.startswith(("BLOQUEANTE", "ADVERTENCIA", "SUGERENCIA"))]
    assert len(finding_lines) == len(report.findings)


def test_verbose_adds_fix_lines(report):
    assert "↳" not in render_text(report) and "↳" in render_text(report, verbose=True)


def test_every_finding_line_has_severity_place_and_explanation(report):
    for l in render_text(report).splitlines():
        if l.startswith("BLOQUEANTE"):
            assert " spec.md:" in l or " tasks.md:" in l or " plan.md:" in l
            assert len(l.split("  ")[-1]) > 20


def test_color_only_when_requested(report):
    assert "\033[" not in render_text(report) and "\033[" in render_text(report, color=True)


def test_clean_report_says_so(make_feature):
    d = make_feature(spec="# F\n## Requirements\n### Functional Requirements\n- **FR-001**: When a user logs in, the system MUST record the login time\n"
                          "### User Story 1 - Log (Priority: P1)\nUser logs in and the login time is recorded\n\n**Acceptance Scenarios**:\n\n1. **Given** a user, **When** they log in, **Then** the login time is recorded\n",
                     plan="# P\n## Summary\nRecord the login time when a user logs in.\n",
                     tasks="## Phase 3: User Story 1 - Log (Priority: P1)\n- [ ] T001 [US1] Record the login time when a user logs in in src/auth.py\n")
    f = load_feature(d)
    rep = build_report(f, run_all(f))
    assert rep.findings == [] and "Sin hallazgos" in render_text(rep)


def test_parser_notes_are_shown(make_feature):
    f = load_feature(make_feature(spec="# F\n"))
    assert "nota: No hay plan.md" in render_text(build_report(f, []))


# ---------- ordering ----------
def test_sorted_by_severity_then_natural_id():
    mk = lambda rule, sev, i: Finding(rule, sev, [i], Loc("spec.md", 1), "m")  # noqa: E731
    fs = [mk("QUA003", Severity.SUGGESTION, "FR-001"), mk("COV001", Severity.BLOCKER, "FR-10"),
          mk("COV001", Severity.BLOCKER, "FR-2"), mk("QUA001", Severity.WARNING, "FR-1")]
    assert [(f.rule, f.ids[0]) for f in sort_findings(fs)] == [
        ("COV001", "FR-2"), ("COV001", "FR-10"), ("QUA001", "FR-1"), ("QUA003", "FR-001")]


# ---------- JSON contract ----------
def test_json_contract(report):
    # verifies 001/FR-015
    d = json.loads(render_json(report))
    assert d["schema_version"] == 1 and d["feature"] == "003-team-invitations"
    assert set(d["summary"]) == {"blocker", "warning", "suggestion"}
    assert sum(d["summary"].values()) == len(d["findings"])
    f = d["findings"][0]
    assert set(f) == {"fingerprint", "owner", "risk", "rule", "rule_name", "severity", "ids", "location", "message", "fix", "evidence"}
    assert f["severity"] in {"blocker", "warning", "suggestion"} and set(f["location"]) == {"file", "line"}
    assert d["metrics"]["requirements_with_plan_or_tasks_pct"] == 60


def test_metrics_on_example(report):
    m = report.metrics
    assert (m["requirements"], m["tasks"], m["tasks_without_requirement"]) == (10, 14, 2)
    assert m["requirements_with_acceptance_pct"] == 50 and m["ears_patterns"]["event"] == 2


# ---------- CLI ----------
def test_cli_exit_code_1_on_blockers(capsys):
    # verifies 001/FR-011
    assert main([str(EXAMPLE)]) == 1
    assert "BLOQUEANTE" in capsys.readouterr().out


@pytest.mark.parametrize("fail_on,code", [("blocker", 1), ("never", 0)])
def test_cli_fail_on(fail_on, code):
    # verifies 001/FR-011
    assert main([str(EXAMPLE), "--fail-on", fail_on]) == code


def test_cli_only_filters_analyzers_and_fail_on_levels(capsys):
    # verifies 001/FR-011
    assert main([str(EXAMPLE), "--only", "quality", "--fail-on", "blocker"]) == 1   # QUA004 is a blocker
    assert main([str(EXAMPLE), "--only", "acceptance", "--fail-on", "blocker"]) == 0
    assert main([str(EXAMPLE), "--only", "acceptance", "--fail-on", "warning"]) == 1
    capsys.readouterr()


def test_cli_json_is_valid(capsys):
    main([str(EXAMPLE), "-f", "json", "--fail-on", "never"])
    json.loads(capsys.readouterr().out)


def test_cli_missing_path_exit_2(tmp_path, capsys):
    assert main([str(tmp_path)]) == 2
    assert "error" in capsys.readouterr().err


# ---------- CLI polish ----------
def test_min_severity_hides_listing_but_not_exit_code(capsys):
    code = main([str(EXAMPLE), "--min-severity", "blocker"])
    out = capsys.readouterr().out
    assert code == 1 and "ADVERTENCIA" not in out and "SUGERENCIA" not in out
    assert "ocultos" in out and "BLOQUEANTE" in out


def test_color_always_and_never(capsys):
    main([str(EXAMPLE), "--color", "always", "--fail-on", "never"])
    assert "\033[" in capsys.readouterr().out
    main([str(EXAMPLE), "--color", "never", "--fail-on", "never"])
    assert "\033[" not in capsys.readouterr().out


def test_llm_requires_api_key(monkeypatch, capsys):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert main([str(EXAMPLE), "--llm", "anthropic"]) == 2
    assert "ANTHROPIC_API_KEY" in capsys.readouterr().err


def test_llm_flag_wires_a_client_into_the_analyzers(monkeypatch, capsys):
    calls = []

    class Fake:
        def complete(self, system, user):
            calls.append(system[:20])
            return "[]"
    monkeypatch.setattr("specreview.cli.make_llm", lambda name, model: Fake())
    main([str(EXAMPLE), "--llm", "anthropic", "--fail-on", "never"])
    capsys.readouterr()
    assert calls, "el modelo debería haberse consultado para los casos no cubiertos"
