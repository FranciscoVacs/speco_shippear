# Tasks: Continuous evidence

## Phase 3: User Story 1 - An error of the environment is not a broken rule (Priority: P1)

- [X] T001 [US1] Classify runs that ran no test as errors and skip them in the ledger in src/specreview/ledger.py (FR-001, FR-002)
- [X] T002 [US1] Test a missing runner and a verified rule that keeps its state in tests/test_evidence.py (FR-001, FR-002)

## Phase 4: User Story 2 - One run of the suite verifies every rule (Priority: P1)

- [X] T003 [US2] Parse JUnit, map cases to rules and record one run per rule in src/specreview/evidence.py (FR-003, FR-004, FR-005)
- [X] T004 [US2] Run the configured suite once and print the broken rules in src/specreview/cli_sub.py (FR-006, FR-007)
- [X] T005 [US2] Test import, absence, suite run and exit code in tests/test_evidence.py (FR-003, FR-004, FR-005, FR-006, FR-007, SC-002)
- [X] T006 [US2] Import the report of the test job in CI in .github/workflows/specreview.yml (FR-007)

## Phase 5: User Story 3 - The agent proposes the bindings of decided numbers (Priority: P2)

- [X] T007 [US3] Suggest bindings as TOML in src/specreview/evidence.py and expose them in the CLI and the MCP server (FR-008, FR-009)
- [X] T008 [US3] Test the suggestion and its precision on this repository in tests/test_evidence.py (FR-008, FR-009, SC-001)
