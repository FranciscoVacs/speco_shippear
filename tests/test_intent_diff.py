"""What a PR changes in the business: requirements before/after, the values that moved, what they touch, new blockers."""
import shutil

from conftest import ROOT
from specreview.intent_diff import diff_trees, render_comment, MARKER

WIRES = ROOT / "examples" / "wire-transfers"
SPEC = "specs/006-wire-transfer-limits/spec.md"


def _copy(tmp_path, name):
    dest = tmp_path / name
    shutil.copytree(WIRES, dest)
    return dest


def _edit(root, old, new):
    p = root / SPEC
    text = p.read_text(encoding="utf-8")
    assert old in text
    p.write_text(text.replace(old, new), encoding="utf-8")


def test_a_moved_threshold_shows_both_values_and_the_task_it_touches(tmp_path):
    # verifies 026/FR-001, FR-002
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    _edit(head, "When a wire is above 10,000 USD", "When a wire is above 15,000 USD")
    [fd] = diff_trees(base, head)
    [ch] = fd.changes
    assert (ch.id, ch.kind) == ("FR-005", "changed")
    assert ch.values == [("10,000 USD", "15,000 USD")]
    assert "T004" in [a.id for a in ch.affects]


def test_added_and_removed_requirements_are_reported(tmp_path):
    # verifies 026/FR-001
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    _edit(head, "- **FR-010**: System MUST round fees to the nearest cent\n",
          "- **FR-012**: When a customer is tier 3, the system MUST waive the wire fee\n")
    [fd] = diff_trees(base, head)
    kinds = {(c.id, c.kind) for c in fd.changes}
    assert kinds == {("FR-010", "removed"), ("FR-012", "added")}
    removed = next(c for c in fd.changes if c.kind == "removed")
    assert "T003" in [a.id for a in removed.affects]          # the task still implements a requirement that is gone


def test_a_new_contradiction_is_a_new_blocker_and_old_ones_are_not_repeated(tmp_path):
    # verifies 026/FR-005
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    _edit(head, "- **FR-010**: System MUST round fees to the nearest cent\n",
          "- **FR-010**: System MUST round fees to the nearest cent\n"
          "- **FR-012**: When a verified customer confirms a wire, the system MUST charge a fee of 1% of the amount, with a minimum of 2.00 USD\n")
    [fd] = diff_trees(base, head)
    rules = [(f.rule, tuple(sorted(f.ids))) for f in fd.new_blockers]
    assert ("CON001", ("FR-001", "FR-012")) in rules
    assert all("FR-004" not in ids for _, ids in rules)       # FR-003 vs FR-004 was already there before the PR


def test_untouched_features_are_left_out_and_an_empty_diff_says_so(tmp_path):
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    assert diff_trees(base, head) == []
    body = render_comment([])
    assert body.startswith(MARKER) and "no cambia ninguna spec" in body


def test_the_comment_speaks_business_first(tmp_path):
    # verifies 026/FR-002, FR-004
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    _edit(head, "When a wire is above 10,000 USD", "When a wire is above 15,000 USD")
    body = render_comment(diff_trees(base, head))
    assert body.startswith(MARKER)
    assert "10,000 USD → 15,000 USD" in body
    assert "T004" in body and "006-wire-transfer-limits" in body
    assert "`T004` todavía dice «10,000 USD»" in body          # the task would build the old threshold


def test_a_feature_added_by_the_pr_lists_every_requirement_as_new(tmp_path):
    # verifies 026/FR-001
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    shutil.rmtree(base / "specs" / "006-wire-transfer-limits")
    (base / "specs" / "keep").mkdir()
    [fd] = diff_trees(base, head)
    assert fd.is_new and {c.kind for c in fd.changes} == {"added"} and len(fd.changes) == 13


# ---------- `specreview diff`: the same review from a terminal, against a git base ----------
import subprocess  # noqa: E402

from specreview.cli import main  # noqa: E402


def _git(repo, *a):
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t", *a], check=True, capture_output=True)


def _repo(tmp_path):
    repo = _copy(tmp_path, "repo")
    _git(repo, "init", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "base")
    _git(repo, "checkout", "-b", "pr")
    return repo


def test_cli_diff_reviews_uncommitted_edits_against_the_base(tmp_path, capsys):
    # verifies 026/FR-012
    repo = _repo(tmp_path)
    _edit(repo, "When a wire is above 10,000 USD", "When a wire is above 15,000 USD")
    code = main(["diff", "main", "--path", str(repo)])
    out = capsys.readouterr().out
    assert code == 0 and "10,000 USD → 15,000 USD" in out and MARKER not in out


def test_cli_diff_exits_1_when_the_change_brings_a_blocker_and_prints_json(tmp_path, capsys):
    # verifies 026/FR-013
    repo = _repo(tmp_path)
    _edit(repo, "- **FR-010**: System MUST round fees to the nearest cent\n",
          "- **FR-010**: System MUST round fees to the nearest cent\n"
          "- **FR-012**: When a verified customer confirms a wire, the system MUST charge a fee of 1% of the amount, with a minimum of 2.00 USD\n")
    _git(repo, "commit", "-am", "fee")
    code = main(["diff", "main", "--path", str(repo), "-f", "json"])
    import json
    data = json.loads(capsys.readouterr().out)
    assert code == 1 and data[0]["new_blockers"][0]["rule"] == "CON001"


