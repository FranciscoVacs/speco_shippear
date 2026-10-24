from __future__ import annotations

import re
from pathlib import Path

from ..model import Loc, Task
from . import md
from .plan import REF

_TASK = re.compile(r"^\s*[-*]\s+\[( |x|X)\]\s+(T\d+)\b\s*(.*)$")
_PATH = re.compile(r"(?<![\w/])((?:[\w.-]+/)+[\w.-]+\.\w+|[\w.-]+\.(?:py|ts|tsx|js|jsx|go|rs|java|rb|sql|md|ya?ml|toml|json))\b")
_PHASE = re.compile(r"^Phase\s+([\w.]+)\s*[:\-–—]\s*(.*)$", re.I)


def classify_phase(title: str) -> str:
    t = title.lower()
    if "user story" in t:
        return "story"
    if "setup" in t:
        return "setup"
    if "foundation" in t:
        return "foundational"
    if "polish" in t or "cross-cutting" in t:
        return "polish"
    return "other"


def parse_tasks(path: Path, rel: str | None = None, warnings: list[str] | None = None) -> list[Task]:
    rel = rel or path.name
    text = path.read_text(encoding="utf-8")
    tasks: list[Task] = []
    phase, kind, phase_story = "", "other", None
    in_fence = False
    for no, raw in enumerate(md.strip_comments(text).splitlines(), start=1):
        if raw.strip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        h = re.match(r"^#{2,3}\s+(.*?)\s*$", raw)
        if h:
            m = _PHASE.match(h.group(1))
            phase = m.group(2) if m else h.group(1)
            kind = classify_phase(phase)
            sm = re.search(r"User Story\s+(\d+)", phase, re.I)
            phase_story = f"US{sm.group(1)}" if sm else None
            continue
        m = _TASK.match(raw)
        if not m:
            if re.match(r"^\s*[-*]\s+\[( |x|X)\]", raw) and warnings is not None:
                warnings.append(f"{rel}:{no}: task sin ID (Txxx): {raw.strip()[:70]}")
            continue
        rest = m.group(3)
        parallel = False
        story = None
        # markers [P] / [USn] come right after the ID, in any order
        while True:
            mm = re.match(r"^\[(P|US\d+)\]\s*", rest)
            if not mm:
                break
            if mm.group(1) == "P":
                parallel = True
            else:
                story = mm.group(1)
            rest = rest[mm.end():]
        tasks.append(Task(
            id=m.group(2), text=md.strip_md(rest), loc=Loc(rel, no), parallel=parallel,
            story=story or (phase_story if kind == "story" else None), phase=phase, phase_kind=kind,
            done=m.group(1).lower() == "x", refs=sorted(set(REF.findall(rest))),
            paths=sorted(set(_PATH.findall(rest))),
        ))
    return tasks
