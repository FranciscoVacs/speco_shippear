"""Spec 028: the intent ledger. Each test cites the requirement it verifies (028/FR-0xx), so the ledger verifies itself."""
import json
import shlex
import subprocess
import sys

import pytest

from conftest import ROOT
from specreview import approvals, ledger, members
from specreview.cli import main
from specreview.mcp import Server

# The fixture repository's citations are built at run time: written literally, this file would cite the specs of this very
# repository (its own ledger scans it) and count as evidence for rules it does not test.
S = "/"


def ref(feature: str, rid: str) -> str:
    return f"{feature}{S}{rid}"

SPEC = """# Feature Specification: Transfer limits

**Feature Branch**: `001-limits`

**Status**: Implemented

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a transfer exceeds 10,000 USD, the system MUST ask for a second approval
- **FR-002**: The system MUST reject a transfer to a blocked account

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A transfer is accepted or rejected within 2 seconds
"""
DRAFT = """# Feature Specification: Ideas

**Status**: Draft

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST suggest a limit from the last 30 days
"""


def _git(repo, *a):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=ana@x.com", "-c", "user.name=Ana", *a], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "specs" / "001-limits").mkdir(parents=True)
    (tmp_path / "specs" / "001-limits" / "spec.md").write_text(SPEC, encoding="utf-8")
    (tmp_path / "specs" / "002-ideas").mkdir(parents=True)
    (tmp_path / "specs" / "002-ideas" / "spec.md").write_text(DRAFT, encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_limits.py").write_text(
        f"def test_second_approval():\n    # verifies 001{S}FR-001\n    assert True\n\n"
        f"class TestSpeed:\n    def test_fast(self):\n        '''001-limits{S}SC-001'''\n\n"
        f"def test_ghost():\n    # 001{S}FR-009 does not exist, 007{S}FR-001 neither, 001-other{S}FR-001 names another feature\n    pass\n", encoding="utf-8")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "limits.py").write_text(f"BLOCKED = set()  # 001{S}FR-002\nX = 'FR-001 alone does not count'\n", encoding="utf-8")
    return tmp_path


def _states(led):
    return {i["ref"]: i["state"] for i in led["intents"]}


def _configure(repo, outcome: int):
    (repo / "check.py").write_text(f"import sys\nprint('ran', sys.argv[1:])\nsys.exit({outcome})\n", encoding="utf-8")
    cmd = f"{shlex.quote(sys.executable)} check.py {{nodes}}"
    (repo / "specreview.toml").write_text(f"[ledger]\nverify = {json.dumps(cmd)}\n", encoding="utf-8")


# ---------- US1: what the software does today, by evidence ----------
def test_every_requirement_appears_once_with_one_state(repo):
    """028/FR-001"""
    led = ledger.build(repo)
    refs = [i["ref"] for i in led["intents"]]
    assert sorted(refs) == [ref("001-limits", "FR-001"), ref("001-limits", "FR-002"), ref("001-limits", "SC-001"), ref("002-ideas", "FR-001")]
    assert all(i["state"] in ledger.STATES for i in led["intents"]) and sum(led["counts"].values()) == led["total"] == 4


def test_cited_by_a_test_is_covered_and_otherwise_built(repo):
    """028/FR-002, 028/FR-003"""
    led = ledger.build(repo)
    st = _states(led)
    assert st[ref("001-limits", "FR-001")] == "covered" and st[ref("001-limits", "SC-001")] == "covered"
    assert st[ref("001-limits", "FR-002")] == "built"               # cited only from code
    assert st[ref("002-ideas", "FR-001")] == "proposed"             # Draft, nobody approved it
    fr1 = ledger.find(led, ref("001", "FR-001"))
    assert [(c["file"], c["line"], c["kind"]) for c in fr1["tests"]] == [("tests/test_limits.py", 2, "test")]
    assert fr1["tests"][0]["node"] == "tests/test_limits.py::test_second_approval"
    assert ledger.find(led, ref("001", "SC-001"))["tests"][0]["node"] == "tests/test_limits.py::TestSpeed::test_fast"
    fr2 = ledger.find(led, ref("001-limits", "FR-002"))
    assert [(c["file"], c["kind"]) for c in fr2["code"]] == [("src/limits.py", "code")] and not fr2["tests"]


def test_citations_to_missing_requirements_are_orphans(repo):
    """028/FR-004"""
    orphans = {(o["feature"], o["id"]) for o in ledger.build(repo)["orphans"]}
    assert orphans == {("001", "FR-009"), ("007", "FR-001"), ("001-other", "FR-001")}


