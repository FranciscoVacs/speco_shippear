"""Phase 1: adoption features: config, baseline, waivers, SARIF, --diff, init."""
import json
import subprocess
from datetime import date

import pytest

from conftest import EXAMPLE
from specreview.cli import main
from specreview import suppress


def run(capsys, *argv):
    code = main([*map(str, argv)])
    cap = capsys.readouterr()
    return code, cap.out, cap.err


# ---------- baseline ----------
def test_baseline_silences_known_findings_and_keeps_new_ones(make_repo, capsys):
    # verifies 006/FR-004, SC-001
    repo = make_repo({"001-a": "blocker"})
    assert run(capsys, repo, "--color", "never")[0] == 1
    code, out, _ = run(capsys, "baseline", repo)
    assert code == 0 and "hallazgos registrados" in out
    code, out, _ = run(capsys, repo, "--color", "never")
    assert code == 0 and "suprimidos" in out and "en baseline" in out
    # a NEW contradiction is not covered by the baseline
    spec = repo / "specs" / "001-a" / "spec.md"
    spec.write_text(spec.read_text() + "- **FR-003**: System MUST expire sessions after 90 days\n")
    assert run(capsys, repo, "--color", "never")[0] == 1


def test_baseline_survives_line_shifts(make_repo, capsys):
    # verifies 006/FR-005
    repo = make_repo({"001-a": "blocker"})
    run(capsys, "baseline", repo)
    spec = repo / "specs" / "001-a" / "spec.md"
    spec.write_text("\n\n" + spec.read_text())                  # every finding moves down two lines
    assert run(capsys, repo, "--color", "never")[0] == 0


def test_no_baseline_flag_shows_everything(make_repo, capsys):
    repo = make_repo({"001-a": "blocker"})
    run(capsys, "baseline", repo)
    assert run(capsys, repo, "--no-baseline", "--color", "never")[0] == 1


# ---------- waivers ----------
def _first_fp(capsys, repo):
    _, out, _ = run(capsys, repo, "-f", "json", "--no-baseline")
    return json.loads(out)["findings"][0]["fingerprint"]


def test_waive_needs_a_reason_and_a_real_finding(make_repo, capsys):
    repo = make_repo({"001-a": "blocker"})
    fp = _first_fp(capsys, repo)
    with pytest.raises(SystemExit):                                  # argparse: --reason is required
        main(["waive", fp, "--path", str(repo)])
    capsys.readouterr()
    code, _, err = run(capsys, "waive", "deadbeef0000", "--reason", "x", "--path", repo)
    assert code == 2 and "ningún hallazgo" in err
    code, _, err = run(capsys, "waive", fp, "--reason", "   ", "--path", repo)
    assert code == 2 and "motivo" in err


def test_waive_records_author_and_silences(make_repo, capsys):
    repo = make_repo({"001-a": "blocker"})
    fp = _first_fp(capsys, repo)
    code, out, _ = run(capsys, "waive", fp, "--reason", "lo decidió producto", "--author", "ana", "--path", repo)
    assert code == 0
    w = json.loads((repo / ".specreview" / "waivers.json").read_text())["waivers"][0]
    assert (w["author"], w["reason"], w["fingerprint"]) == ("ana", "lo decidió producto", fp)
    assert run(capsys, repo, "--color", "never")[0] == 0


def test_expired_waiver_no_longer_applies(make_repo, capsys):
    # verifies 006/FR-007
    repo = make_repo({"001-a": "blocker"})
    fp = _first_fp(capsys, repo)
    suppress.add_waiver(repo, fp, "temporal", "ana", expires="2000-01-01")
    assert run(capsys, repo, "--color", "never")[0] == 1


# ---------- config ----------
def test_config_disables_rules_and_sets_fail_on(make_repo, capsys):
    repo = make_repo({"001-a": "blocker"})
    (repo / "specreview.toml").write_text('disable_rules = ["CON001"]\n')
    assert run(capsys, repo, "--color", "never")[0] == 0
    (repo / "specreview.toml").write_text('fail_on = "never"\n')
    assert run(capsys, repo, "--color", "never")[0] == 0
    assert run(capsys, repo, "--fail-on", "blocker", "--color", "never")[0] == 1         # flag beats config


