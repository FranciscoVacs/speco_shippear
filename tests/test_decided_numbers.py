"""Spec 031: decided numbers reach product. Each test cites the requirement it verifies (031/FR-0xx)."""
import subprocess

import pytest

from conftest import ROOT
from specreview import ledger
from specreview.analyzers import Context, run_all
from specreview.parser import load_feature
from specreview.product import load_product

S = "/"   # fixture citations are built at run time, so this file does not cite the fixture's rules as this repository's


def ref(feature: str, rid: str) -> str:
    return f"{feature}{S}{rid}"


SPEC = """# Feature Specification: Referrals

**Feature Branch**: `001-referrals`

**Status**: Implemented

**Goals**: G-1

**Decisions**: D-001

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: If a person already earned for 10 referrals in a calendar month, then the system MUST NOT grant them more that month
"""
DECISIONS = """# Decisions

## D-001: A referral is rewarded with credits
**Status**: accepted
**Date**: 2026-10-16
**Fixes**: 001{S}FR-001 = 10
""".format(S=S)


def _git(repo, *a, name="Ana"):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=x@x.com", "-c", f"user.name={name}", *a], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "specs" / "001-referrals").mkdir(parents=True)
    (tmp_path / "specs" / "001-referrals" / "spec.md").write_text(SPEC, encoding="utf-8")
    (tmp_path / "product").mkdir()
    (tmp_path / "product" / "goals.md").write_text("# Goals\n\n- **G-1**: Grow by referrals\n", encoding="utf-8")
    (tmp_path / "product" / "decisions.md").write_text(DECISIONS, encoding="utf-8")
    (tmp_path / "settings.sql").write_text("insert into t values ('referral_monthly_cap', 10);\n", encoding="utf-8")
    (tmp_path / "specreview.toml").write_text(f'[values]\n"001{S}FR-001" = {{ file = "settings.sql", match = "\'referral_monthly_cap\',\\\\s*(\\\\d+)" }}\n',
                                              encoding="utf-8")
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-qm", "init")
    return tmp_path


def _prd7(repo):
    f = load_feature(repo / "specs" / "001-referrals")
    return [x for x in run_all(f, Context()) if x.rule == "PRD007"]


def test_a_decision_reads_the_numbers_it_fixes_and_a_matching_rule_has_no_finding(repo):
    # verifies 031/FR-001
    assert load_product(repo).decisions["D-001"].fixes == [("001", "FR-001", "10")]
    assert _prd7(repo) == []


def test_a_rule_that_disagrees_with_its_decision_is_a_blocker(repo):
    # verifies 031/FR-002
    p = repo / "specs" / "001-referrals" / "spec.md"
    p.write_text(SPEC.replace("for 10 referrals", "for 15 referrals"), encoding="utf-8")
    [f] = _prd7(repo)
    assert f.severity.name == "BLOCKER" and f.ids == ["FR-001", "D-001"] and "10" in f.message and "D-001" in f.message


def test_a_number_moved_in_the_code_names_the_decision(repo):
    # verifies 031/FR-003
    (repo / "settings.sql").write_text("insert into t values ('referral_monthly_cap', 25);\n", encoding="utf-8")
    _git(repo, "commit", "-qam", "raise", name="Dev Growth")
    i = ledger.find(ledger.build(repo), ref("001", "FR-001"))
    assert i["state"] == "failing" and "lo fijó D-001" in i["reason"]
    assert i["values"][0]["decisions"] == [{"id": "D-001", "title": "A referral is rewarded with credits", "number": "10"}]


def test_changing_a_decided_number_lists_the_decision_and_asks_a_person(repo):
    # verifies 031/FR-004
    r = ledger.change_requirement(repo, "001", "If a person already earned for 25 referrals in a calendar month, then the system MUST NOT "
                                  "grant them more that month", "FR-001", reason="growth")
    assert [d["id"] for d in r["touches"]["decisions"]] == ["D-001"]
    assert "D-001 fijó 10" in r["decision"] and "decidir de nuevo" in r["decision"]
    assert r["verdict"] == "needs_decision"                             # the review itself sends it to a person too (PRD007)


def test_on_this_repository_d015_states_the_referral_numbers_and_021_agrees():
    # verifies 031/SC-001
    fixes = {(f, i): n for f, i, n in load_product(ROOT).decisions["D-015"].fixes}
    assert fixes[("021", "FR-008")] == "10" and fixes[("021", "FR-005")] == "20"
    assert [x for x in run_all(load_feature(ROOT / "specs" / "021-referrals"), Context()) if x.rule == "PRD007"] == []
