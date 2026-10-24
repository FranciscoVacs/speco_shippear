# Implementation Plan: Decided values

## Summary

Bind a rule to the line of code that holds its number (FR-001), compare the number every time the ledger is built and mark the rule failing with who changed it (FR-002, FR-003), report broken bindings and never call their rule verified (FR-004, FR-005), list what a moved number still touches (FR-006) and say how old a verification is (FR-007).

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: none at runtime; git when present
**Storage**: a `[values]` table in `specreview.toml`; nothing new is written
**Testing**: pytest on temporary git repositories and on this repository

## Approach

- A new module reads the `[values]` table, opens each file, finds the first match of the pattern and its line, and compares the captured number with the numbers of the rule text (FR-001, FR-002, FR-004)
- On a drift, git blame of that one line gives commit, author and date (FR-003)
- The ledger build adds the bindings to each intent and a drift or a broken binding makes the state failing with a reason (FR-002, FR-005)
- The change of a requirement reuses the moved values of the intent diff to find bindings that hold the old number and rules of the feature with a number in the same unit (FR-006)
- The ledger counts commits between the run and HEAD with git rev-list (FR-007)
- The CLI, the MCP answer and what_it_does show the reason in one line (FR-002)
