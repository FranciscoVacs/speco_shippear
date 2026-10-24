"""docs/specs/002-review-all-features: the --all option."""
import json
import time

import pytest

from conftest import EXAMPLE, ROOT
from specreview.cli import main
from specreview.parser.loader import discover_features


def run(capsys, *argv):
    code = main([*map(str, argv)])
    cap = capsys.readouterr()
    return code, cap.out, cap.err


# ---------- US1 ----------
def test_three_features_are_reviewed_in_name_order_with_a_table(make_repo, capsys):
    # verifies 002/FR-001, FR-003
    repo = make_repo({"003-c": "good", "001-a": "good", "002-b": "good"})
    code, out, _ = run(capsys, repo, "--all", "--color", "never")
    assert code == 0
    heads = [l.strip("= ") for l in out.splitlines() if l.startswith("====")]
    assert heads == ["001-a", "002-b", "003-c"]                                    # FR-001
    table = out.split("Resumen por feature")[1].splitlines()
    assert [l.split()[0] for l in table[2:5]] == ["001-a", "002-b", "003-c"]       # FR-003: one row per feature
    assert table[5].split()[0] == "total"


def test_no_features_exits_2_naming_the_directory(tmp_path, capsys):
    # verifies 002/FR-002
    code, _, err = run(capsys, tmp_path, "--all")
    assert code == 2 and str(tmp_path / "specs") in err                           # FR-002


def test_a_feature_folder_with_all_reviews_that_single_feature(make_repo, capsys):
    # verifies 002/FR-004
    repo = make_repo({"001-a": "good", "002-b": "good"})
    code, out, _ = run(capsys, repo / "specs" / "002-b", "--all", "--color", "never")
    assert code == 0 and "002-b" in out and "001-a" not in out                    # FR-004


def test_discovery_accepts_root_specs_dir_or_feature_dir(make_repo):
    repo = make_repo({"001-a": "good", "002-b": "good"})
    assert list(discover_features(repo)) == list(discover_features(repo / "specs")) == ["001-a", "002-b"]
    assert list(discover_features(repo / "specs" / "001-a")) == ["001-a"]


# ---------- US2 ----------
def test_exit_code_is_1_when_any_feature_has_a_blocker(make_repo, capsys):
    # verifies 002/FR-006, SC-002
    repo = make_repo({"001-a": "good", "002-b": "blocker", "003-c": "good"})
    assert run(capsys, repo, "--all")[0] == 1                                     # FR-006
    assert run(capsys, repo, "--all", "--fail-on", "never")[0] == 0


def test_unparseable_feature_is_reported_failed_others_continue_exit_2(make_repo, capsys):
    # verifies 002/FR-007
    repo = make_repo({"001-a": "good", "002-bad": b"\xff\xfe\x00bad", "003-c": "good"})
    code, out, _ = run(capsys, repo, "--all", "--color", "never")
    assert code == 2                                                              # FR-007
    assert "FALLÓ" in out and "002-bad" in out and "003-c" in out                 # the rest still reviewed


def test_an_error_outranks_a_blocker_in_the_exit_code(make_repo, capsys):
    # verifies 002/SC-002
    repo = make_repo({"001-a": "blocker", "002-bad": b"\xff\xfe\x00"})
    assert run(capsys, repo, "--all")[0] == 2


def test_min_severity_hides_listings_but_not_table_counts(make_repo, capsys):
    # verifies 002/FR-009
    repo = make_repo({"001-a": "blocker"})
    code, out, _ = run(capsys, repo, "--all", "--min-severity", "blocker", "--color", "never")
    listing, table = out.split("Resumen por feature")
    assert "SUGERENCIA" not in listing and "BLOQUEANTE" in listing                # FR-009 listing filtered
    row = table.splitlines()[2].split()
    assert row[0] == "001-a" and int(row[1]) >= 1                                 # counts untouched
    full = json.loads(run(capsys, repo, "--all", "-f", "json", "--min-severity", "warning")[1])
    shown = len(full["features"][0]["findings"])
    allf = json.loads(run(capsys, repo, "--all", "-f", "json")[1])
    assert shown <= len(allf["features"][0]["findings"])
    s = full["summary"][0]
    assert s["blocker"] + s["warning"] + s["suggestion"] == len(allf["features"][0]["findings"])   # table = ALL findings


# ---------- US3 ----------
def test_json_is_one_document_with_schema_version_and_reports(make_repo, capsys):
    # verifies 002/FR-005
    repo = make_repo({"001-a": "good", "002-b": "blocker"})
    code, out, _ = run(capsys, repo, "--all", "-f", "json", "--fail-on", "never")
    d = json.loads(out)                                                           # FR-005: parses as ONE document
    assert d["schema_version"] == 1 and [r["feature"] for r in d["features"]] == ["001-a", "002-b"]
    assert [s["feature"] for s in d["summary"]] == ["001-a", "002-b"] and d["summary"][1]["blocker"] >= 1


def test_json_marks_failed_features(make_repo, capsys):
    repo = make_repo({"001-a": "good", "002-bad": b"\xff\xfe\x00"})
    d = json.loads(run(capsys, repo, "--all", "-f", "json")[1])
    assert [r["feature"] for r in d["features"]] == ["001-a"]
    bad = next(s for s in d["summary"] if s["feature"] == "002-bad")
    assert bad["failed"] and bad["blocker"] is None


def test_markdown_has_a_table_per_feature(make_repo, capsys):
    out = run(capsys, make_repo({"001-a": "good", "002-b": "blocker"}), "--all", "-f", "markdown", "--fail-on", "never")[1]
    assert "| `001-a` |" in out and "## Spec review · `002-b`" in out


def test_html_with_all_is_refused_with_an_explanation(make_repo, capsys):
    # verifies 002/FR-008
    code, _, err = run(capsys, make_repo({"001-a": "good"}), "--all", "-f", "html")
    assert code == 2 and "una feature a la vez" in err                            # FR-008


def test_without_all_the_output_is_unchanged(capsys):
    """FR-010: the pre-existing single-feature output is pinned by the golden file."""
    # verifies 002/FR-010
    code, out, _ = run(capsys, EXAMPLE, "--color", "never")
    assert out == (ROOT / "tests" / "golden" / "invitations.txt").read_text()


# ---------- SC-001 / dogfooding gate (constitution VI) ----------
def test_own_specs_have_no_blockers_and_review_fast(capsys):
    # verifies 002/SC-001
    t = time.time()
    code, out, _ = run(capsys, ROOT, "--all", "-f", "json")
    elapsed = time.time() - t
    d = json.loads(out)
    assert len(d["features"]) >= 2, "el repo debe tener sus propias specs"
    assert code == 0 and all(s["blocker"] == 0 for s in d["summary"]), "las specs propias no pueden tener bloqueantes"
    assert elapsed < 5                                                            # SC-001