def test_what_it_does_lists_only_what_is_built(repo):
    """028/FR-005"""
    today = ledger.what_it_does(ledger.build(repo))
    assert [g["feature"] for g in today] == ["001-limits"]
    assert {r["id"] for r in today[0]["rules"]} == {"FR-001", "FR-002", "SC-001"}


def test_all_tasks_done_counts_as_implemented(repo):
    """028/FR-001: a feature without a Status line is built when every task is done"""
    d = repo / "specs" / "002-ideas"
    (d / "spec.md").write_text(DRAFT.replace("**Status**: Draft\n", ""), encoding="utf-8")
    (d / "tasks.md").write_text("# Tasks\n\n## Phase 1: Setup\n\n- [X] T001 Suggest the limit (FR-001)\n", encoding="utf-8")
    led = ledger.build(repo)
    assert _states(led)[ref("002-ideas", "FR-001")] == "built"
    assert next(f for f in led["features"] if f["key"] == "002-ideas")["implemented_by"] == "tasks"


def test_an_approved_feature_not_built_is_decided(repo):
    """028/FR-001"""
    m, _ = members.add_member(repo, "Ana", "approver", "ana@x.com")
    d = repo / "specs" / "002-ideas"
    review = ledger._review(d)
    review["decision"]["can_implement"] = True
    approvals.record(repo, "002-ideas", d, m, "approved", review)
    assert _states(ledger.build(repo))[ref("002-ideas", "FR-001")] == "decided"


# ---------- US2: verify a rule and keep the record ----------
def test_verify_runs_only_citing_tests_and_records_the_run(repo):
    """028/FR-006, 028/FR-008"""
    _configure(repo, 0)
    r = ledger.verify(repo, ref("001", "FR-001"), by="agent")
    assert r["ran"] and r["passed"] and "tests/test_limits.py::test_second_approval" in r["output_tail"]
    assert "test_fast" not in r["output_tail"]
    entry = ledger.read_record(repo, ledger.RUNS_FILE)[-1]
    assert entry["ref"] == ref("001-limits", "FR-001") and entry["text_hash"] == ledger.text_hash(
        "When a transfer exceeds 10,000 USD, the system MUST ask for a second approval")
    assert "commit" in entry and "check.py" in entry["command"]
    assert _states(ledger.build(repo))[ref("001-limits", "FR-001")] == "verified"


def test_failed_run_is_failing_and_a_reworded_rule_drops_old_runs(repo):
    """028/FR-008"""
    _configure(repo, 1)
    assert ledger.verify(repo, ref("001", "FR-001"))["passed"] is False
    assert _states(ledger.build(repo))[ref("001-limits", "FR-001")] == "failing"
    _configure(repo, 0)
    ledger.verify(repo, ref("001", "FR-001"))
    ledger.change_requirement(repo, "001", "When a transfer exceeds 15,000 USD, the system MUST ask for a second approval", rid="FR-001")
    led = ledger.build(repo)
    fr1 = ledger.find(led, ref("001", "FR-001"))
    assert fr1["state"] == "covered" and fr1["last_run"] is None and fr1["stale_run"]["passed"] is True


def test_the_record_is_chained_and_tampering_is_located(repo):
    """028/FR-007"""
    _configure(repo, 0)
    ledger.verify(repo, ref("001", "FR-001"))
    ledger.verify(repo, ref("001", "SC-001"))
    assert ledger.check_record(repo, ledger.RUNS_FILE)["ok"]
    p = repo / ".specreview" / ledger.RUNS_FILE
    lines = p.read_text().splitlines()
    e = json.loads(lines[0])
    e["passed"] = False
    p.write_text(json.dumps(e) + "\n" + lines[1] + "\n")
    chk = ledger.check_record(repo, ledger.RUNS_FILE)
    assert not chk["ok"] and chk["broken_at"] == "v_000001"
    with pytest.raises(ValueError):
        ledger.verify(repo, ref("001", "FR-001"))
    p.write_text(lines[1] + "\n")
    assert ledger.check_record(repo, ledger.RUNS_FILE)["broken_at"] == "v_000002"


def test_a_run_that_skips_everything_is_not_a_pass(repo):
    """028/FR-008: exit 0 with no test passing (all skipped) does not verify the rule"""
    _configure(repo, 0)
    with (repo / "specreview.toml").open("a") as fh:
        fh.write('passed_pattern = "\\\\d+ passed"\n')
    r = ledger.verify(repo, ref("001", "FR-001"))
    assert r["passed"] is False and "passed" in r["why"] and r["error"] is True      # 030: it ran no test, so it is not «rota» either
    assert _states(ledger.build(repo))[ref("001-limits", "FR-001")] == "covered"


