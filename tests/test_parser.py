import json

import pytest

from specreview.parser import load_feature
from specreview.parser.loader import FeatureNotFound
from specreview.parser.tasks import parse_tasks

from conftest import SPECKIT_TEMPLATES


# ---------- spec.md ----------
def test_example_spec_counts(example):
    # verifies 001/FR-001
    f = load_feature(example)
    s = f.spec
    assert [r.id for r in s.requirements] == [f"FR-{i:03d}" for i in range(1, 11)]
    assert [r.id for r in s.success_criteria] == ["SC-001", "SC-002"]
    assert [(st.id, st.priority, len(st.scenarios)) for st in s.stories] == [
        ("US1", "P1", 2), ("US2", "P1", 2), ("US3", "P2", 0)]
    assert s.title == "Team Invitations"
    assert len(s.edge_cases) == 2 and set(s.entities) == {"Invitation", "Workspace"}


def test_requirement_text_and_location(example):
    r = load_feature(example).spec.requirements[0]
    assert r.text.startswith("System MUST allow workspace admins")
    assert r.loc.file == "spec.md" and r.loc.line > 0


def test_needs_clarification_extracted(example):
    fr10 = load_feature(example).spec.requirements[9]
    assert fr10.clarifications == ["what is the limit?"]


def test_given_when_then_split(example):
    sc = load_feature(example).spec.stories[0].scenarios[0]
    assert sc.given.startswith("an admin on the members page")
    assert sc.when.startswith("they submit a valid email")
    assert sc.then.startswith("an invitation is created")


def test_clarification_session_parsed(example):
    c = load_feature(example).spec.clarifications
    assert len(c) == 1 and c[0].session == "2026-09-02" and c[0].answer == "No, only admins."


def test_multiline_requirement_and_alt_bold_style(make_feature):
    d = make_feature(spec="""# Feature Specification: X
## Requirements
### Functional Requirements
- **FR-001**: System MUST do a thing
  that continues on the next line
- **FR-002:** System MUST do another
""")
    reqs = load_feature(d).spec.requirements
    assert reqs[0].text == "System MUST do a thing that continues on the next line"
    assert reqs[1].id == "FR-002" and reqs[1].text == "System MUST do another"


def test_html_comments_are_ignored_and_line_numbers_preserved(make_feature):
    d = make_feature(spec="""# Feature Specification: X
<!--
- **FR-099**: System MUST be a ghost
-->
## Requirements
### Functional Requirements
- **FR-001**: System MUST be real
""")
    reqs = load_feature(d).spec.requirements
    assert [r.id for r in reqs] == ["FR-001"]
    assert reqs[0].loc.line == 7


def test_story_without_priority(make_feature):
    d = make_feature(spec="# F\n### User Story 1 - Do it\nText\n**Acceptance Scenarios**:\n1. **Given** a, **When** b, **Then** c\n")
    st = load_feature(d).spec.stories[0]
    assert st.priority is None and st.title == "Do it" and len(st.scenarios) == 1


# ---------- plan.md ----------
def test_plan_items_and_refs(example):
    # verifies 001/FR-001
    plan = load_feature(example).plan
    texts = [i.text for i in plan.items]
    assert any("Slack" in t for t in texts)
    first = plan.items[0]
    assert first.refs == ["FR-001", "FR-002", "FR-003"]
    assert plan.context["Language/Version"] == "Python 3.12"


def test_plan_skips_constitution_and_template_boilerplate(example):
    plan = load_feature(example).plan
    assert not any("PASS" in i.text for i in plan.items)


def test_data_model_entities_become_plan_items(example):
    items = load_feature(example).plan.items
    ent = [i for i in items if i.kind == "entity"]
    assert len(ent) == 1 and ent[0].text.startswith("Invitation:")


# ---------- tasks.md ----------
def test_task_fields(example):
    # verifies 001/FR-001
    tasks = {t.id: t for t in load_feature(example).tasks}
    assert len(tasks) == 14
    t5 = tasks["T005"]
    assert t5.parallel and t5.story == "US1" and t5.phase_kind == "story"
    assert "tests/contract/test_invitations.py" in t5.paths
    assert tasks["T001"].story is None and tasks["T001"].phase_kind == "setup"
    assert tasks["T003"].phase_kind == "foundational" and tasks["T014"].phase_kind == "polish"


def test_task_story_from_phase_when_label_missing(tmp_path):
    p = tmp_path / "tasks.md"
    p.write_text("## Phase 3: User Story 2 - X (Priority: P1)\n- [ ] T001 Do it in src/a.py\n")
    t = parse_tasks(p)[0]
    assert t.story == "US2"


def test_completed_and_explicit_refs(tmp_path):
    p = tmp_path / "tasks.md"
    p.write_text("## Phase 1: Setup\n- [x] T001 [US1] [P] Cover FR-001 and FR-002 in src/x.py\n")
    t = parse_tasks(p)[0]
    assert t.done and t.parallel and t.story == "US1" and t.refs == ["FR-001", "FR-002"]


def test_malformed_task_lines_produce_warnings(tmp_path):
    p = tmp_path / "tasks.md"
    p.write_text("## Phase 1: Setup\n- [ ] Create model without id\n- [ ] T002 ok\n")
    w: list[str] = []
    tasks = parse_tasks(p, warnings=w)
    assert [t.id for t in tasks] == ["T002"] and "sin ID" in w[0]


def test_tasks_inside_code_fence_ignored(tmp_path):
    p = tmp_path / "tasks.md"
    p.write_text("## Phase 1\n```bash\n- [ ] T999 not a task\n```\n- [ ] T001 real\n")
    assert [t.id for t in parse_tasks(p)] == ["T001"]


# ---------- discovery ----------
def test_discovery_from_repo_root_uses_feature_json(example):
    # verifies 001/FR-001
    assert load_feature(example).name == "003-team-invitations"


def test_discovery_picks_highest_numbered_without_feature_json(tmp_path):
    for n in ("001-a", "002-b"):
        d = tmp_path / "specs" / n
        d.mkdir(parents=True)
        (d / "spec.md").write_text("# F\n")
    assert load_feature(tmp_path).name == "002-b"


def test_missing_plan_and_tasks_are_warnings_not_errors(make_feature):
    f = load_feature(make_feature(spec="# F\n"))
    assert f.plan is None and not f.has_tasks_file and len(f.warnings) == 2


def test_not_a_speckit_dir(tmp_path):
    with pytest.raises(FeatureNotFound):
        load_feature(tmp_path)


# ---------- real Spec Kit templates (skipped if the reference clone is absent) ----------
@pytest.mark.skipif(not SPECKIT_TEMPLATES.exists(), reason="spec-kit clone not available")
def test_unfilled_official_templates_parse_without_crashing(tmp_path):
    d = tmp_path / "specs" / "001-x"
    d.mkdir(parents=True)
    for src, dst in (("spec-template.md", "spec.md"), ("plan-template.md", "plan.md"), ("tasks-template.md", "tasks.md")):
        (d / dst).write_text((SPECKIT_TEMPLATES / src).read_text(encoding="utf-8"), encoding="utf-8")
    f = load_feature(d)
    assert len(f.spec.stories) == 3 and len(f.spec.requirements) == 7
    assert [r.id for r in f.spec.success_criteria] == ["SC-001", "SC-002", "SC-003", "SC-004"]
    assert len(f.tasks) >= 25 and f.tasks[0].id == "T001"
