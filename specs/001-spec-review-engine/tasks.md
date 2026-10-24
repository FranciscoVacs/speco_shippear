# Tasks: Spec Review Engine

**Input**: Design documents from `/specs/001-spec-review-engine/`

## Phase 1: Setup

- [X] T001 Create the package layout and pyproject.toml in src/specreview/
- [X] T002 [P] Create the example repository with planted defects and expected.json in examples/invitations/

## Phase 2: Foundational

- [X] T003 Define the normalized model of requirements, stories, plan items and tasks in src/specreview/model.py
- [X] T004 [P] Implement the markdown helpers that ignore comments and code fences in src/specreview/parser/md.py

## Phase 3: User Story 1 - Review a feature from the command line (Priority: P1)

- [X] T005 [P] [US1] Parse spec.md into requirements, stories and scenarios in src/specreview/parser/spec.py (FR-001)
- [X] T006 [P] [US1] Parse plan.md and data-model.md into plan items in src/specreview/parser/plan.py (FR-001)
- [X] T007 [P] [US1] Parse tasks.md into tasks with phases, story labels and file paths in src/specreview/parser/tasks.py (FR-001)
- [X] T008 [US1] Discover the feature folder from a feature directory or a repository root and exit with code 2 when spec.md is missing in src/specreview/parser/loader.py and src/specreview/cli.py (FR-001, FR-002)
- [X] T009 [US1] Render each finding on one line with severity, location, rule and message in src/specreview/report.py (FR-010)
- [X] T010 [US1] Render the same findings as JSON and as Markdown in src/specreview/report.py (FR-015)
- [X] T011 [US1] Exit with code 1 when a finding reaches the fail-on severity in src/specreview/cli.py (FR-011)

## Phase 4: User Story 2 - Find requirements nobody will implement (Priority: P1)

- [X] T012 [US2] Implement similarity by weighted terms in src/specreview/text.py (FR-003)
- [X] T013 [US2] Report requirements with no counterpart in plan or tasks in src/specreview/crossref.py (FR-003)
- [X] T014 [US2] Report inferred gaps as warnings unless the repository cites requirement ids in src/specreview/crossref.py (FR-004)
- [X] T015 [US2] Report tasks and plan steps that introduce concepts no requirement mentions in src/specreview/crossref.py (FR-005)

## Phase 5: User Story 3 - Find requirements that cannot be verified (Priority: P2)

- [X] T016 [P] [US3] Classify requirements into the five EARS patterns in src/specreview/ears.py (FR-006)
- [X] T017 [US3] Report quality attributes without a numeric threshold as not testable in src/specreview/quality.py (FR-006)
- [X] T018 [US3] Report user stories without acceptance scenarios in src/specreview/quality.py (FR-008)
- [X] T019 [US3] Report contradictions between requirements with different values in the same unit in src/specreview/contradictions.py (FR-007)

## Phase 6: User Story 4 - Understand and trust a finding (Priority: P2)

- [X] T020 [US4] Write the rule catalog and the explain command in src/specreview/rules.py and src/specreview/cli.py (FR-013)

## Phase 7: User Story 5 - Trust the tool with my repository (Priority: P2)

- [X] T021 [US5] Keep the core free of file writes and network calls in src/specreview/ (FR-009, FR-012)
- [X] T022 [US5] Send a model only the requirements and tasks the text comparison left unresolved in src/specreview/crossref.py and src/specreview/llm.py (FR-014)

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T023 [P] Add snapshot tests of the text and Markdown reports in tests/test_report.py
- [X] T024 [P] Compare the review of the example repository with its known truth in tests/groundtruth.py
- [X] T025 Document the calibration against a real repository in docs/04-real-repo-calibration.md
