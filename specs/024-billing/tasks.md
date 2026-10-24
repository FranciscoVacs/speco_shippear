# Tasks: Billing and plan upgrades

## Phase 3: User Story 1 - Upgrade and get more room (Priority: P1)

- [x] T001 [US1] Create the plan catalog, the subscriptions, the invoices and their read policies in supabase/migrations/20261020000001_billing.sql (FR-001, FR-013)
- [x] T002 [US1] Change the plan, open the period, write the invoice and grant the credits in one function in supabase/migrations/20261020000001_billing.sql (FR-002, FR-004)
- [x] T003 [US1] Meter paid companies with the daily cap of their plan and without the monthly budget of the free plan in supabase/migrations/20261020000001_billing.sql and cloud/speco_cloud/credits.py (FR-005)
- [x] T004 [US1] Offer the plans and charge before changing them in cloud/speco_cloud/billing.py and cloud/speco_cloud/app.py (FR-001, FR-002, FR-004, FR-010)

## Phase 4: User Story 2 - A declined payment changes nothing (Priority: P1)

- [x] T005 [US2] Record a declined attempt and change nothing else in supabase/migrations/20261020000001_billing.sql and cloud/speco_cloud/billing.py (FR-003)
- [x] T006 [US2] Charge and grant once for the same request in supabase/migrations/20261020000001_billing.sql and cloud/speco_cloud/billing.py (FR-014)

## Phase 5: User Story 3 - Renew, downgrade and cancel without surprises (Priority: P1)

- [x] T007 [US3] Schedule a lower plan or a cancellation and undo it in supabase/migrations/20261020000001_billing.sql and cloud/speco_cloud/billing.py (FR-007)
- [x] T008 [US3] Renew what is due, retry a declined renewal and end a lapsed plan from the worker in cloud/speco_cloud/billing.py and cloud/speco_cloud/worker.py (FR-006, FR-008)
- [x] T009 [US3] Keep a company that was paid before billing working in supabase/migrations/20261020000001_billing.sql (FR-015)

## Phase 6: User Story 4 - See what I pay and what I paid (Priority: P2)

- [x] T010 [US4] Show the plan, the renewal, what is scheduled and the invoices to owners and admins in cloud/speco_cloud/app.py and web/src/pages/settings/Billing.tsx (FR-009, FR-013)
- [x] T011 [US4] Say that the payment is simulated wherever money is shown and mark every invoice in web/src/pages/settings/Billing.tsx and cloud/speco_cloud/billing.py (FR-012)
- [x] T012 [US4] Keep billing off until the operator turns it on in cloud/speco_cloud/config.py and cloud/speco_cloud/billing.py (FR-011)

## Phase 7: User Story 5 - The limit leads to the upgrade (Priority: P1)

- [x] T013 [US5] Take the upgrade button to the plans and show the end of the period as the renewal in web/src/cloud/UpgradeButton.tsx, web/src/cloud/creditsStore.ts and cloud/speco_cloud/credits.py (FR-016)
- [x] T014 [US5] Add the billing page, its route and its entry in the settings in web/src/pages/settings/Billing.tsx, web/src/router.tsx and web/src/shell/Sidebar.tsx (FR-001, FR-016)

## Phase 8: Verification

- [x] T015 Test the upgrade, the proration, the declined payment, the repeated request, who may change the plan, the renewals, the cancellation and the grace in tests/cloud/test_billing.py (SC-002, SC-003, SC-004, FR-002, FR-003, FR-004, FR-006, FR-007, FR-008, FR-013, FR-014, FR-015)
- [x] T016 Update the tests of spec 020 that said a paid company is not metered in tests/cloud/test_credits.py and tests/cloud/test_cloud_assistant.py (FR-005)
- [x] T017 Drive the upgrade, a declined card, the invoices and a cancellation in a browser in web/scripts/verify-cloud.mjs (SC-001, FR-003, FR-007, FR-009, FR-012, FR-016)
- [x] T018 Document the plans, the switch, the provider interface and how to go real in docs/30-billing.md (FR-010, FR-011)
