# Tasks: Free plan with credits

## Phase 3: User Story 1 - See a first result at no cost (Priority: P1)

- [x] T001 [US1] Create the credit ledger, its read policy and the grants when a company is created in supabase/migrations/20261018000001_credits.sql (FR-001, FR-012)
- [x] T002 [US1] Keep deterministic reviews, rules, decisions and approvals outside the gate in cloud/speco_cloud/app.py (FR-002)
- [x] T003 [US1] Reserve before and settle after the portrait model run in cloud/speco_cloud/worker.py (FR-004, FR-005)

## Phase 4: User Story 2 - The free plan cannot cost more than we decided (Priority: P1)

- [x] T004 [US2] Write the reserve, settle and release gate with the fixed sizes in cloud/speco_cloud/credits.py (FR-004, FR-005, FR-007, FR-014)
- [x] T005 [US2] Add the daily cap per company and the monthly budget of the free plan in cloud/speco_cloud/credits.py and cloud/speco_cloud/config.py (FR-008, FR-009)
- [x] T006 [US2] Grant the monthly credits and expire the unused ones in cloud/speco_cloud/credits.py (FR-003)

## Phase 5: User Story 3 - I always know what I have and what happens next (Priority: P1)

- [x] T007 [US3] Return the balance, the renewal and the recent uses in cloud/speco_cloud/app.py (FR-011)
- [x] T008 [US3] Show them on the usage page and say what paused at zero in web/src/pages/settings/Usage.tsx and web/src/cloud/credits.ts (FR-006, FR-011)
- [x] T009 [US3] Tell the owner once when the balance is low in cloud/speco_cloud/credits.py (FR-013)

## Phase 5c: User Story 5 - I see my limit coming (Priority: P1)

- [x] T020 [US5] Return the summary of a company to anyone who can ask the assistant and tell how it stands after every answer in cloud/speco_cloud/credits.py and cloud/speco_cloud/app.py (FR-015, FR-016, SC-005)
- [x] T021 [US5] Show the credits in the top bar with a panel that says when they reset in web/src/shell/CreditsPill.tsx, web/src/cloud/creditsStore.ts and web/src/cloud/CreditsMeter.tsx (FR-015)
- [x] T022 [US5] Warn in the chat when the limit is close and say when it is reached in web/src/agent/CreditsBanner.tsx, web/src/assistant/chat.ts and web/src/assistant/sse.ts (FR-016)
- [x] T023 [US5] Record the request to upgrade and show the button only to owners and admins in supabase/migrations/20261018000004_upgrade_interest.sql and web/src/cloud/UpgradeButton.tsx (FR-017)
- [x] T024 [US5] Show the meter, the reset and the upgrade on the usage page in web/src/pages/settings/CloudUsage.tsx (FR-015, FR-017)

## Phase 6: User Story 4 - One person cannot multiply the free plan (Priority: P2)

- [x] T010 [US4] Withhold the free plan from a second company of the same person in supabase/migrations/20261018000001_credits.sql (FR-010)

## Phase 5b: The assistant spends credits (User Story 2 and 3)

- [x] T015 [US2] Serve a conversation turn behind the gate, bounded to 40 000 tokens in, in cloud/speco_cloud/app.py, cloud/speco_cloud/assistant.py and cloud/speco_cloud/portrait/extractors.py (FR-004, FR-005, FR-007, FR-014)
- [x] T016 [US3] Point the chat of the app at the assistant of the company and say a refusal in words in web/src/cloud/assistant.ts, web/src/assistant/chat.ts and web/src/agent/store.ts (FR-006)
- [x] T017 [US2] Release a reservation that a crash left open in supabase/migrations/20261018000003_stale_reservations.sql and cloud/speco_cloud/worker.py (FR-014)

## Phase 7: Verification

- [x] T011 Test the gate: no balance, two requests at once, a failed call, the daily cap and the monthly budget in tests/cloud/test_credits.py (SC-002, SC-003, FR-004, FR-005, FR-008, FR-009, FR-014)
- [x] T012 Test that a company with a balance of zero still completes its deterministic reviews in tests/cloud/test_credits.py (SC-004, FR-002, FR-006)
- [x] T013 Drive a new company to its first portrait with only the welcome credits in a browser in web/scripts/verify-cloud.mjs (SC-001, FR-001)
- [x] T014 Document the amounts, the cost per credit and how to tune them in docs/25-free-plan-credits.md (FR-007)
- [x] T018 Test the turn: charged to its tokens, refused with no credits or over the cap, failing provider, the size of a turn, who may ask, in tests/cloud/test_cloud_assistant.py (FR-004, FR-005, FR-007, FR-008, FR-014, SC-002)
- [x] T019 Drive a turn with credits and a turn without them in a browser in web/scripts/verify-cloud.mjs (FR-005, FR-006)
- [x] T025 Test the summary, the levels, the warning in the stream and the record of the request in tests/cloud/test_cloud_assistant.py (FR-015, FR-016, FR-017, SC-005)
- [x] T026 Drive the indicator, the warning, the limit and the upgrade in a browser in web/scripts/verify-cloud.mjs (FR-015, FR-016, FR-017)
