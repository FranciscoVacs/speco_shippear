# Tasks: Intent Ledger

## Phase 3: User Story 1 - Know what the software does today, by evidence (Priority: P1)

- [X] T001 [US1] Build the ledger with states, citations and orphan evidence in src/specreview/ledger.py (FR-001, FR-002, FR-003, FR-004, FR-005)
- [X] T002 [US1] Test the states and citations on a temporary repository in tests/test_ledger.py (FR-001, FR-002, FR-003, FR-004, FR-005)

## Phase 4: User Story 2 - Verify a rule and keep the record (Priority: P1)

- [X] T003 [US2] Run the configured command on the citing tests and chain the outcome in src/specreview/ledger.py (FR-006, FR-007, FR-008, FR-009)
- [X] T004 [US2] Test the run, the chain and the stale text in tests/test_ledger.py (FR-006, FR-007, FR-008, FR-009)

## Phase 5: User Story 3 - Create and correct the what (Priority: P1)

- [X] T005 [US3] Draft a feature and change a requirement with the intent record in src/specreview/ledger.py (FR-010, FR-011, FR-012, FR-013)
- [X] T006 [US3] Test drafting, changing and the approval warning in tests/test_ledger.py (FR-010, FR-011, FR-012, FR-013)

## Phase 6: User Story 4 - Audit how a rule got here (Priority: P2)

- [X] T007 [US4] Read the versions of a requirement from git and merge the timeline in src/specreview/ledger.py (FR-014, FR-015, FR-016)
- [X] T008 [US4] Test the history on a temporary git repository in tests/test_ledger.py (FR-014, FR-015, FR-016)

## Phase 7: User Story 5 - Use it from the terminal, the agent and the app (Priority: P2)

- [X] T009 [US5] Add the ledger subcommand in src/specreview/cli_sub.py (FR-017, FR-018)
- [X] T010 [US5] Add the ledger tools and instructions to src/specreview/mcp.py and the agent rules in src/specreview/templates.py (FR-020)
- [X] T011 [US5] Serve the ledger and show it in web/src/pages/LedgerPage.tsx (FR-019)
- [X] T012 [US5] Test the command, the tools and the endpoint in tests/test_ledger.py (FR-017, FR-018, FR-019, FR-020)