def test_cli_diff_markdown_is_the_pr_comment_and_a_bad_base_is_a_clear_error(tmp_path, capsys):
    repo = _repo(tmp_path)
    assert main(["diff", "main", "--path", str(repo), "-f", "markdown"]) == 0
    assert capsys.readouterr().out.startswith(MARKER)
    assert main(["diff", "nope", "--path", str(repo)]) == 2
    assert "nope" in capsys.readouterr().err


# ---------- the questions of the person who decides: what it is for, how it is measured, what stays open ----------
from specreview.intent_diff import FeatureDiff  # noqa: E402


def test_a_new_feature_says_what_it_solves_how_it_is_measured_and_what_stays_open(tmp_path):
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    shutil.rmtree(base / "specs" / "006-wire-transfer-limits")
    (base / "specs" / "keep").mkdir()
    [fd] = diff_trees(base, head)
    assert fd.stories and fd.questions and fd.assumptions and fd.status_after == "Draft"
    body = render_comment([fd])
    assert "**Qué resuelve**" in body and fd.stories[0][2] in body
    assert "**Cómo se va a medir**" in body and "`SC-001`" in body
    assert "❓ What happens when the exchange rate changes between confirmation and settlement?" in body
    assert "Supuesto: Customers are classified into tiers by the KYC service" in body
    frs = sum(1 for c in fd.changes if c.id.startswith("FR-"))
    assert f"**Cobertura:** {frs} requisitos funcionales" in body and "requisitos nuevos" not in body
    assert "la spec dice: Draft" in body


def test_a_status_change_alone_is_reported(tmp_path):
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    _edit(head, "**Status**: Draft", "**Status**: Partially implemented (story 2 is not built)")
    [fd] = diff_trees(base, head)
    assert fd.changes == [] and (fd.status_before, fd.status_after) == ("Draft", "Partially implemented (story 2 is not built)")
    assert "**Estado:** «Draft» → «Partially implemented (story 2 is not built)»" in render_comment([fd])


def test_an_added_open_question_is_reported_and_old_ones_are_not_repeated(tmp_path):
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    _edit(head, "- How is the daily limit counted", "- Who approves a wire above the monthly limit?\n- How is the daily limit counted")
    [fd] = diff_trees(base, head)
    assert fd.questions == ["Who approves a wire above the monthly limit?"]
    body = render_comment([fd])
    assert "❓ Who approves a wire above the monthly limit?" in body and "exchange rate" not in body


def test_a_spec_declared_implemented_is_not_called_ready_to_build():
    fd = FeatureDiff("027-x", "X", True, [], [], 0, None, "ready", status_after="Implemented")
    body = render_comment([fd])
    assert "sin hallazgos" in body and "lista para construir" not in body


def _product(root, goals, decisions):
    (root / "product").mkdir(parents=True, exist_ok=True)
    (root / "product" / "goals.md").write_text("# Goals\n\n" + "".join(f"- **{i}**: {t}\n" for i, t in goals), encoding="utf-8")
    (root / "product" / "decisions.md").write_text(
        "# Decisions\n\n" + "".join(f"## {i}: {t}\n**Status**: {st}\n\n" for i, t, st in decisions), encoding="utf-8")


def test_the_goals_and_decisions_a_pr_adds_or_moves_are_reported():
    import tempfile
    from pathlib import Path
    from specreview.intent_diff import diff_product
    with tempfile.TemporaryDirectory() as t:
        base, head = Path(t) / "base", Path(t) / "head"
        _product(base, [("G-1", "Review before code")], [("D-1", "Offline", "accepted"), ("D-2", "Agents never approve", "proposed")])
        _product(head, [("G-1", "Review before code"), ("G-2", "Know what the software does today")],
                 [("D-1", "Offline", "accepted"), ("D-2", "Agents never approve", "accepted")])
        changes = diff_product(base, head)
        assert [(c.id, c.kind) for c in changes] == [("G-2", "added"), ("D-2", "status")]
        body = render_comment([], product=changes)
        assert "no cambia ninguna spec" not in body
        assert "Objetivo nuevo **G-2**: Know what the software does today" in body
        assert "Decisión **D-2**: _proposed → accepted_" in body


def test_a_spec_that_starts_citing_a_goal_says_which_one(tmp_path):
    base, head = _copy(tmp_path, "base"), _copy(tmp_path, "head")
    for root in (base, head):
        _product(root, [("G-1", "Move money safely")], [("D-3", "Limits are per customer", "accepted")])
    _edit(head, "**Status**: Draft", "**Status**: Draft\n\n**Goals**: G-1\n\n**Decisions**: D-3")
    [fd] = diff_trees(base, head)
    assert fd.serves == [("G-1", "Move money safely"), ("D-3", "Limits are per customer")]
    body = render_comment([fd])
    assert "**G-1** Move money safely" in body and "Decisiones que cita: D-3" in body
