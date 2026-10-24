"""EARS (Easy Approach to Requirements Syntax) classification.

Patterns (Mavin et al.):
  ubiquitous    The <system> shall <response>
  event         When <trigger>, the <system> shall <response>
  state         While <state>, the <system> shall <response>
  unwanted      If <condition>, then the <system> shall <response>
  optional      Where <feature is included>, the <system> shall <response>
  complex       a combination of While/When/If/Where clauses
Spec Kit writes "System MUST ..." so MUST/SHALL (and ES "debe") are accepted as the normative verb.
"""
from __future__ import annotations

import re

STRONG = r"must|shall|debe|deben|deberá|deberán"
WEAK = r"should|may|could|might|can|ought to|debería|deberían|podría|podrían|puede|pueden"
_STRONG = re.compile(rf"\b({STRONG})\b", re.I)
_WEAK = re.compile(rf"\b({WEAK})\b", re.I)
_NOT = re.compile(rf"\b(?:{STRONG})\s+not\b|\bno\s+(?:debe|deben)\b", re.I)
_LEAD = {
    "event": re.compile(r"^\s*(when|cuando|once|after|upon)\b", re.I),
    "state": re.compile(r"^\s*(while|mientras|during|mientras que)\b", re.I),
    "unwanted": re.compile(r"^\s*(if|si)\b", re.I),
    "optional": re.compile(r"^\s*(where|donde|en caso de que)\b", re.I),
}
_SUBJECT_MODAL = re.compile(rf"^\s*(?:the\s+|el\s+|la\s+)?[\w\-/ ]{{1,60}}?\s+(?:{STRONG})\b", re.I)
_ACTOR_CENTRIC = re.compile(rf"\b(?:{STRONG}|should)\s+be able to\b|\bpoder\b|\bpodrá\b", re.I)
_TRAILING_TRIGGER = re.compile(r",?\s+(when|whenever|while|if|cuando|mientras|si)\s+\w+", re.I)


def normative(text: str) -> str:
    """'strong' | 'weak' | 'none'"""
    if _STRONG.search(text):
        return "strong"
    return "weak" if _WEAK.search(text) else "none"


def weak_words(text: str) -> list[str]:
    return sorted({m.group(1).lower() for m in _WEAK.finditer(text)})


def has_negation(text: str) -> bool:
    return bool(_NOT.search(text))


def classify(text: str) -> str:
    """Return an EARS pattern name, 'complex', or 'none' (not EARS-shaped)."""
    if normative(text) != "strong":
        return "none"
    clauses = []
    # complex = several lead clauses, e.g. "While X, when Y, the system shall ..."
    head = re.split(rf"\b(?:{STRONG})\b", text, maxsplit=1, flags=re.I)[0]
    for name, rx in _LEAD.items():
        if rx.match(head):
            clauses.append(name)
    inner = re.findall(r",\s*(when|while|if|where|cuando|mientras|si|donde)\b", head, flags=re.I)
    if len(clauses) + len(inner) >= 2:
        return "complex"
    if clauses:
        return clauses[0]
    if _SUBJECT_MODAL.match(text):
        return "ubiquitous"
    return "none"


def suggest_rewrite_hint(text: str) -> str | None:
    """Short, concrete hint on how to reach an EARS form, or None if already fine/unclear."""
    if _ACTOR_CENTRIC.search(text):
        return "Reformular desde el sistema: «System MUST allow <actor> to <acción>» (o «When <evento>, the system MUST …»)."
    if _TRAILING_TRIGGER.search(text):
        return "El disparador está al final: pasarlo al inicio, «When/While/If <condición>, the system MUST …»."
    return None
