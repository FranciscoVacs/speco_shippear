"""The trace from a requirement to the tests that check it (docs/37): tags, levels, broken references, and the PR comment."""
import shutil

from conftest import ROOT
from specreview.cli import main
from specreview.intent_diff import diff_trees, render_comment
from specreview.verification import annotate, render, summary, trace

WIRES = ROOT / "examples" / "wire-transfers"
SPEC = "specs/006-wire-transfer-limits/spec.md"


def repo(tmp_path, tests: dict[str, str] | None = None, name="repo"):
    dest = tmp_path / name
    shutil.copytree(WIRES, dest)
    for rel, body in (tests or {}).items():
        (dest / rel).parent.mkdir(parents=True, exist_ok=True)
        (dest / rel).write_text(body, encoding="utf-8")
    return dest


def req(t, rid):
    return next(r for f in t.features for r in f.reqs if r.id == rid)


# verifies: 040/FR-006
def test_a_repository_without_tags_says_how_to_start_and_is_not_an_error(tmp_path, capsys):
    root = repo(tmp_path)
    t = trace(root)
    assert t.tags == 0 and not t.broken
    assert "verifies[property]" in render(t)
    assert main(["verification", str(root)]) == 0


# verifies: 040/FR-001, FR-002
def test_a_tag_ties_a_test_to_a_requirement_with_its_level(tmp_path):
    root = repo(tmp_path, {"tests/test_wires.py": "# verifies: 006/FR-001\ndef test_a(): ...\n\n# verifies[property]: 006/FR-001, FR-003\ndef test_b(): ...\n"})
    t = trace(root)
    assert [(e.level, e.line) for e in req(t, "FR-001").evidence] == [("test", 1), ("property", 4)]
    assert req(t, "FR-001").level == "property"            # the strongest check that cites it
    assert req(t, "FR-003").level == "property" and req(t, "FR-002").level is None
    assert summary(t)["property"] == 2 and summary(t)["tags"] == 2


# verifies: 040/FR-001
def test_the_feature_is_found_by_number_or_by_full_name_and_other_languages_work(tmp_path):
    root = repo(tmp_path, {"tests/a.test.ts": "// verifies[formal]: 006-wire-transfer-limits/FR-002\n",
                           "tests/q.sql": "-- verifies: 006/FR-004\n"})
    t = trace(root)
    assert req(t, "FR-002").level == "formal" and req(t, "FR-004").level == "test" and not t.broken


def test_tags_outside_test_files_are_ignored(tmp_path):
    root = repo(tmp_path, {"src/app.py": "# verifies: 006/FR-001\n", "docs/notes.md": "verifies: 006/FR-001"})
    assert trace(root).tags == 0


# verifies: 040/FR-003
def test_a_tag_that_points_nowhere_is_reported_as_broken_and_fails_the_command(tmp_path, capsys):
    root = repo(tmp_path, {"tests/test_x.py": "# verifies: 999/FR-001\n# verifies: 006/FR-099\n# verifies[magic]: 006/FR-001\n"})
    t = trace(root)
    assert [b.line for b in t.broken] == [1, 2, 3]
    assert "999" in t.broken[0].why and "FR-099" in t.broken[1].why and "magic" in t.broken[2].why
    assert main(["verification", str(root)]) == 1
    assert "Referencias rotas" in capsys.readouterr().out


# verifies: 040/FR-007
def test_requirements_worded_as_invariants_without_a_property_are_pointed_out(tmp_path):
    root = repo(tmp_path, {"tests/test_x.py": "# verifies: 006/FR-001\n"})
    p = root / SPEC
    p.write_text(p.read_text(encoding="utf-8").replace("- **FR-010**:", "- **FR-012**: The system MUST NOT process the same wire twice\n- **FR-010**:"), encoding="utf-8")
    t = trace(root)
    assert [r.id for f in t.features for r in f.reqs if r.invariant] == ["FR-012"]
    assert "FR-012  sin verificación · candidato a propiedad" in render(t)
    assert summary(t)["invariants_without_property"] == 1


# verifies: 040/FR-010
def test_json_output_carries_the_summary(tmp_path, capsys):
    import json
    root = repo(tmp_path, {"tests/test_x.py": "# verifies[property]: 006/FR-001\n"})
    assert main(["verification", str(root), "-f", "json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["summary"]["property"] == 1 and out["broken"] == []


def _changed(tmp_path, tests):
    base, head = repo(tmp_path, name="base"), repo(tmp_path, tests, name="head")
    p = head / SPEC
    p.write_text(p.read_text(encoding="utf-8").replace("above 10,000 USD", "above 15,000 USD"), encoding="utf-8")
    diffs = diff_trees(base, head)
    annotate(diffs, head)
    return diffs


# verifies: 040/FR-008
def test_the_pr_comment_says_what_checks_a_changed_requirement(tmp_path):
    diffs = _changed(tmp_path, {"tests/test_x.py": "# verifies[property]: 006/FR-005\n"})
    [ch] = diffs[0].changes
    assert ch.id == "FR-005" and len(ch.checked_by) == 1
    body = render_comment(diffs)
    assert "Verificado por: propiedad `tests/test_x.py:1`" in body and "revisá que siga comprobando lo nuevo" in body


# verifies: 040/FR-008
def test_the_pr_comment_warns_when_nothing_checks_a_changed_requirement(tmp_path):
    diffs = _changed(tmp_path, {"tests/test_x.py": "# verifies: 006/FR-001\n"})       # the repo traces, but not FR-005
    assert diffs[0].changes[0].checked_by == []
    assert "Ningún test, propiedad ni prueba cita este requisito" in render_comment(diffs)


# verifies: 040/FR-009
def test_a_repository_that_does_not_trace_gets_no_noise_in_the_pr_comment(tmp_path):
    diffs = _changed(tmp_path, {})
    assert diffs[0].changes[0].checked_by is None
    body = render_comment(diffs)
    assert "Verificado" not in body and "Ningún test" not in body


# verifies: 040/FR-004
def test_a_tag_quoted_inside_a_string_or_after_code_is_not_a_tag(tmp_path):
    root = repo(tmp_path, {"tests/test_x.py": 'T = "# verifies: 006/FR-001"\nx = 1  # verifies: 006/FR-002\n    # verifies: 006/FR-003\n'})
    t = trace(root)
    assert t.tags == 1 and req(t, "FR-003").level == "test" and req(t, "FR-001").level is None and req(t, "FR-002").level is None


# verifies: 040/FR-005
def test_no_output_ever_says_a_requirement_is_proved(tmp_path):
    root = repo(tmp_path, {"tests/test_x.py": "# verifies[formal]: 006/FR-001\n# verifies[property]: 006/FR-002\n# verifies: 006/FR-005\n"})
    texts = [render(trace(root)), render(trace(root), markdown=True)]
    base, head = repo(tmp_path, name="b2"), repo(tmp_path, {"tests/test_x.py": "# verifies[formal]: 006/FR-005\n"}, name="h2")
    p = head / SPEC
    p.write_text(p.read_text(encoding="utf-8").replace("above 10,000 USD", "above 15,000 USD"), encoding="utf-8")
    diffs = diff_trees(base, head)
    annotate(diffs, head)
    texts.append(render_comment(diffs))
    for t in texts:
        assert not any(w in t.lower() for w in ("probado", "demostrado", "garantiza", "proved", "guarantee"))
    assert "prueba formal" in texts[0] and "propiedad" in texts[0]          # it names the level instead
