# Tasks: Product Metrics

## Phase 3: User Story 1 - A report I can read the day after launch (Priority: P1)

- [x] T001 [US1] Create the derived views, the exclusion list and the closed access in supabase/migrations/20261019000001_metrics.sql (FR-003, FR-010, FR-011)
- [x] T002 [US1] Calculate the funnel, the time to value, retention and churn in cloud/speco_cloud/metrics_report.py (FR-001, FR-010)
- [x] T003 [US1] Mark ratios under 30 companies and print no data on an empty database in cloud/speco_cloud/metrics_report.py (FR-002)

## Phase 4: User Story 2 - Know where each person came from (Priority: P1)

- [x] T004 [US2] Keep the first channel and door of a person in supabase/migrations/20261019000001_metrics.sql and cloud/speco_cloud/app.py (FR-004)
- [x] T005 [US2] Split the funnel by door and channel in cloud/speco_cloud/metrics_report.py (FR-005)

## Phase 5: User Story 3 - Ask the Sean Ellis question (Priority: P2)

- [x] T006 [US3] Keep one answer per person per quarter in supabase/migrations/20261019000001_metrics.sql and cloud/speco_cloud/app.py (FR-006)
- [x] T007 [US3] Show the share of very disappointed and the verdict only with 30 answers in cloud/speco_cloud/metrics_report.py (FR-007)

## Phase 6: User Story 4 - What it costs to get a company (Priority: P2)

- [x] T008 [US4] Add marketing spend and calculate the cost per activated company in cloud/speco_cloud/metrics_report.py (FR-008)
- [x] T009 [US4] Show lifetime value only as a labelled scenario in cloud/speco_cloud/metrics_report.py (FR-009)

## Phase 7: User Story 5 - The app captures it by itself (Priority: P1)

- [x] T012 [US5] Keep the first channel and door of a link and hand them to the service in web/src/cloud/acquisition.ts, web/src/main.tsx and web/src/cloud/CloudGate.tsx (FR-004, FR-012)
- [x] T013 [US5] Count a referral link as its own channel in web/src/pages/ReferralLanding.tsx (FR-004)
- [x] T014 [US5] Tell when it is time to ask in cloud/speco_cloud/app.py (FR-013)
- [x] T015 [US5] Show the question card and hide it for two weeks on request in web/src/cloud/SurveyPrompt.tsx and web/src/cloud/survey.ts (FR-006, FR-013)
- [x] T016 [US5] Check the whole flow in a real browser against the real service in web/scripts/verify-cloud.mjs (SC-004)

## Phase 8: Polish

- [x] T010 Test every story against a real database in tests/cloud/test_metrics.py (SC-002)
- [x] T011 Write the playbook with definitions, thresholds and how to read the report in docs/27-metrics-playbook.md
