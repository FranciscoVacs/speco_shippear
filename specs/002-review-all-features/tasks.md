# Tasks: Review All Features

**Input**: Design documents from `/specs/002-review-all-features/`

## Phase 1: Setup

- [X] T001 Create a helper that builds a temporary repository with several features in tests/conftest.py

## Phase 2: Foundational

- [X] T002 Share the feature discovery between the server and the command line in src/specreview/parser/loader.py (FR-001, FR-002)

## Phase 3: User Story 1 - Review every feature with one command (Priority: P1)

- [X] T003 [P] [US1] Test that three features are reviewed in name order and that an empty repository exits with code 2 in tests/test_all_mode.py (FR-001, FR-002)
- [X] T004 [US1] Add the all option and review each discovered feature in src/specreview/cli.py (FR-001, FR-004)
- [X] T005 [US1] Render the summary table with one row per feature and its counts in src/specreview/report.py (FR-003)

## Phase 4: User Story 2 - Get one verdict for automation (Priority: P2)

- [X] T006 [P] [US2] Test the exit code for a blocker, a parse failure and the min-severity filter in tests/test_all_mode.py (FR-006, FR-007, FR-009)
- [X] T007 [US2] Compute the exit code as the worst result across features in src/specreview/cli.py (FR-006)
- [X] T008 [US2] Report an unparseable feature as failed and continue with the rest in src/specreview/cli.py (FR-007)
- [X] T009 [US2] Apply the min-severity filter to each listing but not to the table in src/specreview/cli.py (FR-009)

## Phase 5: User Story 3 - Feed all reviews to other tools (Priority: P3)

- [X] T010 [P] [US3] Test the multi-feature JSON document, the HTML refusal and the unchanged single-feature output in tests/test_all_mode.py (FR-005, FR-008, FR-010)
- [X] T011 [US3] Print one JSON document with a schema version and the list of reports in src/specreview/report.py (FR-005)
- [X] T012 [US3] Refuse the HTML format with the all option in src/specreview/cli.py (FR-008)

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T013 [P] Document the all option in README.md and docs/07-product-guide.md
- [X] T014 Measure the review of this repository's four features in under 5 seconds (SC-001)
