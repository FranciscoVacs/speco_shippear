# Tasks: Decided numbers reach product

## Phase 3: User Story 1 - A decision states the numbers it fixes (Priority: P1)

- [X] T001 [US1] Read the Fixes field and add the product rule in src/specreview/product.py (FR-001, FR-002)
- [X] T002 [US1] State the referral numbers in D-015 in product/decisions.md (FR-001, SC-001)
- [X] T003 [US1] Test a matching and a disagreeing decision in tests/test_decided_numbers.py (FR-001, FR-002, SC-001)

## Phase 4: User Story 2 - A moved number says which decision it reopens (Priority: P1)

- [X] T004 [US2] Name the decision in the drift reason and in the touched items in src/specreview/ledger.py (FR-003, FR-004)
- [X] T005 [US2] Test the reason and the change in tests/test_decided_numbers.py (FR-003, FR-004)

## Phase 5: User Story 3 - A pull request that moves a decided number waits for a person (Priority: P1)

- [X] T006 [US3] Make the features with moved numbers wait and store the numbers in the version in cloud/speco_cloud/bridge.py (FR-005, FR-006)
- [X] T007 [US3] Show the numbers of the version on the review page in web/src/pages/ReviewPage.tsx (FR-006)
- [X] T008 [US3] Test the pending check with a real database and a fake GitHub in tests/cloud/test_decision_bridge.py (FR-005, FR-006, SC-002)
