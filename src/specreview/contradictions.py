"""Contradiction candidates between requirements: same topic, conflicting number or polarity."""
from __future__ import annotations

import re
from itertools import combinations

from . import ears
from .findings import Finding, Severity
from .model import Feature, Requirement
from .text import LexicalSimilarity

_UNITS = {  # -> (dimension, factor to base)
    "ms": ("t", 0.001), "millisecond": ("t", 0.001), "milliseconds": ("t", 0.001),
    "s": ("t", 1), "sec": ("t", 1), "second": ("t", 1), "seconds": ("t", 1), "segundo": ("t", 1), "segundos": ("t", 1),
    "min": ("t", 60), "minute": ("t", 60), "minutes": ("t", 60), "minuto": ("t", 60), "minutos": ("t", 60),
    "hour": ("t", 3600), "hours": ("t", 3600), "hora": ("t", 3600), "horas": ("t", 3600),
    "day": ("t", 86400), "days": ("t", 86400), "día": ("t", 86400), "días": ("t", 86400), "dia": ("t", 86400), "dias": ("t", 86400),
    "week": ("t", 604800), "weeks": ("t", 604800), "semana": ("t", 604800), "semanas": ("t", 604800),
    "%": ("pct", 1), "percent": ("pct", 1),
}
_QTY = re.compile(r"(\d+(?:[.,]\d+)?)\s*(%|[A-Za-zÀ-ÿ]+)")


def quantities(text: str) -> list[tuple[str, float, str]]:
    """[(dimension-or-word, base value, raw)] for numbers followed by a unit/noun."""
    out = []
    for m in _QTY.finditer(text):
        n = float(m.group(1).replace(",", "."))
        unit = m.group(2).lower()
        dim, k = _UNITS.get(unit, (unit, 1))
        out.append((dim, n * k, m.group(0)))
    return out


def find_candidates(reqs: list[Requirement], topic_threshold: float = 0.5) -> list[tuple[Requirement, Requirement, str]]:
    sim = LexicalSimilarity([r.text for r in reqs])
    out = []
    for a, b in combinations(reqs, 2):
        if sim.similarity(a.text, b.text) < topic_threshold:
            continue
        # polarity: one forbids what the other requires
        if ears.has_negation(a.text) != ears.has_negation(b.text):
            out.append((a, b, "uno exige y el otro prohíbe lo mismo"))
            continue
        qa, qb = quantities(a.text), quantities(b.text)
        for da, va, ra in qa:
            for db, vb, rb in qb:
                if da == db and va != vb:
                    out.append((a, b, f"valores distintos para lo mismo: «{ra}» vs «{rb}»"))
                    break
            else:
                continue
            break
    return out


def check_contradictions(feature: Feature, llm=None) -> list[Finding]:
    reqs = feature.spec.requirements + feature.spec.success_criteria
    out = []
    seen = set()
    for a, b, why in find_candidates(reqs):
        seen.add((a.id, b.id))
        out.append(Finding("CON001", Severity.BLOCKER, [a.id, b.id], a.loc,
                           f"{a.id} y {b.id} se contradicen: {why}.",
                           "Decidir cuál vale y eliminar o corregir el otro", [f"{b.id} en {b.loc}"]))
    if llm is not None:
        from .llm import llm_contradictions
        for a_id, b_id, why in llm_contradictions(reqs, llm):
            if (a_id, b_id) in seen or (b_id, a_id) in seen:
                continue
            by_id = {r.id: r for r in reqs}
            if a_id in by_id and b_id in by_id:
                out.append(Finding("CON002", Severity.WARNING, [a_id, b_id], by_id[a_id].loc,
                                   f"{a_id} y {b_id} parecen contradecirse (juicio del modelo): {why}",
                                   "Revisar a mano: puede ser un falso positivo", [f"{b_id} en {by_id[b_id].loc}"]))
    return out
