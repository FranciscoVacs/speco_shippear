"""Spec 029: decided values. Each test cites the requirement it verifies (029/FR-0xx)."""
import json
import subprocess
import time

import pytest

from specreview import ledger, values
from specreview.cli import main

S = "/"   # fixture citations are built at run time, so this file does not cite the fixture's rules as this repository's


def ref(feature: str, rid: str) -> str:
    return f"{feature}{S}{rid}"


SPEC = """# Feature Specification: Referrals

**Feature Branch**: `001-referrals`

**Status**: Implemented

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the invited company gets its first result, the system MUST grant 20 credits to each company
- **FR-002**: If a person already earned for 10 referrals in a calendar month, then the system MUST NOT grant them more that month

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The credits a person earns from referrals in one calendar month never exceed 200
"""
SQL = "insert into settings values\n  ('reward', 20),\n  ('monthly_cap', 10);\n"
TOML = """[values]
"001{S}FR-001" = {{ file = "settings.sql", match = "'reward',\\\\s*(\\\\d+)" }}
"001{S}FR-002" = {{ file = "settings.sql", match = "'monthly_cap',\\\\s*(\\\\d+)" }}
""".format(S=S)


def _git(repo, *a, name="Ana"):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=x@x.com", "-c", f"user.name={name}", *a], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "specs" / "001-referrals").mkdir(parents=True)
    (tmp_path / "specs" / "001-referrals" / "spec.md").write_text(SPEC, encoding="utf-8")
    (tmp_path / "settings.sql").write_text(SQL, encoding="utf-8")
    (tmp_path / "specreview.toml").write_text(TOML, encoding="utf-8")
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "add", "-A")
    _git(tmp_path, "commit", "-qm", "init")
    return tmp_path


def _intent(repo, rid):
    return ledger.find(ledger.build(repo), ref("001", rid))


def _raise_cap(repo, to="25"):
    (repo / "settings.sql").write_text(SQL.replace("10)", f"{to})"), encoding="utf-8")
    _git(repo, "commit", "-qam", "Boost growth: raise the cap", name="Dev Growth")


def test_a_matching_binding_reads_the_number_and_keeps_the_state(repo):
    # verifies 029/FR-001
    i = _intent(repo, "FR-002")
    assert i["state"] == "built"
    assert [(v["status"], v["found"], v["line"]) for v in i["values"]] == [("ok", "10", 3)]


def test_a_drift_breaks_the_rule_and_shows_both_numbers_and_where(repo):
    # verifies 029/FR-002
    _raise_cap(repo)
    i = _intent(repo, "FR-002")
    assert i["state"] == "failing"
    assert i["values"][0]["status"] == "drift"
    assert "la regla dice 10" in i["reason"] and "settings.sql:3 tiene 25" in i["reason"]


def test_a_drift_names_the_commit_author_and_date_that_changed_the_line(repo):
    # verifies 029/FR-003
    _raise_cap(repo)
    who = _intent(repo, "FR-002")["values"][0]["changed_by"]
    head = subprocess.run(["git", "-C", str(repo), "rev-parse", "--short=7", "HEAD"], capture_output=True, text=True).stdout.strip()
    assert (who["commit"], who["author"], who["subject"]) == (head, "Dev Growth", "Boost growth: raise the cap")
    assert who["date"][:4].isdigit()
    out = ledger.render_text(ledger.build(repo))
    assert "Rotas (1)" in out and "por Dev Growth" in out


def test_a_missing_file_or_a_pattern_that_matches_nothing_is_a_broken_binding(repo):
    # verifies 029/FR-004
    (repo / "specreview.toml").write_text(TOML.replace("settings.sql\", match = \"'reward'", "gone.sql\", match = \"'reward'")
                                          .replace("monthly_cap", "nope"), encoding="utf-8")
    led = ledger.build(repo)
    a, b = ledger.find(led, ref("001", "FR-001")), ledger.find(led, ref("001", "FR-002"))
    assert a["values"][0]["status"] == "broken" and "no existe gone.sql" in a["values"][0]["reason"]
    assert b["values"][0]["status"] == "broken" and "no encuentra nada" in b["values"][0]["reason"]


def test_a_rule_with_a_broken_binding_is_never_verified(repo):
    # verifies 029/FR-005
    (repo / "tests").mkdir()
    (repo / "tests" / "test_cap.py").write_text(f"def test_cap():\n    # verifies {ref('001', 'FR-002')}\n    assert True\n", encoding="utf-8")
    (repo / "specreview.toml").write_text(TOML.replace("monthly_cap", "nope") + '\n[ledger]\nverify = "python -m pytest -q {nodes}"\n',
                                          encoding="utf-8")
    r = ledger.verify(repo, ref("001", "FR-002"))
    assert r["passed"]
    assert _intent(repo, "FR-002")["state"] == "failing"


def test_moving_a_number_lists_the_binding_with_the_old_number_and_the_rules_in_the_same_unit(repo):
    # verifies 029/FR-006
    r = ledger.change_requirement(repo, "001", "When the invited company gets its first result, the system MUST grant 30 credits to each company",
                                  "FR-001", reason="test")
    assert [(b["file"], b["holds"]) for b in r["touches"]["bindings"]] == [("settings.sql", "20")]
    assert [x["ref"] for x in r["touches"]["rules"]] == [f"001-referrals{S}SC-001"]
    assert r["touches"]["rules"][0]["mentions"] == ["200"]


def test_a_run_says_how_many_commits_ago_it_ran(repo):
    # verifies 029/FR-007
    (repo / "tests").mkdir()
    (repo / "tests" / "test_cap.py").write_text(f"def test_cap():\n    # verifies {ref('001', 'FR-002')}\n    assert True\n", encoding="utf-8")
    (repo / "specreview.toml").write_text(TOML + '\n[ledger]\nverify = "python -m pytest -q {nodes}"\n', encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "test")
    ledger.verify(repo, ref("001", "FR-002"))
    assert _intent(repo, "FR-002")["run_age"] == 0
    for n in range(2):
        (repo / f"f{n}.txt").write_text("x", encoding="utf-8")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-qm", f"c{n}")
    assert _intent(repo, "FR-002")["run_age"] == 2


def test_the_ledger_reports_the_drift_fast_and_without_running_tests(repo, capsys):
    # verifies 029/SC-001
    _raise_cap(repo)
    t = time.perf_counter()
    assert main(["ledger", str(repo), "-f", "json"]) == 0
    assert time.perf_counter() - t < 5
    led = json.loads(capsys.readouterr().out)
    assert ledger.find(led, ref("001", "FR-002"))["state"] == "failing"
    assert not (repo / ".specreview" / "verifications.jsonl").exists()


def test_three_builds_report_the_same_bound_values(repo):
    # verifies 029/SC-002
    _raise_cap(repo)
    seen = {json.dumps([i["values"] for i in ledger.build(repo)["intents"]], sort_keys=True) for _ in range(3)}
    assert len(seen) == 1


def test_numbers_are_normalised():
    assert values.numbers("over 10,000 USD in 2.50 days, 0 errors") == ["10000", "2.5", "0"]


def test_diff_names_the_decided_number_a_change_moves_in_the_code(repo, capsys):
    # verifies 029/FR-002
    _raise_cap(repo)
    assert main(["diff", "HEAD~1", "--path", str(repo)]) == 1
    out = capsys.readouterr().out
    assert "mueve un número que decidió producto" in out
    assert "`settings.sql:3` pasa a **25** (antes 10)" in out
    assert main(["diff", "HEAD", "--path", str(repo)]) == 0             # nothing moved since HEAD: the old drift is not this change's
