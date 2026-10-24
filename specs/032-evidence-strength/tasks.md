# Tasks: Evidence strength

## Phase 3: User Story 1 - A green run stops counting when its test is edited (Priority: P1)

- [X] T001 [US1] Fingerprint cited tests in src/specreview/strength.py and record them in runs in src/specreview/ledger.py and src/specreview/evidence.py (FR-001)
- [X] T002 [US1] Treat a run as stale when a fingerprint changed or is missing, keep runs without fingerprints, and name the changed tests in src/specreview/ledger.py (FR-002, FR-003, FR-004, FR-005)
- [X] T003 [US1] Test fingerprints, edits, new tests and old runs in tests/test_strength.py (FR-001, FR-002, FR-003, FR-004, FR-005, SC-001, SC-002)

## Phase 4: User Story 2 - The review of a change flags edited tests (Priority: P1)

- [X] T004 [US2] List rules whose citing tests changed against the base in src/specreview/strength.py and render them in src/specreview/intent_diff.py and src/specreview/cli_sub.py (FR-006)
- [X] T005 [US2] Test the edited-test section of the review in tests/test_strength.py (FR-006)
- [X] T010 [US2] Read edited tests only on opt-in and render them in the GitHub comment in cloud/speco_cloud/pr_review.py (FR-011, FR-012)
- [X] T011 [US2] Test the opt-in and the absence of test reads in tests/cloud/test_pr_review.py (FR-011, FR-012)

## Phase 5: User Story 3 - The ledger says how strong the evidence is (Priority: P2)

- [X] T006 [US3] Label evidence as examples or generated cases in src/specreview/ledger.py and show it in the text output (FR-007, FR-008)
- [X] T007 [US3] Test the labels in tests/test_strength.py (FR-007, FR-008)

## Phase 6: User Story 4 - How many rules could be verified more strongly (Priority: P2)

- [X] T008 [US4] Classify rule shapes and print them with `ledger --shape` in src/specreview/strength.py and src/specreview/cli_sub.py (FR-009, FR-010)
- [X] T009 [US4] Test the classification and the printed counts in tests/test_strength.py (FR-009, FR-010)
