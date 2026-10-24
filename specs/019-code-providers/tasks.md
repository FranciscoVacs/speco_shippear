# Tasks: Code providers

## Phase 3: User Story 4 - The same product on either provider (Priority: P1)

- [x] T001 [US4] Generalize the tables named after GitHub into connections and repositories with a provider and a status that includes available in supabase/migrations/20261017000001_code_providers.sql (FR-003, FR-011)
- [x] T002 [US4] Move the reads of a code host behind one interface with GitHub as its first implementation in cloud/speco_cloud/providers/github.py (FR-007, FR-011)
- [x] T003 [US4] Make the worker and the portrait read through the interface in cloud/speco_cloud/worker.py (FR-007, FR-011)
- [x] T004 [US4] Test that every existing GitHub behavior is unchanged in tests/cloud/test_providers.py (FR-011)

## Phase 4: User Story 5 - Credentials stay secret (Priority: P1)

- [x] T005 [US5] Store credentials encrypted in a table no signed in person can read in supabase/migrations/20261017000001_code_providers.sql and cloud/speco_cloud/credentials.py (FR-008)
- [x] T006 [US5] Test that no call and no member can read a credential in tests/cloud/test_bitbucket.py (FR-008, SC-002)

## Phase 5: User Story 1 - Connect a Bitbucket Cloud workspace (Priority: P1)

- [x] T007 [US1] Implement the Bitbucket reads and the exchange of the key and secret for accesses in cloud/speco_cloud/providers/bitbucket.py (FR-001, FR-007, FR-012)
- [x] T008 [US1] Connect a workspace, refuse a credential that can write and list its repositories as available in cloud/speco_cloud/app.py (FR-001, FR-002, FR-003)
- [x] T009 [US1] Disconnect a workspace, deleting the credential and the webhook in cloud/speco_cloud/app.py (FR-009)

## Phase 6: User Story 2 - Choose which repositories Speco reads (Priority: P1)

- [x] T010 [US2] Choose and stop choosing repositories in cloud/speco_cloud/app.py (FR-004)
- [x] T011 [US2] Refresh a connection to find new repositories and catch up moved branches in cloud/speco_cloud/app.py (FR-010)

## Phase 7: User Story 3 - Stay current with every push (Priority: P1)

- [x] T012 [US3] Receive signed Bitbucket pushes per connection and queue only chosen repositories in cloud/speco_cloud/webhooks.py and cloud/speco_cloud/app.py (FR-005, FR-006)
- [x] T013 [US3] Test signatures, unchosen repositories and other branches in tests/cloud/test_bitbucket.py (FR-005, FR-006)

## Phase 8: Screens and verification

- [x] T014 [US1] Ask which provider, take the credential and list the repositories with search and selection in web/src/cloud/ConnectCloud.tsx (FR-001, FR-004, SC-001, SC-004)
- [x] T015 [US4] Prove the same files give identical reviews through both providers in tests/cloud/test_bitbucket.py (FR-007, SC-003)
- [x] T016 Drive the connection in a browser in web/scripts/verify-cloud.mjs (SC-001, SC-004)
- [x] T017 Describe how to create the consumer in Bitbucket and what is not verified in docs/23-code-providers.md (FR-001, FR-002)
