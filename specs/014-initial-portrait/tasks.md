# Tasks: Initial Portrait of Business Rules

## Phase 3: User Story 1 - See what exists in my repositories (Priority: P1)

- [X] T001 [US1] Build the inventory of a repository by kind of file from the file names in cloud/speco_cloud/portrait/inventory.py (FR-001)
- [X] T002 [US1] Store the inventory and read the branch head on the first sync in cloud/speco_cloud/portrait/pipeline.py and cloud/speco_cloud/worker.py (FR-001)

## Phase 4: User Story 2 - Rules proposed with proof (Priority: P1)

- [X] T003 [US2] Propose a rule for each requirement of an implemented spec in cloud/speco_cloud/portrait/extractors.py (FR-002)
- [X] T004 [US2] Propose rules from a budgeted set of code files only where the company consented in cloud/speco_cloud/portrait/pipeline.py and cloud/speco_cloud/portrait/extractors.py (FR-003, FR-004, NFR-001)
- [X] T005 [US2] Discard any proposal whose quoted evidence is not at its lines in cloud/speco_cloud/portrait/candidates.py (FR-005, SC-001)
- [X] T006 [US2] Store proposals as proposed only and never twice in supabase/migrations/20261015000005_portrait.sql and cloud/speco_cloud/portrait/pipeline.py (FR-006, FR-012)

## Phase 5: User Story 3 - The people who approve decide (Priority: P1)

- [X] T007 [US3] Add the decision function and the append-only record of decisions in supabase/migrations/20261015000005_portrait.sql (FR-007, FR-008)
- [X] T008 [US3] Add the API to list proposed rules and decide them in cloud/speco_cloud/app.py (FR-007, FR-008)

## Phase 6: User Story 4 - Freeze the baseline (Priority: P1)

- [X] T009 [US4] Add the baseline freeze function and its immutable table in supabase/migrations/20261015000005_portrait.sql (FR-009, SC-002)
- [X] T010 [US4] Add the API to freeze and list baselines in cloud/speco_cloud/app.py (FR-009)

## Phase 7: User Story 5 - Notice when a change touches a decided rule (Priority: P1)

- [X] T011 [US5] Compare the supporting lines of confirmed rules on every sync and open findings in cloud/speco_cloud/portrait/drift.py (FR-010, SC-003)
- [X] T012 [US5] Add the acknowledgement function and the API in supabase/migrations/20261015000005_portrait.sql and cloud/speco_cloud/app.py (FR-011)

## Phase 8: Verification

- [X] T013 Test the inventory, the extractors, the evidence check, consent and the limits of the service in tests/cloud/test_portrait.py (SC-001, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-012, NFR-001)
- [X] T014 Test decisions, the baseline and drift end to end in tests/cloud/test_decisions.py (SC-002, SC-003, FR-007, FR-008, FR-009, FR-010, FR-011)
