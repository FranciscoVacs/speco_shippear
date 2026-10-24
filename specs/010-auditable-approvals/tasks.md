# Tasks: Auditable Approvals

## Phase 3: User Story 1 - Record a decision on a version (Priority: P1)

- [X] T001 [US1] Store who decided, when, what and the hash of the spec files in src/specreview/approvals.py (FR-001)
- [X] T002 [US1] Show a decision as stale and name the changed files in src/specreview/approvals.py (FR-002)
- [X] T003 [US1] Refuse an approval with blockers unless there is an override and a reason in src/specreview/approvals.py (FR-004)
- [X] T004 [US1] Refuse a decision from a person who is not an approver in src/specreview/members.py (FR-005)

## Phase 4: User Story 2 - Trust the record (Priority: P1)

- [X] T005 [US2] Link each record to the previous one, verify the chain and refuse to append to a broken log in src/specreview/approvals.py (FR-003)

## Phase 5: User Story 3 - Decide from Slack (Priority: P2)

- [X] T006 [US3] Verify the signature and the age of a Slack click and record the decision in src/specreview/slack.py (FR-006)
- [X] T007 [US3] Write the Jira issues to a cache file that reviews read without the network in src/specreview/jira.py (FR-007)
