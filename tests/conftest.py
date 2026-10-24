from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "invitations"
SPECKIT_TEMPLATES = Path("/home/user/ref/spec-kit/templates")


@pytest.fixture
def example():
    return EXAMPLE


@pytest.fixture
def make_feature(tmp_path):
    """Write spec/plan/tasks text into a tmp feature dir and return its path."""
    def _make(spec="", plan=None, tasks=None, data_model=None):
        d = tmp_path / "specs" / "001-demo"
        d.mkdir(parents=True)
        (d / "spec.md").write_text(spec, encoding="utf-8")
        if plan is not None:
            (d / "plan.md").write_text(plan, encoding="utf-8")
        if tasks is not None:
            (d / "tasks.md").write_text(tasks, encoding="utf-8")
        if data_model is not None:
            (d / "data-model.md").write_text(data_model, encoding="utf-8")
        return d
    return _make


GOOD_SPEC = ("# Feature Specification: {n}\n## Requirements\n### Functional Requirements\n"
             "- **FR-001**: When a user logs in, the system MUST record the login time\n")
CONTRADICTION_SPEC = ("# Feature Specification: {n}\n## Requirements\n### Functional Requirements\n"
                      "- **FR-001**: System MUST expire sessions after 7 days\n"
                      "- **FR-002**: System MUST expire sessions after 30 days\n")
PLAN = "# P\n## Summary\nRecord the login time when a user logs in.\n"
TASKS = "## Phase 3: User Story 1 - Log (Priority: P1)\n- [ ] T001 [US1] Record the login time when a user logs in in src/auth.py\n"


@pytest.fixture
def make_repo(tmp_path):
    """T001: temp repo with several features: make_repo({"001-a": "good", "002-b": "blocker", "003-c": b"\\xff\\xfe"})."""
    def _make(features: dict):
        for name, kind in features.items():
            d = tmp_path / "specs" / name
            d.mkdir(parents=True)
            if isinstance(kind, bytes):                       # unparseable spec
                (d / "spec.md").write_bytes(kind)
                continue
            (d / "spec.md").write_text((CONTRADICTION_SPEC if kind == "blocker" else GOOD_SPEC).format(n=name))
            (d / "plan.md").write_text(PLAN)
            (d / "tasks.md").write_text(TASKS)
        return tmp_path
    return _make
