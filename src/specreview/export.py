"""Self-contained HTML export: the built web UI with the report embedded (no server needed)."""
from __future__ import annotations

import json
from pathlib import Path

from .model import Feature
from .report import Report, to_dict

MARKER = "<!--SPECREVIEW_DATA-->"
SOURCE_FILES = ("spec.md", "plan.md", "tasks.md", "data-model.md")


def default_template() -> Path | None:
    p = Path(__file__).resolve().parents[2] / "web" / "dist-single" / "index.html"
    return p if p.is_file() else None


def _js_json(obj) -> str:
    # '<' escaped so spec text like "</script>" can never terminate the inline script (XSS-safe embedding);
    # U+2028/2029 are valid JSON but historically broke JS string literals.
    return (json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def render_html(report: Report, feature: Feature, template: Path | None = None) -> str:
    template = template or default_template()
    if template is None or not template.is_file():
        raise FileNotFoundError("no encuentro la UI compilada: correr `npm run build:single` en web/ o pasar --template")
    html = template.read_text(encoding="utf-8")
    if MARKER not in html:
        raise ValueError(f"la plantilla {template} no contiene el marcador {MARKER}")
    sources = {n: (feature.dir / n).read_text(encoding="utf-8") for n in SOURCE_FILES if (feature.dir / n).is_file()}
    from .rules import QUESTIONS, rules_as_dicts
    data = {"report": to_dict(report), "sources": sources, "rules": {"questions": QUESTIONS, "rules": rules_as_dicts()}}
    return html.replace(MARKER, f"<script>window.__SPECREVIEW__ = {_js_json(data)};</script>", 1)
