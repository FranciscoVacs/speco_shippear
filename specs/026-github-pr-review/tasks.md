# Tasks: GitHub Pull Request Review

## Phase 3: User Story 1 - See what a pull request changes in the business (Priority: P1)

- [X] T001 [US1] Compare requirements between two repository copies and pair the moved values in src/specreview/intent_diff.py (FR-001, FR-002)
- [X] T002 [US1] Name the linked tasks and plan steps and warn when they still carry an old value in src/specreview/intent_diff.py (FR-003, FR-004)
- [X] T003 [US1] List only the blockers the pull request introduces in src/specreview/intent_diff.py (FR-005)
- [X] T004 [US1] Test the comparison on the wire transfer example in tests/test_intent_diff.py (FR-001, FR-002, FR-003, FR-004, FR-005)

## Phase 4: User Story 2 - Connect a repository and get the first comment in minutes (Priority: P1)

- [X] T005 [US2] Read both commits, skip unchanged specs and upsert the comment in cloud/speco_cloud/pr_review.py and cloud/speco_cloud/github_app.py (FR-009, FR-010)
- [X] T006 [US2] Serve the install button, the setup page and the signed webhook in cloud/speco_cloud/prbot.py (FR-006, FR-007, FR-008, FR-011)
- [X] T007 [US2] Test the bot against a fake GitHub in tests/cloud/test_pr_review.py (FR-006, FR-007, FR-008, FR-009, FR-010, FR-011)
- [X] T008 [US2] Write the guide to register the App and run the bot in docs/32-github-pr-review.md (FR-006, FR-007)

## Phase 5: User Story 3 - See the same review before opening the pull request (Priority: P2)

- [X] T009 [US3] Add the diff subcommand that reads the merge base with git in src/specreview/cli_sub.py (FR-012, FR-013)
- [X] T010 [US3] Test the diff command on a git copy of the example in tests/test_intent_diff.py (FR-012, FR-013)
