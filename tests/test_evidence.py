"""Spec 030: continuous evidence. Each test cites the requirement it verifies (030/FR-0xx)."""
import json
import subprocess
import sys
import time

import pytest

from conftest import ROOT
from specreview import evidence, ledger
from specreview.cli import main

S = "/"   # fixture citations are built at run time, so this file does not cite the fixture's rules as this repository's


def ref(feature: str, rid: str) -> str:
    return f"{feature}{S}{rid}"


SPEC = """# Feature Specification: Referrals

**Feature Branch**: `001-referrals`

**Status**: Implemented

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: If a person already earned for 10 referrals in a calendar month, then the system MUST NOT grant them more that month
- **FR-002**: The system MUST reject a code that does not exist
- **FR-003**: The system MUST show the referrals of a person
"""


def _git(repo, *a):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=x@x.com", "-c", "user.name=Ana", *a], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "specs" / "001-referrals").mkdir(parents=True)
    (tmp_path / "specs" / "001-referrals" / "spec.md").write_text(SPEC, encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_ref.py").write_text(
        f"def test_cap():\n    # verifies {ref('001', 'FR-001')}\n    assert True\n\n\n"
        f"def test_unknown_code():\n    # verifies {ref('001', 'FR-002')}\n    assert True\n\n\n"
        f"def test_unknown_code_twice():\n    # verifies {ref('001', 'FR-002')}\n    assert True\n", encoding="utf-8")
    (tmp_path / "settings.sql").write_text("insert into settings values ('referral_monthly_cap', 10), ('page_size', 10);\n", encoding="utf-8")
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-qm", "init")
    return tmp_path


def _junit(path, cases):
    """cases: [(classname, name, outcome)]"""
    body = []
    for cls, name, out in cases:
        inner = {"passed": "", "failed": '<failure message="boom">boom</failure>', "skipped": '<skipped message="s"/>'}[out]
        body.append(f'<testcase classname="{cls}" name="{name}" time="0.01">{inner}</testcase>')
    path.write_text(f'<?xml version="1.0"?><testsuites><testsuite name="pytest">{"".join(body)}</testsuite></testsuites>', encoding="utf-8")
    return path


def _state(repo, rid):
    return ledger.find(ledger.build(repo), ref("001", rid))["state"]


# ---------- US1: an error of the environment is not a broken rule ----------
def test_a_runner_that_is_not_installed_is_recorded_as_an_error(repo):
    # verifies 030/FR-001
    (repo / "no_pytest.py").write_text("import sys\nsys.stderr.write(sys.executable + ': No module named pytest\\n')\nsys.exit(1)\n",
                                       encoding="utf-8")
    (repo / "specreview.toml").write_text(f'[ledger]\nverify = "{sys.executable} no_pytest.py {{files}}"\n', encoding="utf-8")
    r = ledger.verify(repo, ref("001", "FR-001"))                         # what happened in docs/40: python without pytest
    assert r["error"] is True and r["passed"] is False and "entorno" in r["why"]
    (repo / "specreview.toml").write_text('[ledger]\nverify = "no-such-binary-xyz {files}"\n', encoding="utf-8")
    r = ledger.verify(repo, ref("001", "FR-001"))
    assert r["error"] is True and "No module" not in r["output_tail"]
    assert [e.get("error") for e in ledger.read_record(repo, ledger.RUNS_FILE)] == [True, True]
    assert _state(repo, "FR-001") == "covered"


def test_an_error_keeps_the_state_the_rule_had(repo):
    # verifies 030/FR-002
    (repo / "specreview.toml").write_text(f'[ledger]\nverify = "{sys.executable} -m pytest -q {{nodes}}"\n', encoding="utf-8")
    assert ledger.verify(repo, ref("001", "FR-001"))["passed"]
    (repo / "specreview.toml").write_text('[ledger]\nverify = "no-such-binary-xyz {files}"\n', encoding="utf-8")
    assert ledger.verify(repo, ref("001", "FR-001"))["error"]
    i = ledger.find(ledger.build(repo), ref("001", "FR-001"))
    assert i["state"] == "verified" and i["last_error"]["error"] is True


