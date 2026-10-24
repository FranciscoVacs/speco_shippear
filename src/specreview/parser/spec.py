from __future__ import annotations

import re
from pathlib import Path

from ..model import Clarification, Loc, Requirement, Scenario, Spec, UserStory
from . import md

_STORY = re.compile(r"^User Story\s+(\d+)\s*(?:[-–—:]\s*)?(.*?)\s*(?:\(\s*Priority:\s*(P\d+)\s*\))?\s*$", re.I)
_REQ = re.compile(r"^\*{0,2}((?:FR|NFR|SC)-\d+)\*{0,2}\s*[:.\-]?\s*\*{0,2}\s*(.+)$")
_NC = re.compile(r"\[NEEDS CLARIFICATION:?\s*(.*?)\]", re.I | re.S)
_SCEN = re.compile(r"^\s*(\d+)\.\s+(.*)$")
_GWT = re.compile(r"\*{0,2}(Given|When|Then|And)\*{0,2}\s+", re.I)
_STATUS = re.compile(r"^\*\*Status\*\*\s*:\s*(.+?)\s*$", re.M | re.I)
_QA = re.compile(r"^Q:\s*(.*?)\s*(?:→|->|—|=>)\s*A:\s*(.*)$", re.I | re.S)


def parse_spec(path: Path, rel: str | None = None) -> Spec:
    rel = rel or path.name
    text = path.read_text(encoding="utf-8")
    secs = md.split_sections(text)
    spec = Spec(path=rel)
    for s in secs:
        if s.level == 1:
            spec.title = re.sub(r"^Feature Specification:\s*", "", s.title, flags=re.I)
            break
    if m := _STATUS.search(text):
        spec.status = m.group(1)

    for s in md.find(secs, r"^User Story\s+\d+", level=3):
        story = _parse_story(s, rel)
        if story:
            spec.stories.append(story)

    for s in secs:
        title = s.title.lower()
        if re.search(r"functional requirements|^requirements$", title) and s.level >= 2:
            spec.requirements += _parse_reqs(s, rel, "FR")
        elif re.search(r"measurable outcomes|success criteria", title) and s.level >= 2:
            spec.success_criteria += _parse_reqs(s, rel, "SC")
        elif title.startswith("edge cases"):
            spec.edge_cases += [md.strip_md(t) for _, t in md.bullets(s.lines)]
        elif title.startswith("assumptions"):
            spec.assumptions += [md.strip_md(t) for _, t in md.bullets(s.lines)]
        elif title.startswith("key entities"):
            for _, t in md.bullets(s.lines):
                m = re.match(r"^\*\*(.+?)\*\*\s*:\s*(.*)$", t)
                if m:
                    spec.entities[m.group(1).strip()] = m.group(2).strip()
        elif re.match(r"session\s+\d{4}-\d{2}-\d{2}", title):
            for no, t in md.bullets(s.lines):
                m = _QA.match(t)
                if m:
                    spec.clarifications.append(
                        Clarification(s.title.split(None, 1)[1], m.group(1), m.group(2), Loc(rel, no)))
    return spec


def _parse_reqs(sec: md.Section, rel: str, kind: str) -> list[Requirement]:
    out = []
    for no, t in md.bullets(sec.lines):
        m = _REQ.match(t)
        if not m:
            continue
        rid, body = m.group(1), m.group(2).strip()
        ncs = [x.strip() for x in _NC.findall(body)]
        rid_kind = "SC" if rid.startswith("SC") else "FR"
        out.append(Requirement(rid, md.strip_md(body), Loc(rel, no), rid_kind, ncs))
    return out


def _parse_story(sec: md.Section, rel: str) -> UserStory | None:
    m = _STORY.match(sec.title)
    if not m:
        return None
    n = int(m.group(1))
    story = UserStory(f"US{n}", n, m.group(2).strip(), m.group(3), Loc(rel, sec.line))
    mode = "body"
    body: list[str] = []
    cur: Scenario | None = None
    for no, raw in sec.lines:
        line = raw.strip()
        if re.match(r"^\*\*Acceptance Scenarios?\*\*", line, re.I):
            mode = "scen"
            continue
        m_it = re.match(r"^\*\*Independent Test\*\*\s*:\s*(.*)$", line, re.I)
        if m_it:
            story.independent_test = m_it.group(1)
            mode = "it"
            continue
        if re.match(r"^\*\*Why this priority\*\*", line, re.I):
            mode = "why"
            continue
        if line == "---":
            continue
        if mode == "scen":
            sm = _SCEN.match(raw)
            if sm:
                cur = Scenario(story.id, int(sm.group(1)), md.strip_md(sm.group(2)), loc=Loc(rel, no))
                _fill_gwt(cur)
                story.scenarios.append(cur)
            elif cur and line:
                cur.text += " " + md.strip_md(line)
                _fill_gwt(cur)
        elif mode == "body" and line:
            body.append(line)
    story.body = " ".join(body)
    return story


def _fill_gwt(sc: Scenario) -> None:
    parts = re.split(r"(?i)\b(Given|When|Then)\b", re.sub(r"\*\*", "", sc.text))
    # parts: ['', 'Given', ' x, ', 'When', ' y, ', 'Then', ' z']
    cur = None
    acc = {"given": "", "when": "", "then": ""}
    for p in parts:
        k = p.strip().lower()
        if k in acc:
            cur = k
        elif cur:
            acc[cur] += p.strip(" ,;")
    sc.given, sc.when, sc.then = acc["given"], acc["when"], acc["then"]
