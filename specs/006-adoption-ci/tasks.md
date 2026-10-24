# Tasks: Adoption in CI

## Phase 3: User Story 1 - Review every pull request (Priority: P1)

- [X] T001 [US1] Review only the features that changed against a base reference in src/specreview/gitdiff.py (FR-001)
- [X] T002 [US1] Write the findings as SARIF so they appear as annotations in the diff in src/specreview/sarif.py (FR-002)
- [X] T003 [US1] Publish the SARIF file and update a single marked comment in action.yml (FR-002, FR-003)

## Phase 4: User Story 2 - Hear only about new problems (Priority: P1)

- [X] T004 [US2] Record the current findings by a fingerprint without the line number in src/specreview/suppress.py (FR-004, FR-005)
- [X] T005 [US2] Record a finding with a reason, an author and an expiry date in src/specreview/suppress.py (FR-006, FR-007)
- [X] T006 [US2] Write the configuration and the workflow without overwriting existing files in src/specreview/cli_sub.py (FR-008)
