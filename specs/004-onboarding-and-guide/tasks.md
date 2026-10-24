# Tasks: Onboarding and Product Guide

**Input**: Design documents from `/specs/004-onboarding-and-guide/`

## Phase 1: Setup

- [X] T001 Write the product guide text in docs/07-product-guide.md (FR-005)

## Phase 2: Foundational

- [X] T002 Write the rule catalog with what, why, fix and examples in src/specreview/rules.py (FR-004, FR-006)
- [X] T003 [P] Serve the catalog and embed it in the exported page in src/specreview/server.py and src/specreview/export.py (FR-006)
- [X] T004 [P] Test that every emitted rule has a catalog entry in tests/test_rules.py (SC-002)

## Phase 3: User Story 1 - Understand the product on the first visit (Priority: P1)

- [X] T005 [US1] Build the four-step introduction dialog in web/src/Onboarding.tsx (FR-001, FR-010)
- [X] T006 [US1] Remember the dismissal in storage and reopen the introduction from the help button in web/src/App.tsx (FR-002, FR-003)
- [X] T007 [US1] Keep working and show the introduction on every visit when storage is blocked in web/src/Onboarding.tsx (FR-009, FR-011)

## Phase 4: User Story 2 - Understand a finding where it appears (Priority: P1)

- [X] T008 [US2] Show the rule explanation inside the expanded finding in web/src/FindingRow.tsx (FR-004)
- [X] T009 [US2] Open the guide at a rule from its explanation in web/src/App.tsx (FR-006)

## Phase 5: User Story 3 - Read the full product guide (Priority: P2)

- [X] T010 [US3] Build the guide page from the product guide text in web/src/Guide.tsx (FR-005)
- [X] T011 [US3] Add the searchable rule glossary with examples in web/src/Guide.tsx (FR-006)

## Phase 6: User Story 4 - Get unstuck when there is nothing to show (Priority: P2)

- [X] T012 [US4] Show the sample data banner with the command for the user's repository in web/src/App.tsx (FR-007)
- [X] T013 [US4] Replace load errors with the commands that start the review in web/src/App.tsx (FR-008)

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T014 Check that a user reaches a finding's source line in at most 2 clicks after the introduction (SC-001)
- [X] T015 Check in the browser that every rule of the catalog appears in the guide (SC-002)