def test_without_a_command_nothing_runs(repo):
    """028/FR-009"""
    r = ledger.verify(repo, ref("001", "FR-001"))
    assert r["ran"] is False and "[ledger]" in r["reason"] and "verify" in r["reason"]
    assert ledger.read_record(repo, ledger.RUNS_FILE) == []


# ---------- US3: create and correct the what ----------
def test_draft_writes_one_spec_under_the_next_number(repo):
    """028/FR-010, 028/FR-013"""
    before = {p for p in repo.rglob("*") if p.is_file()}
    r = ledger.draft_feature(repo, "Daily caps for cards", ["The system MUST cap card spending at 500 USD per day"],
                             description="Cards need a daily cap", by="agent", reason="Asked by support")
    assert r["feature"] == "003-daily-caps-for-cards" and r["wrote"] == ["specs/003-daily-caps-for-cards/spec.md"]
    new = {p for p in repo.rglob("*") if p.is_file()} - before
    assert {str(p.relative_to(repo)) for p in new} == {"specs/003-daily-caps-for-cards/spec.md", ".specreview/intent-log.jsonl"}
    text = (repo / r["wrote"][0]).read_text()
    assert "**Status**: Draft" in text and "- **FR-001**: The system MUST cap card spending at 500 USD per day" in text
    assert _states(ledger.build(repo))[ref("003-daily-caps-for-cards", "FR-001")] == "proposed"
    log = ledger.read_record(repo, ledger.INTENT_FILE)[-1]
    assert log["action"] == "draft" and log["by"]["name"] == "agent" and log["reason"] == "Asked by support"


def test_draft_slug_keeps_accented_words(repo):
    """028/FR-010"""
    r = ledger.draft_feature(repo, "Límites diarios por tarjeta", ["The system MUST cap card spending at 500 USD per day"])
    assert r["feature"] == "003-limites-diarios-por-tarjeta"


def test_change_rewords_one_rule_and_shows_what_moved(repo):
    """028/FR-011, 028/FR-013"""
    r = ledger.change_requirement(repo, "001", "When a transfer exceeds 15,000 USD, the system MUST ask for a second approval",
                                  rid="FR-001", reason="Fraud team raised it", by="agent")
    assert r["wrote"] == ["specs/001-limits/spec.md"] and r["moved"] == [{"from": "10,000 USD", "to": "15,000 USD"}]
    assert "- **FR-001**: When a transfer exceeds 15,000 USD" in (repo / "specs/001-limits/spec.md").read_text()
    log = ledger.read_record(repo, ledger.INTENT_FILE)[-1]
    assert log["before"].startswith("When a transfer exceeds 10,000") and log["after"].startswith("When a transfer exceeds 15,000")
    added = ledger.change_requirement(repo, "001", "The system fast", reason="try")
    assert added["ref"] == ref("001-limits", "FR-003") and added["action"] == "add"
    assert {f["rule"] for f in added["findings"]}                     # a vague rule gets its review back at once


def test_change_on_an_approved_feature_says_a_person_must_decide(repo):
    """028/FR-012"""
    m, _ = members.add_member(repo, "Ana", "approver", "ana@x.com")
    d = repo / "specs" / "001-limits"
    review = ledger._review(d)
    review["decision"]["can_implement"] = True
    approvals.record(repo, "001-limits", d, m, "approved", review)
    n = len(approvals.read_log(repo))
    r = ledger.change_requirement(repo, "001", "The system MUST reject a transfer to a blocked or closed account", rid="FR-002")
    assert "volver a decidir" in r["approval"]
    assert len(approvals.read_log(repo)) == n and approvals.status(repo, "001-limits", d).stale


# ---------- US4: audit how a rule got here ----------
def test_history_lists_versions_from_git_and_merges_the_timeline(repo):
    """028/FR-014, 028/FR-015"""
    _git(repo, "init", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "limits")
    spec = repo / "specs" / "001-limits" / "spec.md"
    spec.write_text(spec.read_text().replace("10,000 USD", "12,000 USD"))
    _git(repo, "commit", "-am", "raise the limit")
    ledger.change_requirement(repo, "001", "When a transfer exceeds 15,000 USD, the system MUST ask for a second approval",
                              rid="FR-001", reason="Fraud team", by="agent")
    _configure(repo, 0)
    ledger.verify(repo, ref("001", "FR-001"), by="agent")
    h = ledger.history(repo, ref("001", "FR-001"))
    versions = [e for e in h["timeline"] if e["type"] == "version"]
    assert [v["kind"] for v in versions] == ["added", "changed", "changed"]
    assert versions[0]["by"] == "Ana" and versions[1]["subject"] == "raise the limit" and versions[2]["uncommitted"] is True
    assert "12,000" in versions[1]["text"] and "10,000" in versions[1]["before"]
    types = [e["type"] for e in h["timeline"]]
    assert "intent" in types and "verification" in types


