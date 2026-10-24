from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum

from .model import Loc


class Severity(IntEnum):
    SUGGESTION = 1
    WARNING = 2
    BLOCKER = 3

    @property
    def key(self) -> str:
        return {1: "suggestion", 2: "warning", 3: "blocker"}[self.value]

    @property
    def label(self) -> str:
        return {1: "sugerencia", 2: "advertencia", 3: "bloqueante"}[self.value]


@dataclass
class Finding:
    rule: str                 # COV001, QUA001, ...
    severity: Severity
    ids: list[str]            # requirement/task/story/plan-item ids the finding is about (FR-005, T009, US3...)
    loc: Loc
    message: str              # short explanation
    fix: str = ""             # optional one-line suggestion
    evidence: list[str] = field(default_factory=list)
