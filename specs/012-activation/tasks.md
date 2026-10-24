# Tasks: Activation in Five Minutes

## Phase 3: User Story 1 - Understand it by doing it (Priority: P1)

- [X] T001 [US1] Add a checklist with four milestones that replaces the introduction on the first sign in in web/src/activation/Checklist.tsx (FR-001, NFR-003)
- [X] T002 [US1] Mark each milestone as done from events the product already emits in web/src/activation/milestones.ts (FR-002)
- [X] T003 [US1] Use the labelled demo feature 003-team-invitations, which has a rule contradiction, as the sample in web/src/activation/milestones.ts (FR-003)
- [X] T004 [US1] Reopen the checklist and show its progress from the help menu in web/src/shell/HelpMenu.tsx (FR-004, NFR-002)

## Phase 4: User Story 2 - Try it with my own idea (Priority: P1)

- [X] T005 [US2] Add an agent tool that drafts a spec from a business need and lists its open questions as decisions in web/src/agent/demo/tools.ts (FR-005, FR-006)
- [X] T006 [US2] Offer a spec template with its questions when no model is configured in web/src/agent/demo/tools.ts (FR-007)

## Phase 5: User Story 3 - Connect my repository (Priority: P2)

- [X] T007 [US3] Add a three step flow that picks a repository and shows the first executive summary in web/src/pages/ConnectRepo.tsx (FR-008)
- [X] T008 [US3] Offer to start from a business need when the repository has no specs in web/src/pages/ConnectRepo.tsx (FR-009)

## Phase 6: User Story 4 - One language across the product (Priority: P2)

- [X] T009 [US4] Say decision and intent in the pages for people who approve in web/src/i18n/es.ts and web/src/i18n/en.ts (FR-010, NFR-001)
- [X] T010 [US4] Say what is decided and what is next in every empty state in web/src/i18n/es.ts and web/src/i18n/en.ts (FR-011)
- [X] T011 [US4] Rewrite the weekly digest with the decisions waiting, the features ready and the decisions recorded in src/specreview/slack.py (FR-012)

## Phase 7: Verification

- [X] T012 Check the first sign in, the checklist and the five minute path in web/scripts/verify-activation.mjs (SC-001, SC-002, SC-003)