def test_history_without_git_shows_the_current_version(repo, monkeypatch):
    """028/FR-016"""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(repo.parent))
    h = ledger.history(repo, ref("001", "FR-002"))
    assert h["git"] is False and "Sin historial" in h["note"]
    assert [e["kind"] for e in h["timeline"] if e["type"] == "version"] == ["current"]


# ---------- US5: terminal, agent and app ----------
def test_ledger_command_prints_text_json_and_markdown(repo, capsys):
    """028/FR-017"""
    assert main(["ledger", str(repo)]) == 0
    out = capsys.readouterr().out
    assert "4 reglas" in out and "con test, sin correr 2" in out and "Evidencia huérfana (3)" in out
    assert main(["ledger", str(repo), "-f", "json"]) == 0
    assert json.loads(capsys.readouterr().out)["counts"]["covered"] == 2
    assert main(["ledger", str(repo), "-f", "markdown"]) == 0
    assert capsys.readouterr().out.startswith("## El qué")


def test_ledger_command_strict_fails_on_built_or_failing(repo, capsys):
    """028/FR-018"""
    assert main(["ledger", str(repo), "--strict"]) == 1                # FR-002 of the fixture is built without a test
    (repo / "tests" / "test_blocked.py").write_text(f"def test_blocked():\n    # 001{S}FR-002\n    pass\n")
    assert main(["ledger", str(repo), "--strict"]) == 0
    _configure(repo, 1)
    ledger.verify(repo, ref("001", "FR-002"))
    assert main(["ledger", str(repo), "--strict"]) == 1


def test_mcp_tools_and_instructions_put_the_ledger_first(repo):
    """028/FR-020, 028/FR-010, 028/FR-011"""
    srv = Server(repo)
    init = srv.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})["result"]
    assert "what_it_does" in init["instructions"] and "antes de leer código" in init["instructions"].lower()
    names = {t["name"] for t in srv.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]}
    assert {"what_it_does", "intent_ledger", "get_intent", "intent_history", "verify_intent", "draft_feature", "change_requirement"} <= names

    def call(name, **a):
        r = srv.handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": name, "arguments": a}})["result"]
        assert not r["isError"], r["content"][0]["text"]
        return r["structuredContent"]
    assert call("what_it_does")["features"][0]["feature"] == "001-limits"
    assert [r["id"] for r in call("what_it_does", query="blocked")["features"][0]["rules"]] == ["FR-002"]
    assert call("what_it_does", feature="002")["features"] == [] and call("what_it_does", query="limits")["features"][0]["rules"]
    assert call("get_intent", ref=ref("001", "FR-001"))["state"] == "covered"
    assert call("intent_ledger", state="built")["intents"][0]["ref"] == ref("001-limits", "FR-002")
    assert call("draft_feature", title="Card caps", requirements=["The system MUST cap cards at 500 USD per day"])["feature"].startswith("003-")
    assert call("change_requirement", feature="001", id="FR-002", text="The system MUST reject a transfer to a closed account")["action"] == "change"
    assert call("verify_intent", ref=ref("001", "FR-001"))["ran"] is False


def test_server_serves_the_ledger(repo):
    """028/FR-019"""
    import threading
    import urllib.request

    from specreview.server import make_server
    httpd = make_server(repo, port=0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        port = httpd.server_address[1]
        led = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ledger").read())
        assert led["total"] == 4 and led["counts"]["covered"] == 2
        h = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ledger/history?ref=001{S}FR-001").read())
        assert h["ref"] == ref("001-limits", "FR-001")
    finally:
        httpd.shutdown()


def test_this_feature_is_covered_by_its_own_tests():
    """028/SC-002: dogfooding, every rule of spec 028 is cited by a test of this file"""
    led = ledger.build(ROOT)
    mine = [i for i in led["intents"] if i["feature"] == "028-intent-ledger" and i["id"] != "SC-001"]
    assert mine and all(i["state"] in ("covered", "verified") for i in mine), [i["ref"] for i in mine if i["state"] not in ("covered", "verified")]


def test_ledger_of_a_large_repository_is_fast():
    """028/SC-001: this repository (27 features, hundreds of files) well under 5 seconds"""
    import time
    t = time.perf_counter()
    ledger.build(ROOT)
    assert time.perf_counter() - t < 5