def test_bad_config_is_a_clear_error(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    (repo / "specreview.toml").write_text("fail_on = [\n")
    code, _, err = run(capsys, repo)
    assert code == 2 and "TOML" in err
    (repo / "specreview.toml").write_text('fail_on = "loud"\n')
    code, _, err = run(capsys, repo)
    assert code == 2 and "fail_on" in err


def test_ignore_features(make_repo, capsys):
    repo = make_repo({"001-a": "blocker", "002-b": "good"})
    (repo / "specreview.toml").write_text('ignore_features = ["001-a"]\n')
    code, out, _ = run(capsys, repo, "--all", "--color", "never")
    assert code == 0 and "001-a" not in out


# ---------- SARIF ----------
def test_sarif_is_valid_and_points_at_repo_relative_files(make_repo, capsys):
    # verifies 006/FR-002
    repo = make_repo({"001-a": "blocker"})
    code, out, _ = run(capsys, repo, "-f", "sarif")
    d = json.loads(out)
    assert code == 1 and d["version"] == "2.1.0"
    res = d["runs"][0]["results"]
    assert res and res[0]["level"] == "error"
    loc = res[0]["locations"][0]["physicalLocation"]
    assert loc["artifactLocation"]["uri"] == "specs/001-a/spec.md" and loc["region"]["startLine"] > 0
    assert res[0]["partialFingerprints"]["specreview/v1"]
    assert {r["id"] for r in d["runs"][0]["tool"]["driver"]["rules"]} >= {res[0]["ruleId"]}


def test_sarif_all_mode(make_repo, capsys):
    repo = make_repo({"001-a": "blocker", "002-b": "good"})
    _, out, _ = run(capsys, repo, "--all", "-f", "sarif")
    assert len(json.loads(out)["runs"][0]["results"]) >= 1


# ---------- --diff ----------
def _git(repo, *a):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t", *a], check=True, capture_output=True)


def test_diff_reviews_only_changed_features(make_repo, capsys):
    # verifies 006/FR-001
    repo = make_repo({"001-a": "blocker", "002-b": "good"})
    _git(repo, "init", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    _git(repo, "checkout", "-b", "pr")
    p = repo / "specs" / "002-b" / "spec.md"
    p.write_text(p.read_text() + "\n")
    _git(repo, "commit", "-am", "touch b")
    code, out, _ = run(capsys, repo, "--diff", "main", "--color", "never")
    assert code == 0 and "002-b" in out and "001-a" not in out         # the broken, untouched feature is not this PR's problem


def test_diff_with_nothing_changed(make_repo, capsys):
    repo = make_repo({"001-a": "blocker"})
    _git(repo, "init", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    code, _, err = run(capsys, repo, "--diff", "main", "--color", "never")
    assert code == 0 and "Ninguna feature cambió" in err


def test_diff_bad_base_is_a_clear_error(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    _git(repo, "init", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    code, _, err = run(capsys, repo, "--diff", "nope")
    assert code == 2 and "nope" in err


# ---------- init ----------
def test_init_writes_config_and_workflow_and_does_not_clobber(make_repo, capsys):
    # verifies 006/FR-008
    repo = make_repo({"001-a": "good"})
    code, out, _ = run(capsys, "init", repo)
    assert code == 0 and (repo / "specreview.toml").is_file() and (repo / ".github/workflows/specreview.yml").is_file()
    (repo / "specreview.toml").write_text("# mine\n")
    code, out, _ = run(capsys, "init", repo)
    assert "existe" in out and (repo / "specreview.toml").read_text() == "# mine\n"


def test_init_outside_a_speckit_repo_fails(tmp_path, capsys):
    code, _, err = run(capsys, "init", tmp_path)
    assert code == 2 and "Spec Kit" in err


def test_existing_cli_still_works_on_the_example(capsys):
    code, out, _ = run(capsys, EXAMPLE, "--color", "never", "--no-baseline")
    assert code == 1 and "COV001" in out


# ---------- `specreview demo` and the "no features" hints (docs/28) ----------
def test_demo_reviews_the_bundled_example_and_exits_0(capsys, tmp_path):
    # verifies 023/FR-001, FR-002, SC-001
    dest = tmp_path / "d"
    code, out, _ = run(capsys, "demo", "--dir", dest)
    assert code == 0                                         # findings are the point of the demo, not a failure
    assert "BLOQUEANTE" in out and "CON001" in out and "COV001" in out
    assert (dest / "specs" / "006-wire-transfer-limits" / "spec.md").is_file()
    assert "WARN" not in out and "ADVERTENCIA" not in out   # blockers only by default
    code, out, _ = run(capsys, "demo", "--dir", tmp_path / "d2", "--all-findings")
    assert code == 0 and "ADVERTENCIA" in out


def test_demo_prints_on_a_non_utf8_console(tmp_path):
    import os, sys
    env = {**os.environ, "PYTHONIOENCODING": "cp1252"}   # Windows' default console encoding
    r = subprocess.run([sys.executable, "-m", "specreview.cli", "demo", "--dir", str(tmp_path / "d")],
                       capture_output=True, env=env)
    assert r.returncode == 0, r.stderr.decode("utf-8", "replace")
    assert "↳" in r.stdout.decode("utf-8")


def test_demo_refuses_a_non_empty_dir(capsys, tmp_path):
    # verifies 023/FR-003
    (tmp_path / "x.txt").write_text("hi")
    code, _, err = run(capsys, "demo", "--dir", tmp_path)
    assert code == 2 and "no está vacía" in err


def test_bundled_demo_matches_the_repo_example():
    """The wheel ships a copy of examples/wire-transfers/specs; keep them identical (cp -r examples/wire-transfers/specs src/specreview/demo_data/wire-transfers/)."""
    from conftest import ROOT
    a, b = ROOT / "examples" / "wire-transfers" / "specs", ROOT / "src" / "specreview" / "demo_data" / "wire-transfers" / "specs"
    files = lambda base: {p.relative_to(base): p.read_bytes() for p in base.rglob("*") if p.is_file()}  # noqa: E731
    assert files(a) == files(b)


def test_no_features_error_points_at_features_one_level_down(capsys, tmp_path):
    # verifies 023/FR-004
    feat = tmp_path / "proj" / "specs" / "001-a"
    feat.mkdir(parents=True)
    (feat / "spec.md").write_text("# Feature Specification: A\n")
    code, _, err = run(capsys, tmp_path, "--all")              # tmp_path itself has no specs/
    assert code == 2 and "Encontré features en" in err and "Probá: specreview" in err


def test_no_features_error_suggests_demo_when_nothing_is_nearby(capsys, tmp_path):
    # verifies 023/FR-005
    code, _, err = run(capsys, tmp_path, "--all")
    assert code == 2 and "specreview demo" in err
    code, _, err = run(capsys, tmp_path / "nope", "--all")
    assert code == 2 and "La ruta no existe" in err
    code, _, err = run(capsys, tmp_path)                      # single-feature mode gets the same hint
    assert code == 2 and "specreview demo" in err


# ---------- init --agents / gate --install-hook (T-007) ----------
def test_init_agents_writes_each_agent_file_and_keeps_existing_text(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    (repo / "AGENTS.md").write_text("# Mis reglas\n\n- usar tabs\n")
    code, out, _ = run(capsys, "init", repo, "--agents")
    assert code == 0
    agents = (repo / "AGENTS.md").read_text()
    assert agents.startswith("# Mis reglas\n\n- usar tabs\n") and "get_blockers" in agents
    cursor = (repo / ".cursor" / "rules" / "specreview.mdc").read_text()
    assert cursor.startswith("---\n") and "alwaysApply: true" in cursor and "get_blockers" in cursor
    assert "get_blockers" in (repo / ".github" / "copilot-instructions.md").read_text()


def test_init_agents_is_idempotent_and_updates_only_its_block(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    run(capsys, "init", repo, "--agents", "agents-md")
    first = (repo / "AGENTS.md").read_text()
    code, out, _ = run(capsys, "init", repo, "--agents", "agents-md", "--force")
    assert (repo / "AGENTS.md").read_text() == first and "igual" in out
    (repo / "AGENTS.md").write_text(first.replace("get_blockers", "VIEJO") + "\n## Otro\ntexto\n")
    run(capsys, "init", repo, "--agents", "agents-md")
    text = (repo / "AGENTS.md").read_text()
    assert "VIEJO" not in text and "get_blockers" in text and text.count("specreview:begin") == 1 and text.rstrip().endswith("texto")


def test_init_agents_rejects_unknown_target(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    code, _, err = run(capsys, "init", repo, "--agents", "vim")
    assert code == 2 and "vim" in err


def test_gate_install_hook_appends_and_is_idempotent(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    _git(repo, "init", "-b", "main")
    hook = repo / ".git" / "hooks" / "pre-push"
    hook.parent.mkdir(exist_ok=True)
    hook.write_text("#!/bin/sh\necho previo\n")
    assert run(capsys, "gate", repo, "--install-hook", "pre-push")[0] == 0
    body = hook.read_text()
    assert body.startswith("#!/bin/sh\necho previo") and "specreview gate" in body and hook.stat().st_mode & 0o111
    assert "ya estaba" in run(capsys, "gate", repo, "--install-hook", "pre-push")[1]
    assert hook.read_text() == body


def test_gate_install_hook_blocks_a_push_with_blockers(make_repo, tmp_path):
    import shutil
    if not shutil.which("specreview"):
        pytest.skip("specreview no está en el PATH")
    repo = make_repo({"001-a": "blocker"})
    _git(repo, "init", "-b", "main")
    main(["gate", str(repo), "--install-hook", "pre-commit"])
    r = subprocess.run(["sh", str(repo / ".git" / "hooks" / "pre-commit")], cwd=repo, capture_output=True, text=True)
    assert r.returncode == 2 and "bloqueante" in r.stderr


def test_gate_install_hook_outside_git_fails(make_repo, capsys):
    repo = make_repo({"001-a": "good"})
    code, _, err = run(capsys, "gate", repo, "--install-hook", "pre-commit")
    assert code == 2 and ".git" in err
