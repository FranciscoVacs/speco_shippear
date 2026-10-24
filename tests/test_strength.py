"""Spec 032: evidence strength. Each test cites the rule it verifies (032/FR-0xx), so the ledger verifies itself."""
import json
import shlex
import subprocess
import sys
import time

import pytest
from conftest import ROOT

from specreview import evidence, ledger, strength
from specreview.cli import main
from specreview.intent_diff import render_comment

S = "/"   # fixture citations are built at run time, so this file does not cite the fixture's rules as this repository's


def ref(feature: str, rid: str) -> str:
    return f"{feature}{S}{rid}"


SPEC = """# Feature Specification: Transfer limits

**Status**: Implemented

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a transfer exceeds 10,000 USD, the system MUST ask for a second approval
- **FR-002**: The system MUST NOT accept a transfer to a blocked account
- **FR-003**: The system MUST show the daily limit on the transfer page
"""

TESTS = (f"def test_cap():\n    # verifies {ref('001', 'FR-001')}\n    assert 15000 > 10000\n\n\n"
         f"def test_blocked():\n    # verifies {ref('001', 'FR-002')}\n    assert True\n")


def _git(repo, *a):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=ana@x.com", "-c", "user.name=Ana", *a], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "specs" / "001-limits").mkdir(parents=True)
    (tmp_path / "specs" / "001-limits" / "spec.md").write_text(SPEC, encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_limits.py").write_text(TESTS, encoding="utf-8")
    (tmp_path / "check.py").write_text("import sys\nprint('ran', sys.argv[1:])\nsys.exit(0)\n", encoding="utf-8")
    cmd = f"{shlex.quote(sys.executable)} check.py {{nodes}}"
    (tmp_path / "specreview.toml").write_text(f"[ledger]\nverify = {json.dumps(cmd)}\n", encoding="utf-8")
    return tmp_path


def _intent(root, rid="FR-001"):
    return next(i for i in ledger.build(root)["intents"] if i["id"] == rid)


def _edit(repo, old, new):
    p = repo / "tests" / "test_limits.py"
    p.write_text(p.read_text(encoding="utf-8").replace(old, new), encoding="utf-8")


def test_a_run_records_the_fingerprint_of_each_citing_test(repo):
    """032/FR-001"""
    ledger.verify(repo, ref("001", "FR-001"))
    run = ledger.read_record(repo, ledger.RUNS_FILE)[-1]
    assert list(run["test_hashes"]) == ["tests/test_limits.py::test_cap"]
    assert len(run["test_hashes"]["tests/test_limits.py::test_cap"]) == 16


def test_editing_the_body_of_the_test_turns_the_rule_back_to_covered(repo):
    """032/FR-002, 032/SC-002"""
    ledger.verify(repo, ref("001", "FR-001"))
    assert _intent(repo)["state"] == "verified"
    _edit(repo, "assert 15000 > 10000", "assert True")              # what an agent does to make a rule «pass»
    i = _intent(repo)
    assert i["state"] == "covered"
    assert i["last_run"] is None and i["stale_run"]["passed"] is True


def test_the_ledger_names_the_tests_that_changed(repo, capsys):
    """032/FR-003"""
    ledger.verify(repo, ref("001", "FR-001"))
    _edit(repo, "assert 15000 > 10000", "assert True")
    assert _intent(repo)["changed_tests"] == ["tests/test_limits.py::test_cap"]
    main(["ledger", str(repo)])
    out = capsys.readouterr().out
    assert "Tests editados desde su última corrida (1)" in out and "tests/test_limits.py::test_cap" in out


def test_formatting_and_other_tests_do_not_invalidate_the_run(repo):
    """032/FR-002: the fingerprint is the test's own source, whitespace aside"""
    ledger.verify(repo, ref("001", "FR-001"))
    _edit(repo, "assert 15000 > 10000", "assert   15000 > 10000")
    _edit(repo, "def test_blocked():\n    # verifies", "def test_blocked():\n    x = 1\n    # verifies")
    assert _intent(repo)["state"] == "verified"


def test_a_new_test_citing_the_rule_waits_for_its_own_run(repo):
    """032/FR-004"""
    ledger.verify(repo, ref("001", "FR-001"))
    p = repo / "tests" / "test_limits.py"
    p.write_text(p.read_text(encoding="utf-8") + f"\n\ndef test_cap_again():\n    # verifies {ref('001', 'FR-001')}\n    assert True\n",
                 encoding="utf-8")
    i = _intent(repo)
    assert i["state"] == "covered" and i["changed_tests"] == ["tests/test_limits.py::test_cap_again"]
    ledger.verify(repo, ref("001", "FR-001"))
    assert _intent(repo)["state"] == "verified"


def test_a_run_without_fingerprints_counts_as_before(repo):
    """032/FR-005"""
    ledger.verify(repo, ref("001", "FR-001"))
    runs = ledger.read_record(repo, ledger.RUNS_FILE)
    old = {k: v for k, v in runs[-1].items() if k not in ("test_hashes", "hash", "prev", "id", "at")}
    (repo / ".specreview" / ledger.RUNS_FILE).unlink()
    ledger.append_record(repo, ledger.RUNS_FILE, old, "v")             # a run recorded before spec 032
    _edit(repo, "assert 15000 > 10000", "assert True")
    assert _intent(repo)["state"] == "verified"


def test_a_junit_import_records_fingerprints_too(repo):
    """032/FR-001"""
    (repo / "report.xml").write_text('<testsuite><testcase classname="tests.test_limits" name="test_cap"/></testsuite>', encoding="utf-8")
    evidence.import_junit(repo, repo / "report.xml")
    assert "tests/test_limits.py::test_cap" in ledger.read_record(repo, ledger.RUNS_FILE)[-1]["test_hashes"]
    _edit(repo, "assert 15000 > 10000", "assert True")
    assert _intent(repo)["state"] == "covered"


def test_the_review_of_a_change_lists_the_rule_whose_test_it_edits(repo, capsys):
    """032/FR-006"""
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "add", ".")
    _git(repo, "commit", "-qm", "base")
    _git(repo, "checkout", "-qb", "agent")
    _edit(repo, "assert 15000 > 10000", "assert True")
    rows = strength.edited_tests(ledger.build(repo), lambda path: subprocess.run(
        ["git", "-C", str(repo), "show", f"main:{path}"], capture_output=True, text=True).stdout or None)
    assert [(r["ref"], [t["test"] for t in r["tests"]]) for r in rows] == [(ref("001-limits", "FR-001"), ["tests/test_limits.py::test_cap"])]
    body = render_comment([], edited=rows)
    assert "toca el test de una regla" in body and f"`{ref('001-limits', 'FR-001')}`" in body and "no cambia ninguna spec" not in body
    main(["diff", "main", "--path", str(repo)])
    assert ref("001-limits", "FR-001") in capsys.readouterr().out


