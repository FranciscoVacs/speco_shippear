from __future__ import annotations

import re
from pathlib import Path

from ..model import Loc, Plan, PlanItem
from . import md

REF = re.compile(r"\b((?:FR|NFR|SC)-\d+)\b")
# Sections that describe *what will be built* (vs. boilerplate like Constitution Check)
_PLANNING = re.compile(r"summary|approach|overview|implementation|design|architecture|phase|steps|strategy", re.I)
_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")


def parse_plan(path: Path, rel: str | None = None) -> Plan:
    rel = rel or path.name
    text = path.read_text(encoding="utf-8")
    secs = md.split_sections(text)
    plan = Plan(path=rel, text=md.strip_comments(text))
    for s in secs:
        plan.sections[s.title] = s.body
    for s in md.find(secs, r"technical context"):
        for _, line in s.lines:
            m = re.match(r"^\*\*(.+?)\*\*\s*:\s*(.*)$", line.strip())
            if m:
                plan.context[m.group(1)] = m.group(2)

    n = 0
    for s in secs:
        if s.level < 2 or not _PLANNING.search(s.title):
            continue
        if re.search(r"constitution|complexity", s.title, re.I):
            continue
        # bullets/numbered items are individual steps; paragraphs are split into sentences
        units: list[tuple[int, str]] = []
        para: list[tuple[int, str]] = []

        def flush():
            if para:
                joined = " ".join(t.strip() for _, t in para)
                for sent in _SENT.split(joined):
                    if sent.strip():
                        units.append((para[0][0], sent.strip()))
                para.clear()

        in_fence = False
        for no, raw in s.lines:
            if raw.strip().startswith(("```", "~~~")):
                in_fence = not in_fence
                flush()
                continue
            if in_fence:
                continue
            b = re.match(r"^\s{0,3}(?:[-*+]|\d+\.)\s+(.*)$", raw)
            if b:
                flush()
                units.append((no, b.group(1).strip()))
            elif raw.strip():
                para.append((no, raw))
            else:
                flush()
        flush()
        for no, t in units:
            n += 1
            kind = "summary" if re.search("summary|overview", s.title, re.I) else "approach"
            plan.items.append(PlanItem(f"P{n}", kind, md.strip_md(t), Loc(rel, no), sorted(set(REF.findall(t)))))
    return plan


def plan_items_from_data_model(text: str, rel: str, start: int) -> list[PlanItem]:
    """Each entity heading in data-model.md is a plan item (it implies work: schema, model)."""
    items = []
    n = start
    for s in md.split_sections(text):
        if s.level == 2:
            n += 1
            desc = " ".join(re.sub(r"^[-*+]\s+", "", t.strip()) for _, t in s.lines if t.strip())
            items.append(PlanItem(f"P{n}", "entity", md.strip_md(f"{s.title}: {desc}"), Loc(rel, s.line),
                                  sorted(set(REF.findall(desc)))))
    return items
