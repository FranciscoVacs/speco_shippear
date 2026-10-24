# Tasks: Value Delivered

## Phase 3: User Story 1 - See what the reviews caught (Priority: P1)

- [x] T001 [US1] Derive resolved and open findings from the reviews, and the first review of each feature, in supabase/migrations/20261020000001_value_delivered.sql (FR-001, FR-002, FR-007, FR-009)
- [x] T002 [US1] Count resolved blockers and warnings, protected decisions and contradictions in cloud/speco_cloud/metrics_report.py (FR-001, FR-002)

## Phase 4: User Story 2 - The client says what would have shipped (Priority: P1)

- [x] T003 [US2] Keep one answer per finding, closed to people, in supabase/migrations/20261020000001_value_delivered.sql (FR-004, FR-007)
- [x] T004 [US2] List the pending questions and take the answer in cloud/speco_cloud/app.py (FR-003, FR-004)

## Phase 5: User Story 3 - An estimate of hours that is never presented as a fact (Priority: P2)

- [x] T005 [US3] Weigh the answers and show the hours range with its assumptions in cloud/speco_cloud/metrics_report.py (FR-005, FR-006)
- [x] T006 [US3] Print the value section alone for one company in cloud/speco_cloud/metrics_report.py (FR-008)

## Phase 6: User Story 4 - Are the specs getting better? (Priority: P3)

- [x] T007 [US4] Show the trend of blockers in the first review per month in cloud/speco_cloud/metrics_report.py (FR-009)

## Phase 7: User Story 5 - Asked without being bothered (Priority: P1)

- [x] T010 [US5] Keep the quiet period and fetch the next pending finding in web/src/cloud/outcomes.ts (FR-010)
- [x] T011 [US5] Show the one line card with three answers and mount it in web/src/cloud/ValueCheck.tsx, web/src/shell/Shell.tsx and web/src/shell/shell.css (FR-010)
- [x] T012 [US5] Check the card in a real browser in web/scripts/verify-cloud.mjs (FR-010)

## Phase 8: Polish

- [x] T008 Test every story against a real database in tests/cloud/test_metrics.py (SC-001, SC-002, SC-003)
- [x] T009 Write the definition and its limits in docs/27-metrics-playbook.md