def test_evidence_is_labeled_examples_or_generated_cases(repo, capsys):
    """032/FR-007"""
    p = repo / "tests" / "test_limits.py"
    p.write_text("from hypothesis import given, strategies as st\n\n\n@given(st.integers(min_value=10001))\n"
                 f"def test_cap(amount):\n    # verifies {ref('001', 'FR-001')}\n    assert amount > 10000\n\n\n"
                 f"def test_blocked():\n    # verifies {ref('001', 'FR-002')}\n    assert True\n", encoding="utf-8")
    assert _intent(repo, "FR-001")["evidence"] == "generated"
    assert _intent(repo, "FR-002")["evidence"] == "examples"
    assert _intent(repo, "FR-003")["evidence"] is None
    main(["ledger", str(repo)])
    out = capsys.readouterr().out
    assert "casos generados" in out and "ejemplos" in out


def test_no_evidence_is_ever_labeled_proved(repo):
    """032/FR-008"""
    assert "proved" not in strength.KINDS and not any("prob" in v or "demostr" in v for v in strength.KINDS.values())
    assert {i["evidence"] for i in ledger.build(ROOT)["intents"]} <= {None, *strength.KINDS}


def test_each_functional_requirement_gets_a_shape(repo):
    """032/FR-009"""
    sh = strength.shapes(ledger.build(repo))
    assert {r["ref"]: r["shape"] for r in sh["rules"]} == {
        ref("001-limits", "FR-001"): "conditional", ref("001-limits", "FR-002"): "invariant", ref("001-limits", "FR-003"): "not_formalizable"}
    assert strength.shape("While a run has no fingerprints, the system MUST count it") == "invariant"
    assert strength.shape("The page MUST load fast", vague=True) == "not_formalizable"


def test_the_shape_is_printed_with_counts_percentages_and_total(repo, capsys):
    """032/FR-010"""
    main(["ledger", str(repo), "--shape"])
    out = capsys.readouterr().out
    assert "3 requisitos funcionales (N = 3)" in out
    assert "invariante" in out and "33.3 %" in out
    main(["ledger", str(repo), "--shape", "-f", "json"])
    sh = json.loads(capsys.readouterr().out)
    assert sh["total"] == 3 and sum(sh["counts"].values()) == 3


def test_the_ledger_of_this_repository_with_fingerprints_builds_in_under_5_seconds():
    """032/SC-001"""
    t = time.perf_counter()
    led = ledger.build(ROOT)
    assert time.perf_counter() - t < 5
    assert any(i["evidence"] for i in led["intents"])
