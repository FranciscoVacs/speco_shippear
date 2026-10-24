"""Small markdown helpers shared by the parsers (no external deps)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_COMMENT = re.compile(r"<!--.*?-->", re.S)
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_FENCE = re.compile(r"^\s*(```|~~~)")
_PLACEHOLDER_STAR = re.compile(r"\s*\*\(.*?\)\*\s*$")  # '*(mandatory)*' suffixes


def strip_comments(text: str) -> str:
    """Remove HTML comments but keep line count so line numbers stay valid."""
    return _COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), text)


@dataclass
class Section:
    level: int
    title: str
    line: int                       # 1-based line of the heading
    lines: list[tuple[int, str]] = field(default_factory=list)  # (lineno, text) body lines, fences excluded

    @property
    def body(self) -> str:
        return "\n".join(t for _, t in self.lines)


def split_sections(text: str) -> list[Section]:
    """Flat list of sections in document order. Headings inside code fences are ignored."""
    sections: list[Section] = []
    in_fence = False
    cur: Section | None = None
    for no, raw in enumerate(strip_comments(text).splitlines(), start=1):
        if _FENCE.match(raw):
            in_fence = not in_fence
            if cur is not None:
                cur.lines.append((no, raw))   # keep fences: plan trees live there
            continue
        m = None if in_fence else _HEADING.match(raw)
        if m:
            title = _PLACEHOLDER_STAR.sub("", m.group(2)).strip()
            cur = Section(len(m.group(1)), title, no)
            sections.append(cur)
        elif cur is not None:
            cur.lines.append((no, raw))
    return sections


def find(sections: list[Section], pattern: str, level: int | None = None) -> list[Section]:
    rx = re.compile(pattern, re.I)
    return [s for s in sections if rx.search(s.title) and (level is None or s.level == level)]


def children(sections: list[Section], parent: Section) -> list[Section]:
    """Sections nested under `parent` (until a heading of same/higher level)."""
    out = []
    started = False
    for s in sections:
        if s is parent:
            started = True
            continue
        if started:
            if s.level <= parent.level:
                break
            out.append(s)
    return out


def bullets(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Top-level bullets with their continuation lines joined. Returns (lineno, text)."""
    out: list[tuple[int, str]] = []
    cur: list | None = None
    for no, raw in lines:
        if raw.strip() == "---":
            continue
        m = re.match(r"^\s{0,3}[-*+]\s+(.*)$", raw)
        if m:
            cur = [no, m.group(1).strip()]
            out.append(cur)  # type: ignore[arg-type]
        elif cur is not None and raw.strip() and raw.startswith((" ", "\t")):
            cur[1] += " " + raw.strip()
        elif not raw.strip():
            cur = None
        else:
            cur = None
    return [(a, b) for a, b in out]


def strip_md(s: str) -> str:
    """Drop bold/italic/code markers for matching and display."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", s)
    return s.replace("`", "").strip()
