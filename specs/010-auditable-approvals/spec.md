# Feature Specification: Auditable Approvals

**Feature Branch**: `010-auditable-approvals`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-4, G-5

**Decisions**: D-001, D-005

**Input**: User description: "The person who approves records a decision from the app or from Slack, and the record cannot be rewritten without anyone noticing"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a decision on a version (Priority: P1)

A founder approves, rejects, approves with conditions or delegates a feature and the decision is tied to the version of the spec that they saw.

**Why this priority**: A decision about a spec that later changes is not a decision about the new spec.

**Independent Test**: Approve a feature, edit its spec and open the feature again.

**Acceptance Scenarios**:

1. **Given** an approver, **When** they record a decision, **Then** the record holds who decided, when, what and the hash of the spec files (FR-001)
2. **Given** a recorded approval, **When** a spec file changes afterwards, **Then** the approval is shown as stale and the changed files are named (FR-002)
3. **Given** a feature with blockers, **When** an approver approves it, **Then** the system refuses unless the approver adds an override with a reason (FR-004)
4. **Given** a person whose role is not approver, **When** they try to decide, **Then** the system refuses (FR-005)

---

### User Story 2 - Trust the record (Priority: P1)

An auditor checks that nobody edited or deleted a past decision.

**Why this priority**: An approval log that can be rewritten silently is not an audit log.

**Independent Test**: Edit one line of the log and run the verification.

**Acceptance Scenarios**:

1. **Given** a log with several entries, **When** one entry is edited or deleted, **Then** the verification reports the first broken entry (FR-003)
2. **Given** a broken log, **When** someone records a new decision, **Then** the system refuses to append (FR-003)

---

### User Story 3 - Decide from Slack (Priority: P2)

An approver answers a digest message in Slack with one click.

**Why this priority**: A busy approver answers a message and does not open a dashboard.

**Independent Test**: Send a signed click from a linked user and from an unknown user.

**Acceptance Scenarios**:

1. **Given** a signed click from a Slack user linked to an approver, **When** it arrives, **Then** the decision is recorded with Slack as the channel (FR-006)
2. **Given** a click with an invalid or old signature, **When** it arrives, **Then** it is rejected and nothing is recorded (FR-006)
3. **Given** a finished Jira sync, **When** a review runs, **Then** it reads the cache file and makes no network call (FR-007)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an approver records a decision, the system MUST store who decided, when, which decision and the hash of the spec files
- **FR-002**: While a spec file differs from the version that was decided on, the system MUST show the decision as stale and name the changed files
- **FR-003**: The system MUST link each record to the previous one so that an edit or a deletion is detected, and MUST refuse to append to a broken log
- **FR-004**: If a feature has blockers, the system MUST refuse to approve it unless the approver gives an override and a reason
- **FR-005**: If the person is not an approver, the system MUST refuse to record a decision
- **FR-006**: When a signed Slack click arrives from a user linked to an approver, the system MUST record the decision, and the system MUST reject a click with an invalid or expired signature
- **FR-007**: When the user asks for a Jira sync, the system MUST write the issues to a cache file, and a review MUST NOT call the network

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested edits or deletions of a past record, the verification names the first broken entry

## Assumptions

- Approvers are a small group that the team lists by hand (source: the pilot teams have fewer than 5 approvers each)
