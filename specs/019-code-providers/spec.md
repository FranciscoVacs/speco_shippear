# Feature Specification: Code providers

**Feature Branch**: `019-code-providers`

**Created**: 2026-10-16

**Status**: Draft

**Goals**: G-13, G-9, G-8

**Decisions**: D-013, D-008, D-009

**Input**: User description: "The first pilot, an established startup with many repositories, keeps its code in Bitbucket Cloud and uses Jira and Slack; Speco only knows GitHub today, and the product is not launched yet so the data model can change freely"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a Bitbucket Cloud workspace (Priority: P1)

An owner of a company connects the Bitbucket workspace of that company with a read only credential that the workspace admin created, and sees the repositories of the workspace.

**Why this priority**: Without it the first pilot cannot start.

**Independent Test**: Connect a workspace with a valid read only credential and list its repositories.

**Acceptance Scenarios**:

1. **Given** a valid read only credential, **When** an owner connects the workspace, **Then** the repositories of the workspace are listed and none is read yet (FR-001, FR-003)
2. **Given** a credential that can write, **When** an owner connects it, **Then** it is refused and nothing is stored (FR-002)
3. **Given** a signed in person who is not an owner or admin, **When** they try to connect a workspace, **Then** it is refused (FR-001)

---

### User Story 2 - Choose which repositories Speco reads (Priority: P1)

A company with many repositories picks the ones Speco reads, and changes the choice later.

**Why this priority**: Reading every repository costs time and model usage on code nobody asked about, and exposes more code than needed.

**Independent Test**: Connect a workspace with several repositories, choose two and check that only those two are read.

**Acceptance Scenarios**:

1. **Given** a workspace with many repositories, **When** the owner chooses some, **Then** only those are read and get a first review and a proposed portrait (FR-004)
2. **Given** a chosen repository, **When** the owner stops reading it, **Then** it is not read again and its history stays (FR-004)
3. **Given** a repository created after the connection, **When** the owner refreshes the list, **Then** it appears as available (FR-010)

---

### User Story 3 - Stay current with every push (Priority: P1)

When a chosen repository receives a push on its main branch, its reviews and its changes are updated without anybody asking.

**Why this priority**: A portrait that is not kept current is a document, not a guarantee.

**Independent Test**: Send a signed push for a chosen repository and see it queued.

**Acceptance Scenarios**:

1. **Given** a chosen repository, **When** its main branch receives a push, **Then** a review of the new commit is queued (FR-005)
2. **Given** a repository that is not chosen, **When** it receives a push, **Then** nothing is read (FR-005)
3. **Given** a delivery with a wrong signature, **When** it arrives, **Then** it is refused and nothing is stored (FR-006)
4. **Given** the provider answers that too many requests were made, **When** a review runs, **Then** the job is retried later for the same commit and is not lost (FR-012)

---

### User Story 4 - The same product on either provider (Priority: P1)

A company sees the same reviews, rules, baselines and changes whether its code is in GitHub or Bitbucket, and a company can have both.

**Why this priority**: The thesis is about intent, not about where the code lives.

**Independent Test**: Run the same repository content through both providers and compare the reviews.

**Acceptance Scenarios**:

1. **Given** the same files in a GitHub repository and in a Bitbucket repository, **When** both are read, **Then** the reviews are identical (FR-007)
2. **Given** a company already connected to GitHub, **When** this feature ships, **Then** its reviews, portrait and changes keep working (FR-011)

---

### User Story 5 - Credentials stay secret (Priority: P1)

The credential given for a workspace can be used by the service and by nobody else: not shown again, not returned by any call, not readable by any signed in person.

**Why this priority**: It opens the source code of a company.

**Independent Test**: Connect a workspace, then read everything a signed in member can read.

**Acceptance Scenarios**:

1. **Given** a connected workspace, **When** any member reads the connections, **Then** no credential or webhook secret is present (FR-008)
2. **Given** the database content, **When** it is read without the service key, **Then** the credential is not readable (FR-008)
3. **Given** a workspace is disconnected, **When** it finishes, **Then** the credential is gone and its webhook is removed (FR-009)

---

### Edge Cases

- What happens when the provider limits how many requests are allowed?
- What happens when a repository is too large to list?
- What happens when the workspace webhook cannot be created?
- What happens when the credential is revoked in Bitbucket?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an owner or admin gives the slug and a read only credential of a Bitbucket Cloud workspace, the system MUST connect the workspace to their company
- **FR-002**: If the credential can write to repositories, then the system MUST refuse it and MUST NOT store it
- **FR-003**: When a workspace is connected, the system MUST list all its repositories as available and MUST NOT read any of them
- **FR-004**: When an owner or admin chooses or stops choosing repositories, the system MUST read only the chosen ones
- **FR-005**: When a chosen repository receives a push on its main branch, the system MUST queue a review of that commit and MUST ignore pushes to anything else
- **FR-006**: If a delivery from a provider has a wrong signature, then the system MUST refuse it and MUST NOT store it
- **FR-007**: The system MUST produce the same review, portrait and changes for the same files whichever provider holds them
- **FR-008**: The system MUST NOT return a stored credential or webhook secret to any caller and MUST keep them unreadable to every signed in person
- **FR-009**: When a workspace is disconnected, the system MUST delete its credential and remove its webhook
- **FR-010**: When an owner or admin refreshes a connection, the system MUST add the repositories created since and queue the chosen ones whose main branch moved
- **FR-011**: While a company is connected to GitHub, the system MUST keep working for it exactly as before
- **FR-012**: If the provider answers that too many requests were made, then the system MUST retry the job later and MUST NOT lose it

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner connects a workspace and starts reading the first repository in at most 5 minutes
- **SC-002**: 0 credentials or webhook secrets are readable by a signed in person or returned by any call
- **SC-003**: The same set of files gives byte identical reviews through GitHub and through Bitbucket
- **SC-004**: A workspace with 300 repositories is connected with 0 repositories read until the owner chooses

## Assumptions

- The pilot uses Bitbucket Cloud and not Data Center; Data Center needs another interface and is out of scope (source: user)
- A workspace admin creates an OAuth consumer in the workspace with read only access to repositories and, for live updates, the permission to manage webhooks, and shares its key and secret once (source: Bitbucket Cloud documentation)
- Speco exchanges the key and secret for short lived accesses with the client credentials grant, so no long lived access is stored (source: Bitbucket Cloud documentation)
- Bitbucket signs workspace webhooks with the secret we set and sends the signature in a header, as GitHub does (source: Bitbucket Cloud documentation, not yet verified against a real workspace)
- The product has no customers yet, so tables can be renamed and reshaped without keeping the old shape (source: user)
- Jira and Slack of the pilot are out of scope here; the connectors that exist keep working as they do today (source: user)
