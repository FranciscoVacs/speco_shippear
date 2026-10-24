"""The product guide exists in two places: docs/30 (markdown) and web/src/product-guide/content.json (the /docs/product page).
This keeps them from drifting: same commands, Spanish and English with the same shape, and every doc the page links to exists."""
import json
import re

from conftest import ROOT

CONTENT = json.loads((ROOT / "web" / "src" / "product-guide" / "content.json").read_text(encoding="utf-8"))
GUIDE = (ROOT / "docs" / "30-product-manager-guide.md").read_text(encoding="utf-8")


def norm(text: str) -> str:
    text = re.sub(r"^\s*>\s?", "", text, flags=re.M).replace("`", "")
    return re.sub(r"\s+", " ", text).strip()


def shape(v):
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, list):
        return [shape(x) for x in v]
    return "str"


def test_spanish_and_english_have_the_same_shape():
    assert shape(CONTENT["es"]) == shape(CONTENT["en"])


def test_every_command_on_the_page_is_in_the_markdown_guide():
    code = CONTENT["code"]
    docs = norm(GUIDE)
    cmds = [code["setupCmds"], code["slackCmd"], code["reportCmds"]]
    for lang in ("es", "en"):
        for lv in CONTENT[lang]["setup"]["levels"]:
            cmds += re.findall(r"`(specreview [^`]+)`", " ".join(lv["steps"]))
    lines = [norm(re.sub(r"\s+#\s.*$", "", ln)) for c in cmds for ln in c.splitlines()]
    missing = [ln for ln in lines if ln and ln not in docs]
    assert not missing, "on the page but not in docs/30:\n" + "\n".join(missing)


def test_linked_docs_exist():
    for f in CONTENT["es"]["guideFiles"]:
        assert (ROOT / "docs" / f"{f}.md").exists(), f
