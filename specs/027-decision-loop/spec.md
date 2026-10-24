# Feature Specification: Decision Loop in the Cloud

**Feature Branch**: `027-decision-loop`

**Created**: 2026-10-24

**Status**: Implemented

**Goals**: G-2, G-7

**Decisions**: D-002, D-012

**Input**: User description: "A pull request that changes a spec must lead the person who decides to the app, the decision must be recorded in the company's own log, and the pull request must hear about it. Today the cloud app shows demo samples instead of the company's features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what waits for my decision, from my own repositories (Priority: P1)

A person who approves opens the app and sees the features of the repositories their company chose to connect, with the verdict of each, instead of sample data.

**Why this priority**: Without it every other step of the loop shows invented data to a real company.

**Independent Test**: Connect a repository with one spec and open the decisions page as a member of that company and as a member of another.

**Acceptance Scenarios**:

1. **Given** a company that read a repository with specs, **When** a member opens the decisions page, **Then** it lists those features with their verdicts and none of the sample features (FR-001)
2. **Given** a company that read nothing yet, **When** a member opens the decisions page, **Then** it says nothing was read and offers to connect a repository (FR-002)
3. **Given** a member of another company, **When** they ask for the same features, **Then** they receive none of them (FR-003)

---

### User Story 2 - Decide and leave a record (Priority: P1)

An approver approves, approves with conditions, rejects or delegates one version of a feature, and the decision stays in an append-only log that shows who decided what and on which version.

**Why this priority**: A decision that lives in the browser is not a decision the company can audit.

**Independent Test**: Approve as an approver, reload the page, then try the same as a viewer.

**Acceptance Scenarios**:

1. **Given** an approver and a feature, **When** they reject it with a reason, **Then** the decision is in the log after a reload and nothing about it is kept in the browser (FR-004, FR-005)
2. **Given** a feature with blockers, **When** an approver approves it without an override and a reason, **Then** the decision is refused (FR-006)
3. **Given** a viewer, **When** they open the same feature, **Then** they see the decision and are not offered the buttons, and the service refuses their attempt (FR-007, FR-018)
4. **Given** an access token issued to an AI agent, **When** it tries to decide, **Then** the database refuses it (FR-008)
5. **Given** a spec that changed after the approver opened it, **When** they decide, **Then** nothing is recorded and they are told to reload (FR-009)

---

### User Story 3 - The pull request leads to the decision and hears about it (Priority: P1)

When a pull request changes a spec of a connected repository, its comment links to deciding that version in the app and the pull request carries a check that stays pending until a person decides.

**Why this priority**: The person who decides works in the app, the change happens on GitHub, and without this bridge nothing brings them together.

**Independent Test**: Open a pull request that moves a threshold, decide its version in the app and watch the check and the comment.

**Acceptance Scenarios**:

1. **Given** a pull request that changes a feature waiting for a decision, **When** the review runs, **Then** the comment links to deciding that version and a check named «Speco · decisión» is pending (FR-010, FR-011)
2. **Given** that pull request, **When** an approver approves the version it proposes, **Then** the check succeeds and the comment says it was decided (FR-012)
3. **Given** that pull request, **When** an approver rejects the version, **Then** the check fails (FR-012)
4. **Given** a new push to the pull request, **When** the review runs again, **Then** the new version has its own pending check and the earlier decision does not count (FR-013)
5. **Given** a pull request of a repository the company does not read, **When** the review runs, **Then** it receives the comment and no check (FR-014)
6. **Given** a public pull request, **When** a person decides, **Then** neither the comment nor the check names them or repeats their reason (FR-015)
7. **Given** an App without the permission to write checks, **When** the review runs, **Then** the comment still arrives (FR-016)
8. **Given** a link that names a company, **When** a member of that company opens it, **Then** the app opens that company, and a link that names another company is ignored (FR-017, FR-019)

---

### Edge Cases

- What happens when a pull request adds a feature that does not exist on the main branch yet?
- How does the app list a version that a pull request proposes before it is merged?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a member opens the decisions page, the system MUST list the features of the repositories their company reads, with the verdict of each latest version
- **FR-002**: When the company has read no spec, the system MUST say so and offer to connect a repository instead of showing sample data
- **FR-003**: The system MUST NOT show or accept a feature of one company to a member of another
- **FR-004**: When an owner, an admin or an approver decides a version of a feature, the system MUST append the decision to the company's log with who decided, when and on which version
- **FR-005**: While the log is the record of decisions, the system MUST keep it append-only and verifiable by a hash chain
- **FR-006**: If a feature has blockers, then the system MUST refuse an approval that carries no override and no reason
- **FR-007**: If the person is not an owner, an admin or an approver, then the system MUST refuse the decision
- **FR-018**: If the person is not an owner, an admin or an approver, then the app MUST hide the buttons that decide
- **FR-008**: If the access token was issued to an AI agent, then the system MUST refuse any decision
- **FR-009**: If the files of the version changed since the person opened it, then the system MUST record nothing
- **FR-010**: When a pull request changes a spec of a repository the company reads, the system MUST keep the version it proposes and link the comment to deciding it
- **FR-011**: While a version proposed by a pull request waits for a decision, the system MUST show a check named «Speco · decisión» as action required
- **FR-012**: When a person decides a version a pull request proposes, the system MUST update the check and the comment to the outcome: success when approved and failure when rejected
- **FR-013**: When a pull request receives a new push, the system MUST open a new pending check for the new version
- **FR-014**: If the company does not read the repository of a pull request, then the system MUST post the comment and no check
- **FR-015**: The system MUST NOT name the person or repeat their reason in a comment or a check
- **FR-016**: If GitHub refuses the check, then the system MUST still post the comment
- **FR-017**: When a link names a company the person belongs to, the system MUST open that company
- **FR-019**: If a link names a company the person does not belong to, then the system MUST ignore it

### Key Entities

- **Approval**: one decision on one version of a feature, chained to the previous one by hash
- **Pull review**: the versions a pull request proposes and the check and comment that report them

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member of a company that read a repository sees only that repository's features on the decisions page in 100 % of the checks
- **SC-002**: A decision recorded in the app reaches the pull request's check within 5 seconds in the browser check
- **SC-003**: 0 decisions are recorded from a viewer or an agent token

## Assumptions

- The check can only block a merge if the repository requires it; Speco reports and never merges (source: D-012)
- The App needs the permission to write checks, which each installation accepts once (source: GitHub App settings)
