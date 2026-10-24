"""A candidate rule and the check that keeps models honest: evidence must be found, verbatim, in the repository at that commit (FR-005)."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

CATEGORIES = ("money", "permissions", "limits", "notifications", "data", "other")
MAX_EVIDENCE_LINES = 40
MIN_QUOTE = 8


@dataclass
class Evidence:
    path: str
    start_line: int
    end_line: int
    quote: str


@dataclass
class Candidate:
    statement: str
    category: str
    risk: str
    origin: str                       # spec | code
    confidence: str
    evidence: list[Evidence] = field(default_factory=list)
    proposed_by: str = ""


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def statement_key(statement: str) -> str:
    """Same canonical form as `decide_rule` in SQL (lower-case, collapsed whitespace): a corrected rule gets the same key it would have been proposed with."""
    return hashlib.sha256(normalize(statement).encode("utf-8")).hexdigest()


def lines_of(text: str) -> list[str]:
    return text.splitlines()


def snippet_hash(text: str, start: int, end: int) -> str:
    chunk = "\n".join(ln.rstrip() for ln in lines_of(text)[start - 1:end])
    return hashlib.sha256(chunk.encode("utf-8")).hexdigest()


def evidence_ok(e: Evidence, files: dict[str, str]) -> bool:
    text = files.get(e.path)
    if text is None or len(normalize(e.quote)) < MIN_QUOTE:
        return False
    lines = lines_of(text)
    if not (1 <= e.start_line <= e.end_line <= len(lines)) or e.end_line - e.start_line + 1 > MAX_EVIDENCE_LINES:
        return False
    return normalize(e.quote) in normalize(" ".join(lines[e.start_line - 1:e.end_line]))


def verify(c: Candidate, files: dict[str, str]) -> Candidate | None:
    """Keeps only the evidence that is really there; a candidate with none left is dropped. Code-origin confidence is capped at medium (D-009)."""
    good = [e for e in c.evidence if evidence_ok(e, files)]
    if not good or len(normalize(c.statement)) < 8:
        return None
    if c.category not in CATEGORIES:
        c.category = "other"
    if c.origin == "code" and c.confidence not in ("low", "medium"):
        c.confidence = "medium"
    c.evidence = good
    return c
