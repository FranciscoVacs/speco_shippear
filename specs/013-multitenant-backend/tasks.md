# Tasks: Multi-tenant Backend

## Phase 3: User Story 1 - My company's data is mine alone (Priority: P1)

- [X] T001 [US1] Add companies, memberships, roles, the creation function and the owner guards in supabase/migrations/20261015000001_tenancy.sql (FR-001, FR-007)
- [X] T002 [US1] Add row level security on every company table in supabase/migrations/20261015000001_tenancy.sql (FR-002, NFR-001)

## Phase 4: User Story 2 - Only the right people decide, and history cannot be rewritten (Priority: P1)

- [X] T003 [US2] Add the decisions table with the role policy and the reason rules in supabase/migrations/20261015000003_approvals.sql (FR-003, FR-006)
- [X] T004 [US2] Chain each decision by hash and refuse edits and deletions in supabase/migrations/20261015000003_approvals.sql (FR-004, FR-005)
- [X] T005 [US2] Add the chain verification function in supabase/migrations/20261015000003_approvals.sql (FR-008)

## Phase 5: User Story 3 - What GitHub gives us stays inside one company (Priority: P2)

- [X] T006 [US3] Add installations, repositories, features, spec versions and reviews with company-scoped foreign keys in supabase/migrations/20261015000002_github_and_reviews.sql (FR-009)
- [X] T007 [US3] Add the idempotent webhook events table with no policy for people in supabase/migrations/20261015000002_github_and_reviews.sql (FR-010, FR-011)

## Phase 6: User Story 4 - Connect GitHub without handing over the keys (Priority: P1)

- [X] T010 [US4] Verify GitHub's signature and store each delivery once, reprocessing a failed one, in cloud/speco_cloud/webhooks.py and cloud/speco_cloud/app.py (FR-010, FR-014)
- [X] T011 [US4] Add the signed install state and the setup callback that links one installation to one company in cloud/speco_cloud/state.py and cloud/speco_cloud/app.py (FR-012, FR-013)
- [X] T012 [US4] Call GitHub as the App with short-lived tokens in cloud/speco_cloud/github_app.py (FR-012)
- [X] T013 [US4] Keep installations and repositories in sync and queue one job per repository on spec changes in cloud/speco_cloud/webhooks.py and supabase/migrations/20261015000004_jobs.sql (FR-015)
- [X] T014 [US4] Verify Supabase tokens and open each request as that person in cloud/speco_cloud/auth.py and cloud/speco_cloud/db.py (FR-016, NFR-002)

## Phase 7: User Story 5 - Reviews appear on their own (Priority: P1)

- [X] T016 [US5] Read only the permitted spec files of a commit within fixed limits in cloud/speco_cloud/worker.py and cloud/speco_cloud/github_app.py (FR-019)
- [X] T017 [US5] Run the review engine as a library and store each feature version and its review once in cloud/speco_cloud/worker.py (FR-017, FR-018, SC-004)
- [X] T018 [US5] Retry failed jobs with growing delays and stop after five attempts in cloud/speco_cloud/worker.py (FR-020)

## Phase 8: Verification

- [X] T008 Add a throwaway Postgres harness with the Supabase roles stubbed in tests/cloud/cluster_fixture.py and tests/cloud/supabase_stub.sql (NFR-001)
- [X] T009 Test isolation per table, roles, owners, the chain, tampering and webhooks in tests/cloud/test_tenancy.py (SC-001, SC-002)
- [X] T019 Test the worker end to end, its limits, idempotence, retries and isolation in tests/cloud/test_worker.py (SC-004, FR-017, FR-018, FR-019, FR-020)
- [X] T015 Test the install round trip, webhooks, retries, the API and least privilege in tests/cloud/test_service.py (SC-003, NFR-002)
