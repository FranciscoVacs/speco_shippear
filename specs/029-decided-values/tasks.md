# Tasks: Decided values

## Phase 3: User Story 1 - See that a decided number changed in the code (Priority: P1)

- [X] T001 [US1] Read the bindings, compare the numbers and blame the line in src/specreview/values.py (FR-001, FR-002, FR-003)
- [X] T002 [US1] Add the bindings and the drift reason to each intent in src/specreview/ledger.py (FR-001, FR-002, FR-003)
- [X] T003 [US1] Test a matching binding, a drift and the blame on a temporary git repository in tests/test_values.py (FR-001, FR-002, FR-003, SC-001, SC-002)

## Phase 4: User Story 2 - Trust the binding itself (Priority: P1)

- [X] T004 [US2] Report broken bindings and keep their rule from verified in src/specreview/ledger.py (FR-004, FR-005)
- [X] T005 [US2] Test a missing file and a pattern that matches nothing in tests/test_values.py (FR-004, FR-005)

## Phase 5: User Story 3 - Know what else a change of a number touches (Priority: P2)

- [X] T006 [US3] List bindings with the old number and rules with the same unit in change_requirement in src/specreview/ledger.py (FR-006)
- [X] T007 [US3] Test the impact of moving 20 credits to 30 in tests/test_values.py (FR-006)

## Phase 6: User Story 4 - Know how old a verification is (Priority: P3)

- [X] T008 [US4] Count commits since the run in src/specreview/ledger.py (FR-007)
- [X] T009 [US4] Test a run two commits old in tests/test_values.py (FR-007)

## Phase 7: Dogfooding

- [X] T010 Bind the referral numbers of spec 021 in specreview.toml and show them in the CLI (FR-001, FR-002)
