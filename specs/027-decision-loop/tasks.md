# Tasks: Decision Loop in the Cloud

## Phase 3: User Story 1 - See what waits for my decision, from my own repositories (Priority: P1)

- [X] T001 [US1] Add the snapshot origin and list a company's features and reviews in supabase/migrations/20261024000001_decision_loop.sql and cloud/speco_cloud/decisions.py (FR-001, FR-003)
- [X] T002 [US1] Read the company's features in the web app and show an empty company how to connect in web/src/data.ts and web/src/pages/DecisionsPage.tsx (FR-001, FR-002)

## Phase 4: User Story 2 - Decide and leave a record (Priority: P1)

- [X] T003 [US2] Record decisions through a database function that refuses agents in supabase/migrations/20261024000001_decision_loop.sql (FR-004, FR-007, FR-008, FR-009)
- [X] T004 [US2] Apply the approval policy and serve the log in cloud/speco_cloud/decisions.py and cloud/speco_cloud/app.py (FR-005, FR-006, FR-007, FR-009)
- [X] T005 [US2] Read and write the log from the approval panel in web/src/decision/approvals.ts (FR-004, FR-007, FR-018)
- [X] T006 [US2] Test the decisions on a real database in tests/cloud/test_decision_loop.py (FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009)

## Phase 5: User Story 3 - The pull request leads to the decision and hears about it (Priority: P1)

- [X] T007 [US3] Keep the version a pull request proposes and render the status block in src/specreview/intent_diff.py and cloud/speco_cloud/bridge.py (FR-010, FR-011)
- [X] T008 [US3] Publish the check and rewrite it when a person decides in cloud/speco_cloud/bridge.py and cloud/speco_cloud/github_app.py (FR-012, FR-013, FR-014, FR-015, FR-016)
- [X] T009 [US3] Open the company a link names in web/src/cloud/orgs.ts and web/src/cloud/CloudGate.tsx (FR-017, FR-019)
- [X] T010 [US3] Test the bridge against a fake GitHub in tests/cloud/test_decision_bridge.py (FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016)

## Phase 6: Verification

- [X] T011 Drive the loop in a real browser against the real service in web/scripts/verify-cloud.mjs (SC-001, SC-002, SC-003)
