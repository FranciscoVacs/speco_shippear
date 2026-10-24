"""The product's promise, end to end, as the people who use it would live it (docs/16 §3, docs/37).

One test per person: the developer who tries it, the product manager who reads a pull request, the approver, the coding agent, the team
that adopts it in CI, and the engineer who traces requirements to tests. They drive the real CLI and MCP in-process on a copy of the
wire-transfers example, so a change that breaks the story breaks a test, not a demo.
"""
import json
import os
import shutil
import subprocess
import time

import pytest

from conftest import ROOT
from specreview.cli import main
from specreview.mcp import Server

WIRES = ROOT / "examples" / "wire-transfers"
FEATURE = "006-wire-transfer-limits"
SPEC = f"specs/{FEATURE}/spec.md"


def run(capsys, *argv):
    code = main([*map(str, argv)])
    out = capsys.readouterr()
    return code, out.out, out.err


def git(root, *args):
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A git repository on `main` holding the wire-transfers example."""
    r = tmp_path / "repo"
    shutil.copytree(WIRES, r)
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    git(r, "init", "-q", "-b", "main")
    git(r, "add", "-A")
    git(r, "commit", "-qm", "base")
    monkeypatch.chdir(r)
    monkeypatch.delenv("SPECREVIEW_TOKEN", raising=False)
    return r


def call(root, tool, **arguments):
    reply = Server(root).handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": arguments}})
    return reply["result"]["content"][0]["text"]


def edit(root, old, new, path=SPEC):
    p = root / path
    text = p.read_text(encoding="utf-8")
    assert old in text
    p.write_text(text.replace(old, new), encoding="utf-8")


# ---- the developer: a first result in a few minutes (G-7), with no repository, network or key ----
# verifies: 023/FR-001
def test_a_developer_sees_the_first_result_in_seconds_without_a_repo_or_a_key(tmp_path, capsys, monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    t0 = time.perf_counter()
    code, out, _ = run(capsys, "demo", "--dir", tmp_path / "demo")
    assert time.perf_counter() - t0 < 5 and code == 0
    assert "2 bloqueantes" in out and "CON001" in out and "COV001" in out          # a contradiction and a requirement nobody builds


# ---- the product manager: a pull request that moves a business value ----
# verifies: 026/FR-002, FR-004, FR-012
def test_a_pull_request_that_moves_a_threshold_is_explained_in_business_terms(repo, capsys):
    git(repo, "checkout", "-q", "-b", "raise-limit")
    edit(repo, "above 10,000 USD", "above 15,000 USD")
    code, out, _ = run(capsys, "diff", "main", "-f", "markdown")
    assert "10,000 USD → 15,000 USD" in out and "FR-005" in out
    assert "todavía dice «10,000 USD»" in out                           # the task that would still build the old rule
    assert "bloqueantes nuevos" in out or "sin bloqueantes nuevos" in out
    assert code == 0                                                   # moving a number is not a blocker by itself


# verifies: 026/FR-005, FR-013
def test_a_pull_request_that_adds_a_contradiction_fails_and_names_it(repo, capsys):
    git(repo, "checkout", "-q", "-b", "fee")
    edit(repo, "- **FR-010**:", "- **FR-012**: When a customer is tier 3, the system MUST charge a fee of 1% of the amount, with a minimum of 2.00 USD\n- **FR-010**:")
    code, out, _ = run(capsys, "diff", "main", "-f", "markdown")
    assert code == 1 and "CON001" in out and "FR-012" in out


# ---- the approver: who decided what, on which version, and a log nobody can quietly rewrite ----
# verifies: 010/FR-001, FR-002, FR-003, FR-004, FR-005
def test_the_approver_flow_policy_staleness_and_tamper_evidence(repo, capsys, monkeypatch):
    def token(name, role):
        code, out, _ = run(capsys, "member", "add", name, "--role", role, "--email", f"{name}@x.com")
        return next(w for w in out.split() if w.startswith("sr_"))
    viewer, ana = token("vera", "viewer"), token("ana", "approver")

    monkeypatch.setenv("SPECREVIEW_TOKEN", viewer)
    code, _, err = run(capsys, "approvals", "record", FEATURE, "--decision", "approved", "--reason", "ok")
    assert code == 2 and "approver" in err                              # a viewer cannot decide

    monkeypatch.setenv("SPECREVIEW_TOKEN", ana)
    code, _, err = run(capsys, "approvals", "record", FEATURE, "--decision", "approved")
    assert code == 2 and "bloqueantes" in err                           # the feature has blockers: no approval without an override
    code, out, _ = run(capsys, "approvals", "record", FEATURE, "--decision", "approved", "--override", "--reason", "lo decidió compliance")
    assert code == 0 and "a_000001" in out

    pasted = "pegado de un documento segunda línea"                 # found by the property tests: this used to brick the log
    assert run(capsys, "approvals", "record", FEATURE, "--decision", "rejected", "--reason", pasted)[0] == 0
    assert run(capsys, "approvals", "verify")[0] == 0

    edit(repo, "- **FR-010**:", "- **FR-099**: The system MUST NOT do x\n- **FR-010**:")                 # the spec changes after the decision
    status = json.loads(call(repo, "approval_status", feature=FEATURE))
    assert status["stale"] is True and status["changed_files"] == ["spec.md"]

    log = repo / ".specreview" / "approvals.jsonl"
    log.write_text(log.read_text(encoding="utf-8").replace("compliance", "marketing"), encoding="utf-8")
    code, out, _ = run(capsys, "approvals", "verify")
    assert code == 1 and "a_000001" in out
    code, _, err = run(capsys, "approvals", "record", FEATURE, "--decision", "approved", "--override", "--reason", "x")
    assert code == 2 and "roto" in err                                  # it refuses to build on a broken history


# ---- the coding agent: it reads the blockers and is stopped before it implements ----
# verifies: 007/FR-001, FR-004
def test_an_agent_is_told_the_blockers_and_the_gate_stops_the_implementation(repo, capsys, monkeypatch):
    body = json.loads(call(repo, "get_blockers", feature=FEATURE))
    assert body["can_implement"] is False and {b["rule"] for b in body["needs_product_decision"]} >= {"CON001"}

    monkeypatch.setattr("sys.stdin", __import__("io").StringIO(json.dumps({"prompt": "/speckit.implement"})))
    code, _, err = run(capsys, "gate", "--hook")
    assert code == 2 and "no implementes todavía" in err and "CON001" in err


# ---- the team that adopts it: old debt does not block, only what is new ----
# verifies: 006/FR-004
def test_a_team_adopts_it_in_ci_with_a_baseline_and_only_new_blockers_fail(repo, capsys):
    assert run(capsys, "baseline")[0] == 0
    assert run(capsys, ".", "--fail-on", "blocker")[0] == 0              # the debt we already had is recorded, not failing
    edit(repo, "- **FR-010**:", "- **FR-012**: When a customer is tier 3, the system MUST charge a fee of 1% of the amount, with a minimum of 2.00 USD\n- **FR-010**:")
    code, out, _ = run(capsys, ".", "--fail-on", "blocker", "--min-severity", "blocker")
    assert code == 1 and "FR-012" in out and "FR-004" not in out        # only the new contradiction is reported


# ---- the engineer who traces what verifies each requirement ----
# verifies: 040/FR-001, FR-008
def test_requirements_are_traced_to_tests_and_the_pull_request_says_when_one_has_none(repo, capsys):
    (repo / "tests").mkdir()
    (repo / "tests" / "test_limits.py").write_text("# verifies[property]: 006/FR-003\ndef test_a(): ...\n", encoding="utf-8")
    code, out, _ = run(capsys, "verification")
    assert code == 0 and "FR-003  propiedad" in out and "1/11 verificados" in out
    git(repo, "checkout", "-q", "-b", "raise-limit")
    edit(repo, "above 10,000 USD", "above 15,000 USD")
    _, out, _ = run(capsys, "diff", "main", "-f", "markdown")
    assert "Ningún test, propiedad ni prueba cita este requisito" in out       # FR-005 changed and nothing checks it
    (repo / "tests" / "test_limits.py").write_text("# verifies[property]: 006/FR-005\ndef test_a(): ...\n", encoding="utf-8")
    _, out, _ = run(capsys, "diff", "main", "-f", "markdown")
    assert "Verificado por: propiedad `tests/test_limits.py:1`" in out and "revisá que siga comprobando lo nuevo" in out
