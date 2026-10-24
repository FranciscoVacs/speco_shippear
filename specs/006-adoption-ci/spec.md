# Feature Specification: Adoption in CI

**Feature Branch**: `006-adoption-ci`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-2

**Decisions**: D-001, D-005

**Input**: User description: "A team with existing specs turns the review on in its pull requests and hears only about new problems"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review every pull request (Priority: P1)

A tech lead adds the review to the pull requests of the repository and sees the findings in the diff.

**Why this priority**: The review only changes habits if it runs where the team already works.

**Independent Test**: Open a pull request that edits one spec and read the comment and the annotations.

**Acceptance Scenarios**:

1. **Given** a pull request that changes one feature, **When** the review runs, **Then** only that feature is reviewed (FR-001)
2. **Given** a review with findings, **When** it finishes, **Then** the findings appear as annotations in the diff and as one comment that is updated on later runs (FR-002, FR-003)

---

### User Story 2 - Hear only about new problems (Priority: P1)

A team with a backlog of old findings records them once and is told only about new ones.

**Why this priority**: A first run that reports hundreds of old findings gets the tool switched off.

**Independent Test**: Record the findings, edit a spec above an old finding, run again and see no old finding.

**Acceptance Scenarios**:

1. **Given** a recorded set of findings, **When** the review runs again on the same specs, **Then** the recorded findings are not reported (FR-004)
2. **Given** a recorded finding, **When** a line is added above it in the spec, **Then** it is still not reported (FR-005)
3. **Given** a finding the team accepts, **When** an author records it with a reason, **Then** it is silenced and the reason and the author are stored (FR-006)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the review runs with a base reference, the system MUST review only the features that changed against that base
- **FR-002**: When the review runs in the pull request workflow, the system MUST publish its findings as annotations in the diff
- **FR-003**: When the review runs again on the same pull request, the system MUST update its earlier comment instead of adding another
- **FR-004**: When the user records the current findings, the system MUST stop reporting those findings on later runs
- **FR-005**: The system MUST identify a finding by its feature, rule, ids and file and MUST NOT use its line number
- **FR-006**: When the user records a finding with a reason, the system MUST silence it and MUST store the reason, the author and the date
- **FR-007**: If a recorded exception has an expiry date that has passed, the system MUST report the finding again
- **FR-008**: When the user asks to prepare a repository, the system MUST write a configuration file and a workflow and MUST NOT overwrite existing files

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A repository with existing findings gets a first pull request review that reports 0 old findings after the recording step

## Assumptions

- The repository host is GitHub (source: the first three pilot teams)
