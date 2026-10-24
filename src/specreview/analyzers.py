"""Analyzer registry: each analyzer is a function (Feature, ctx) -> list[Finding].

New layers (product context, Jira, ...) register here without touching the core (North Star hook).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .contradictions import check_contradictions
from .crossref import DEFAULT_THRESHOLD, coverage_findings, crossref
from .findings import Finding
from .model import Feature
from .product import check_product
from .quality import check_acceptance, check_requirements


@dataclass
class Context:
    llm: object | None = None
    threshold: float = DEFAULT_THRESHOLD


Analyzer = Callable[[Feature, Context], list[Finding]]

ANALYZERS: dict[str, Analyzer] = {
    "coverage": lambda f, c: coverage_findings(f, crossref(f, threshold=c.threshold, llm=c.llm)),
    "quality": lambda f, c: check_requirements(f),
    "acceptance": lambda f, c: check_acceptance(f),
    "contradictions": lambda f, c: check_contradictions(f, c.llm),
    "product": lambda f, c: check_product(f),                 # opt-in: emits nothing without a product/ folder
}


def run_all(feature: Feature, ctx: Context | None = None, only: list[str] | None = None) -> list[Finding]:
    ctx = ctx or Context()
    out: list[Finding] = []
    for name, fn in ANALYZERS.items():
        if only is None or name in only:
            out += fn(feature, ctx)
    return out
