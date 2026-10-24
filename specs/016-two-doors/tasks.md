# Tasks: Two Doors

## Phase 3: User Story 1 - Pick the door in plain words (Priority: P1)

- [X] T001 [US1] Add the welcome screen with the plain question and the switch between doors in web/src/pages/Welcome.tsx (FR-001, FR-002)

## Phase 4: User Story 2 - A company with software sees what it does today (Priority: P1)

- [X] T002 [US2] Lead the first door through the GitHub connection and the portrait in web/src/pages/Welcome.tsx (FR-003)

## Phase 5: User Story 3 - A person with an idea and no code decides before building (Priority: P1)

- [X] T003 [US3] Let a feature and its versions exist without a repository in supabase/migrations/20261024000002_ideas.sql, as a table of ideas that needs no repository (FR-005)
- [X] T004 [US3] Ask the open questions one at a time and keep the unanswered ones as risks in cloud/speco_cloud/interview.py, cloud/speco_cloud/ideas.py and web/src/pages/Idea.tsx (FR-004, FR-007)
- [X] T005 [US3] Save the decisions as a spec and give the brief in cloud/speco_cloud/interview.py (FR-005, FR-006)

## Phase 6: User Story 4 - What they built is compared with what they decided (Priority: P2)

- [ ] T006 [US4] Match each proposed rule with the saved decisions and list what is missing in cloud/speco_cloud/portrait/compare.py (FR-008, FR-009)

## Phase 7: User Story 5 - The second door speaks without jargon (Priority: P1)

- [X] T007 [US5] Write the second door in plain words and check it for technical words in web/src/i18n/es.ts and web/scripts/verify-two-doors.mjs (FR-010, SC-003)

## Phase 8: Verification

- [X] T008 Test the interview, the spec without a repository and the comparison in tests/cloud/test_ideas.py (SC-001, FR-005; the comparison of FR-008 and FR-009 is not built)
- [X] T009 Drive both doors in a browser as someone with no technical knowledge in web/scripts/verify-cloud.mjs (SC-001, SC-003)
