# Implementation Plan: Spec Review Engine

**Branch**: `001-spec-review-engine` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

A Python package reads a Spec Kit feature (FR-001), cross-checks requirements against plan items and tasks in both
directions (FR-003, FR-005), and evaluates each requirement for ambiguity, testability, acceptance criteria and
contradictions (FR-006, FR-007, FR-008). Inferred gaps are warnings unless the repository cites requirement ids (FR-004).
The result is a single report object rendered as text, JSON or Markdown (FR-010, FR-015), with an exit code driven by a
severity threshold (FR-002, FR-011). The tool never writes to the reviewed repository (FR-009), makes no network request
unless a model is configured (FR-012), and gives a model only what text comparison could not resolve (FR-014). Every rule is
explained from one catalog (FR-013).

## Technical Context

**Language/Version**: Python 3.11+

**Primary Dependencies**: none in the core (standard library only); an optional model adapter

**Storage**: N/A (reads markdown files)

**Testing**: pytest, with a fixture of planted defects and snapshot tests of the report

**Target Platform**: any machine with Python (CLI)

**Project Type**: library and CLI

**Performance Goals**: review a 17-requirement feature in under 2 seconds (SC-003)

**Constraints**: offline by default, read-only

## Constitution Check

I Offline and deterministic: PASS. II Evidence decides severity: PASS (FR-004). III Read-only: PASS (FR-009).
IV One source of truth: PASS (FR-013). V Known truth before trust: PASS (SC-001, SC-004). VI Dogfooding: PASS.

## Project Structure

```text
src/specreview/
├── model.py          # normalized dataclasses
├── parser/           # spec, plan, tasks, discovery
├── text.py           # tokens, similarity
├── crossref.py       # coverage engine
├── quality.py        # EARS, ambiguity, acceptance
├── contradictions.py
├── rules.py          # rule catalog
├── report.py         # one report, three renderings
└── cli.py
```

## Complexity Tracking

None.