# ---------- US2: one run of the suite verifies every rule ----------
def test_a_report_where_the_citing_tests_passed_verifies_the_rule_on_this_commit(repo):
    # verifies 030/FR-003
    report = _junit(repo / "r.xml", [("tests.test_ref", "test_cap", "passed")])
    r = evidence.import_junit(repo, report)
    assert r["recorded"] == 1 and r["verified"] == 1
    head = subprocess.run(["git", "-C", str(repo), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    i = ledger.find(ledger.build(repo), ref("001", "FR-001"))
    assert i["state"] == "verified" and i["last_run"]["commit"] == head and i["run_age"] == 0


def test_one_failed_citing_test_makes_the_rule_failing(repo):
    # verifies 030/FR-004
    report = _junit(repo / "r.xml", [("tests.test_ref", "test_unknown_code", "passed"), ("tests.test_ref", "test_unknown_code_twice", "failed")])
    r = evidence.import_junit(repo, report)
    assert [b["ref"] for b in r["broken"]] == ["001-referrals" + S + "FR-002"]
    assert _state(repo, "FR-002") == "failing"


def test_a_rule_whose_tests_are_not_in_the_report_gets_nothing(repo):
    # verifies 030/FR-005
    report = _junit(repo / "r.xml", [("tests.test_ref", "test_cap", "passed"), ("tests.test_ref", "test_unknown_code", "skipped"),
                                     ("tests.test_ref", "test_unknown_code_twice", "skipped")])
    evidence.import_junit(repo, report)
    refs = {e["ref"] for e in ledger.read_record(repo, ledger.RUNS_FILE)}
    assert refs == {"001-referrals" + S + "FR-001"}                       # FR-002 only skipped, FR-003 has no test
    assert _state(repo, "FR-002") == "covered"


def test_verify_all_runs_the_suite_once_and_imports_its_report(repo, capsys):
    # verifies 030/FR-006
    (repo / "specreview.toml").write_text(f'[ledger]\nsuite = "{sys.executable} -m pytest -q -p no:cacheprovider --junitxml {{junit}}"\n',
                                          encoding="utf-8")
    assert main(["ledger", str(repo), "--verify-all"]) == 0
    assert "2 verificadas · 0 rotas" in capsys.readouterr().out
    assert {_state(repo, "FR-001"), _state(repo, "FR-002")} == {"verified"}
    assert len({e["command"] for e in ledger.read_record(repo, ledger.RUNS_FILE)}) == 1


def test_a_report_that_breaks_a_rule_names_it_and_exits_1(repo, capsys):
    # verifies 030/FR-007
    report = _junit(repo / "r.xml", [("tests.test_ref", "test_cap", "failed")])
    assert main(["ledger", str(repo), "--junit", str(report), "--no-record"]) == 1
    out = capsys.readouterr().out
    assert "rompe lo que dicen estas reglas" in out and "10 referrals in a calendar month" in out and "test_cap" in out
    assert not (repo / ".specreview" / "verifications.jsonl").exists()


def test_importing_a_report_of_700_tests_is_fast(repo):
    # verifies 030/SC-002
    report = _junit(repo / "r.xml", [("tests.test_ref", "test_cap", "passed")] + [(f"tests.test_other{i}", f"test_{i}", "passed") for i in range(700)])
    t = time.perf_counter()
    evidence.import_junit(repo, report)
    assert time.perf_counter() - t < 5


# ---------- US3: the agent proposes the bindings ----------
def test_suggestions_propose_the_line_and_write_nothing(repo, capsys):
    # verifies 030/FR-008
    before = sorted(p.name for p in repo.iterdir())
    found = evidence.suggest_values(repo)
    assert [(f["ref"], f["file"], f["line"], f["number"], f["identifier"]) for f in found] == [
        ("001-referrals" + S + "FR-001", "settings.sql", 1, "10", "referral_monthly_cap")]     # page_size shares no word with the rule
    assert main(["ledger", str(repo), "--suggest-values"]) == 0
    assert "'referral_monthly_cap'" in capsys.readouterr().out
    assert sorted(p.name for p in repo.iterdir()) == before


def test_a_suggestion_is_kept_only_when_its_first_match_is_that_line(repo):
    # verifies 030/FR-009
    (repo / "settings.sql").write_text("-- old: ('referral_monthly_cap', 5)\ninsert into t values ('referral_monthly_cap', 7);\n"
                                       "insert into t values ('referral_monthly_cap', 10);\n", encoding="utf-8")
    assert evidence.suggest_values(repo) == []                            # the first match holds 5, so the binding would read the wrong line
    (repo / "settings.sql").write_text("insert into t values ('referral_monthly_cap', 10);\n", encoding="utf-8")
    [s] = evidence.suggest_values(repo)
    (repo / "specreview.toml").write_text(evidence.to_toml([s]), encoding="utf-8")
    i = ledger.find(ledger.build(repo), ref("001", "FR-001"))
    assert [(v["status"], v["found"]) for v in i["values"]] == [("ok", "10")]


def test_on_this_repository_the_suggestions_include_the_bindings_a_person_wrote():
    # verifies 030/SC-001
    found = evidence.suggest_values(ROOT, include_bound=True)
    best = {}
    for f in found:
        best.setdefault(f["ref"], f)
    for rid, ident in (("FR-005", "referral_reward"), ("FR-008", "referral_monthly_cap"), ("FR-009", "referral_expiry_months"),
                       ("FR-013", "referral_held_months")):
        assert best["021-referrals" + S + rid]["identifier"] == ident


def test_the_mcp_tool_proposes_and_writes_nothing(repo):
    from specreview.mcp import Server
    out = Server(repo).t_suggest_values({})
    assert "referral_monthly_cap" in out["toml"] and json.dumps(out)
