"""The developer onboarding exists in three places: docs/28 + docs/29 (markdown) and web/src/developers/content.json (the /docs/developers page).
This keeps them from drifting: same commands in all of them, Spanish and English with the same shape, and every output the page shows is
what the CLI really prints today."""
import json
import re
import shutil
import subprocess

import pytest

from conftest import ROOT
from specreview.cli import main

CONTENT = json.loads((ROOT / "web" / "src" / "developers" / "content.json").read_text(encoding="utf-8"))
DOCS = "\n".join((ROOT / "docs" / f).read_text(encoding="utf-8") for f in ("28-developer-quickstart.md", "29-developer-recipes.md"))


def norm(text: str) -> str:
    """Markdown noise out (backticks, blockquote markers), whitespace collapsed: so a snippet can be looked up inside prose."""
    text = re.sub(r"^\s*>\s?", "", text, flags=re.M).replace("`", "")
    return re.sub(r"\s+", " ", text).strip()


def lines(block: str) -> list[str]:
    """Non-empty lines of a command snippet, without the trailing `# comment` (those are explanations and may be worded differently)."""
    return [norm(re.sub(r"\s+#\s.*$", "", x)) for x in block.splitlines() if norm(re.sub(r"\s+#\s.*$", "", x))]


def shape(v):
    """Keys of dicts and lengths of lists, recursively: the structure both languages must share."""
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, list):
        return [shape(x) for x in v]
    return "str"


def test_spanish_and_english_have_the_same_shape():
    # verifies 023/SC-004
    assert shape(CONTENT["es"]) == shape(CONTENT["en"])


def test_every_command_on_the_page_is_in_the_markdown_docs():
    # verifies 023/FR-015, SC-002
    code = CONTENT["code"]
    snippets = [code["demoCmd"], code["install"], code["ownRepo"], code["mcpCheck"], code["ci"]]
    for c in code["clients"]:
        snippets.append(c["code"])
        snippets.append(c.get("extra", {}).get("code", ""))
    snippets += [r["how"] for r in code["recipes"] if "how" in r]
    docs = norm(DOCS)
    missing = [ln for s in snippets for ln in lines(s) if ln not in docs]
    assert not missing, "on the page but not in docs/28 or docs/29 (fix one of them, they must agree):\n" + "\n".join(missing)


def test_the_page_lists_the_tools_the_mcp_really_has():
    from specreview.mcp import Server
    real = {t["name"] for t in Server(ROOT / "examples" / "invitations").tools()} if hasattr(Server, "tools") else None
    page = {re.sub(r"\(.*", "", n) for n in CONTENT["code"]["tools"]}
    if real is not None:
        assert page == real
    docs = norm(DOCS)
    assert all(n in docs for n in page)


def test_the_spanish_prompts_are_in_docs_29():
    docs = norm(DOCS)
    prompts = [CONTENT["es"]["mcp"]["firstPrompt"]] + [p["prompt"] for p in CONTENT["es"]["prompts"]["items"]]
    missing = [p for p in prompts if norm(p) not in docs]
    assert not missing, missing


def run(capsys, *argv):
    code = main([*map(str, argv)])
    cap = capsys.readouterr()
    return norm(cap.out + cap.err)


def shown_lines(output: str):
    for ln in output.splitlines():
        ln = norm(ln)
        if ln:
            yield ln.rstrip("…").strip()


def check_output(page_output: str, actual: str):
    missing = [ln for ln in shown_lines(page_output) if ln not in actual]
    assert not missing, "the page shows output the CLI no longer prints:\n" + "\n".join(missing)


def recipe(rid):
    return next(r for r in CONTENT["code"]["recipes"] if r["id"] == rid)


def test_demo_output_on_the_page_is_what_demo_prints(capsys, tmp_path):
    # verifies 023/FR-015, SC-003
    check_output(CONTENT["code"]["demoOutput"], run(capsys, "demo", "--dir", tmp_path / "d"))


def test_gate_recipe_output_is_real(capsys):
    # verifies 023/FR-015, SC-003
    check_output(recipe("gate")["output"], run(capsys, "gate", ROOT / "examples" / "wire-transfers"))


def test_scope_recipe_output_is_real(capsys):
    # verifies 023/FR-015, SC-003
    actual = run(capsys, ROOT / "examples" / "invitations", "--min-severity", "warning", "--color", "never")
    check_output(recipe("scope")["output"], actual)


def test_product_recipe_output_is_real(capsys):
    # verifies 023/FR-015, SC-003
    actual = run(capsys, ROOT / "examples" / "subscriptions", "--only", "product", "--color", "never")
    check_output(recipe("producto")["output"], actual)


def test_baseline_recipe_output_is_real(capsys, tmp_path):
    # verifies 023/FR-015, SC-003
    shutil.copytree(ROOT / "examples" / "invitations", tmp_path / "r")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path / "r", check=True)
    check_output(recipe("baseline")["output"], run(capsys, "baseline", tmp_path / "r"))


def test_requirement_recipe_output_is_real():
    # verifies 023/FR-015, SC-003
    from specreview.mcp import Server
    res = Server(ROOT / "examples" / "invitations").t_check_requirement({"text": "The system should be fast and user friendly"})
    actual = norm(" ".join(f"{i['message']} {i['fix']}" for i in res["issues"]))
    page = [re.sub(r"^QUA002\s+|^→\s*", "", ln) for ln in shown_lines(recipe("requisito")["output"])]
    missing = [ln for ln in page if ln.replace("FR-001 ", "") not in actual.replace("FR-001 ", "")]
    assert not missing, missing


@pytest.mark.parametrize("rid", ["gate", "scope", "producto"])
def test_recipe_outputs_on_the_page_also_appear_in_docs_29(rid):
    docs = norm(DOCS)
    missing = [ln for ln in shown_lines(recipe(rid)["output"]) if ln not in docs]
    assert not missing, missing
