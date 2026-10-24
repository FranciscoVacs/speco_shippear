"""The GitHub Action and workflows are YAML we cannot run here: at least guard their shape."""
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")
ROOT = Path(__file__).resolve().parent.parent


def test_action_yaml_shape():
    a = yaml.safe_load((ROOT / "action.yml").read_text())
    assert a["runs"]["using"] == "composite"
    assert {"fail-on", "diff-base", "sarif", "comment"} <= set(a["inputs"])
    steps = {s.get("id") or s.get("name") for s in a["runs"]["steps"]}
    assert "run" in steps and "Upload to Code Scanning" in steps
    run = next(s for s in a["runs"]["steps"] if s.get("id") == "run")
    assert "-f sarif" in run["run"] and "--diff" in run["run"]
    assert all(s.get("shell") for s in a["runs"]["steps"] if "run" in s)           # composite steps require `shell`


@pytest.mark.parametrize("name", ["specreview.yml", "publish.yml"])
def test_workflows_parse(name):
    w = yaml.safe_load((ROOT / ".github" / "workflows" / name).read_text())
    assert w["jobs"]


def test_init_template_is_valid_yaml():
    from specreview.templates import WORKFLOW_TEMPLATE
    assert yaml.safe_load(WORKFLOW_TEMPLATE)["jobs"]["review"]["steps"]
