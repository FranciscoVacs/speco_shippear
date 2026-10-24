# Feature Specification: GitHub Pull Request Review

**Feature Branch**: `026-github-pr-review`

**Created**: 2026-10-21

**Status**: Implemented

**Goals**: G-2, G-7

**Decisions**: D-002, D-012

**Input**: User description: "Like CodeRabbit, but for product: once a repository is connected, every pull request that changes a spec gets a comment that says what changes in the business, without a CI pipeline"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what a pull request changes in the business (Priority: P1)

A product owner opens a pull request that edits a spec and wants to know, without reading the diff, which rules changed, which values moved and what work they touch.

**Why this priority**: This comment is the first result a team sees after connecting a repository, so it decides whether the team keeps the product.

**Independent Test**: Open a pull request that raises a threshold in the sample wire transfer spec and read the comment.

**Acceptance Scenarios**:

1. **Given** a pull request that rewords a requirement, **When** the review runs, **Then** the comment shows the requirement before and after and every number that moved as «old → new» (FR-001, FR-002)
2. **Given** a pull request that adds or removes a requirement, **When** the review runs, **Then** the comment lists it as new or removed (FR-001)
3. **Given** a changed requirement that a task or plan step implements, **When** the review runs, **Then** the comment names that task or step and marks the links inferred from text (FR-003)
4. **Given** a task that still carries a value the pull request changed, **When** the review runs, **Then** the comment warns that the task still says the old value (FR-004)
5. **Given** a pull request that introduces a contradiction, **When** the review runs, **Then** the comment lists it as a new blocker, and blockers already on the base branch are not repeated (FR-005)

---

### User Story 2 - Connect a repository and get the first comment in minutes (Priority: P1)

A team lead wants to try the review on a private repository without setting up a pipeline, an account or a database.

**Why this priority**: The time from installing to the first comment is the time to value of the product.

**Independent Test**: Install the App on a private repository, open a pull request that edits a spec and wait for the comment.

**Acceptance Scenarios**:

1. **Given** the home page of the bot, **When** it opens, **Then** it shows a button that installs the App on GitHub (FR-006)
2. **Given** a finished installation, **When** GitHub returns to the bot, **Then** the page confirms the connection and gives the next step (FR-007)
3. **Given** a pull request event, **When** the bot receives it, **Then** it answers within 10 seconds and reviews after answering (FR-008)
4. **Given** a second push to the same pull request, **When** the review runs again, **Then** the existing comment is edited and no second comment appears (FR-009)
5. **Given** a pull request that changes no spec file, **When** the review runs, **Then** no comment is posted and no file is read (FR-010)
6. **Given** a delivery with a wrong signature, **When** the bot receives it, **Then** it rejects the delivery (FR-011)

---

### User Story 3 - See the same review before opening the pull request (Priority: P2)

A product owner edits a spec locally and wants the same answer the pull request will get, without GitHub.

**Why this priority**: It works offline and lets the person fix the spec before anyone else sees it.

**Independent Test**: Edit a requirement in a git repository and run the diff command against main.

**Acceptance Scenarios**:

1. **Given** uncommitted edits to a spec, **When** the person runs the diff command against a branch, **Then** it prints the same review as the comment, measured from where the branch started (FR-012)
2. **Given** a change that brings a new blocker, **When** the diff command finishes, **Then** it exits with 1, and with 0 otherwise (FR-013)

---

### Edge Cases

- A pull request from a fork: the base repository's installation token reads the head commit.
- A repository with more spec files than the worker limits: the review fails and the error is shown on the home page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a pull request changes a spec, the system MUST list each requirement added, removed or reworded
- **FR-002**: When a reworded requirement contains a number whose value changed, the system MUST show the old and the new value
- **FR-003**: When a changed requirement is linked to a task or plan step, the system MUST name it and mark whether the link is cited or inferred
- **FR-004**: When a linked task or plan step still contains a value the pull request changed, the system MUST warn that it is out of date
- **FR-005**: When the head commit has a blocker that the base commit does not have, the system MUST list it as new, and MUST NOT list blockers already present on the base
- **FR-006**: The home page MUST offer a button that installs the App on GitHub
- **FR-007**: When GitHub returns after an installation, the system MUST confirm the connection without reading any repository, and MUST tell the person to open a pull request that edits a spec
- **FR-008**: When a pull request event arrives, the system MUST answer before reviewing so that GitHub's 10 second limit is never reached
- **FR-009**: The system MUST keep one comment per pull request and edit it on every push
- **FR-010**: When the spec files of the base and head commits are identical, the system MUST NOT post a comment or read any file content
- **FR-011**: The system MUST reject a webhook delivery whose signature does not match the shared secret
- **FR-012**: When the person runs the diff command, the system MUST compare the working tree with the merge base of the given branch and print the comment
- **FR-013**: When the diff finds a new blocker, the command MUST exit with 1

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The comment appears within 30 seconds of opening a pull request on a repository with up to 20 features
- **SC-002**: A person installs the App and sees the first comment within 5 minutes, following docs/32

## Assumptions

- The App has the `pull_requests: write` and `contents: read` permissions and subscribes to the pull request event.
- The bot keeps no state: recent reviews live in memory and are lost on restart.
