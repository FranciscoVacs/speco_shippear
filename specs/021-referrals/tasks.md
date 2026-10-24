# Tasks: Referrals

## Phase 3: User Story 1 - Share my link (Priority: P1)

- [x] T001 [US1] Create the code and the referral tables in supabase/migrations/20261018000002_referrals.sql (FR-001)
- [x] T002 [US1] Show the link and the ready message on the usage page in web/src/pages/settings/Usage.tsx (FR-001)
- [x] T003 [US1] Show the invitation on the public page without naming anyone in web/src/cloud/referral.ts (FR-002)

## Phase 4: User Story 2 - The invitation survives the sign-up (Priority: P1)

- [x] T004 [US2] Keep the code for 30 days through the sign-up in web/src/cloud/referral.ts (FR-003)
- [x] T005 [US2] Record a pending referral for a new account and none for an existing one in cloud/speco_cloud/referrals.py (FR-003, FR-004)

## Phase 5: User Story 3 - Both are thanked when the invited person gets a result (Priority: P1)

- [x] T006 [US3] Grant the credits once at the first portrait or first review in cloud/speco_cloud/referrals.py and cloud/speco_cloud/worker.py (FR-005, FR-006)
- [x] T007 [US3] Notify the person who invited in cloud/speco_cloud/referrals.py (FR-012)
- [x] T008 [US3] Hold a reward until the person who invited owns a company in cloud/speco_cloud/referrals.py (FR-013)

## Phase 6: User Story 4 - Cheating does not pay (Priority: P1)

- [x] T009 [US4] Refuse a referral of yourself or of a shared phone in cloud/speco_cloud/referrals.py (FR-007)
- [x] T010 [US4] Apply the monthly cap of the person who invited and still reward the invited company in cloud/speco_cloud/referrals.py (FR-008)
- [x] T011 [US4] Bind earned credits to the company, forbid transfer and expire them in six months in supabase/migrations/20261018000002_referrals.sql (FR-009)
- [x] T012 [US4] Add the owner switch in cloud/speco_cloud/config.py (FR-011)

## Phase 7: User Story 5 - I see what my referrals did (Priority: P2)

- [x] T013 [US5] Return the counts, the credits earned and the monthly limit left without names in cloud/speco_cloud/app.py (FR-010)

## Phase 8: Verification

- [x] T014 Test the reward once, the cap, the self-referral, the switch and the reward from the worker in tests/cloud/test_referrals.py (SC-001, SC-002, SC-003, FR-005, FR-006, FR-007, FR-008, FR-011)
- [x] T015 Drive the link, the sign-up and the counts in a browser in web/scripts/verify-cloud.mjs (SC-004, FR-002, FR-003)
- [x] T016 Document the amounts, the caps and how to tune them in docs/26-referrals.md (FR-009)
