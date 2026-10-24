# Tasks: Verified Phone

## Phase 3: User Story 1 - Sign up with my phone (Priority: P1)

- [ ] T001 [US1] Ask for the number and the code and sign in in web/src/cloud/auth.ts and web/src/cloud/SignInCloud.tsx (FR-001, FR-002, FR-003)

## Phase 4: User Story 2 - Every account has a verified phone (Priority: P1)

- [ ] T002 [US2] Ask for a verified phone before showing anything else in web/src/cloud/PhoneGate.tsx and web/src/cloud/CloudGate.tsx (FR-004)
- [ ] T003 [US2] Refuse any access with no verified phone in cloud/speco_cloud/auth.py and cloud/speco_cloud/config.py (FR-005, SC-002)
- [ ] T004 [US2] Refuse a phone already verified by another account and show it in plain words in web/src/cloud/PhoneGate.tsx (FR-006)

## Phase 5: User Story 3 - Abuse of the SMS cannot cost us money (Priority: P1)

- [ ] T005 [US3] Set the rate limit, the human check and the daily budget in the sign-in project and document them in docs/21-verified-phone.md (FR-007, FR-008, FR-009, SC-003)

## Phase 6: User Story 4 - We can test it without sending SMS (Priority: P2)

- [ ] T006 [US4] Declare test numbers and sign up with them in web/scripts/verify-cloud.mjs (FR-010)

## Phase 7: Verification

- [ ] T007 Test that the service refuses an access with no verified phone in tests/cloud/test_service.py (SC-002, FR-005)
- [ ] T008 Drive the sign-up and the gate in a browser with a test number in web/scripts/verify-cloud.mjs (SC-001, FR-001, FR-002, FR-003, FR-004)
