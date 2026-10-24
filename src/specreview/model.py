"""Normalized model of a Spec Kit feature. Parsers produce it; analyzers consume it.

Every element carries `file` + `line` so findings can point at an exact place.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Loc:
    file: str
    line: int = 0

    def __str__(self) -> str:
        return f"{self.file}:{self.line}" if self.line else self.file


@dataclass
class Requirement:
    id: str                      # FR-001 / SC-001 (or synthetic when missing)
    text: str
    loc: Loc
    kind: str = "FR"             # FR (functional) | SC (success criterion)
    clarifications: list[str] = field(default_factory=list)  # open [NEEDS CLARIFICATION: ...]


@dataclass
class Scenario:
    story_id: str                # US1
    index: int
    text: str
    given: str = ""
    when: str = ""
    then: str = ""
    loc: Loc = Loc("")


@dataclass
class UserStory:
    id: str                      # US1
    number: int
    title: str
    priority: str | None
    loc: Loc
    body: str = ""
    independent_test: str = ""
    scenarios: list[Scenario] = field(default_factory=list)


@dataclass
class Clarification:
    session: str
    question: str
    answer: str
    loc: Loc


@dataclass
class Spec:
    path: str
    title: str = ""
    status: str = ""             # what the header declares: Draft, Implemented, Partially implemented (...)
    stories: list[UserStory] = field(default_factory=list)
    requirements: list[Requirement] = field(default_factory=list)      # FR
    success_criteria: list[Requirement] = field(default_factory=list)  # SC
    edge_cases: list[str] = field(default_factory=list)
    entities: dict[str, str] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)
    clarifications: list[Clarification] = field(default_factory=list)


@dataclass
class PlanItem:
    """A unit of the plan that can be matched against requirements."""
    id: str                      # P1, P2... (synthetic, stable by order)
    kind: str                    # summary | approach | entity | contract
    text: str
    loc: Loc
    refs: list[str] = field(default_factory=list)  # explicit FR-/SC- ids found in text


@dataclass
class Plan:
    path: str
    sections: dict[str, str] = field(default_factory=dict)
    context: dict[str, str] = field(default_factory=dict)  # Technical Context key/values
    items: list[PlanItem] = field(default_factory=list)
    text: str = ""


@dataclass
class Task:
    id: str                      # T012
    text: str
    loc: Loc
    parallel: bool = False
    story: str | None = None     # US1
    phase: str = ""
    phase_kind: str = "other"    # setup | foundational | story | polish | other
    done: bool = False
    refs: list[str] = field(default_factory=list)   # explicit FR-/SC- ids in text
    paths: list[str] = field(default_factory=list)  # file paths mentioned


@dataclass
class Feature:
    root: Path                   # repo root (dir holding .specify) or feature dir parent
    dir: Path                    # specs/NNN-name
    name: str
    spec: Spec | None = None
    plan: Plan | None = None
    tasks: list[Task] = field(default_factory=list)
    has_tasks_file: bool = False
    artifacts: dict[str, str] = field(default_factory=dict)  # data-model.md, research.md ... -> text
    constitution: str = ""
    warnings: list[str] = field(default_factory=list)   # parser-level problems (malformed lines)
