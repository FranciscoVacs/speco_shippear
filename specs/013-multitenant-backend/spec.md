# Feature Specification: Multi-tenant Backend

**Feature Branch**: `013-multitenant-backend`

**Created**: 2026-10-15

**Status**: In progress (data layer, GitHub connection and review worker done; invitations pending)

**Goals**: G-8, G-5

**Decisions**: D-008, D-005

**Input**: User description: "Start building the multi-tenant backend on Postgres with Supabase, so many companies can connect their GitHub repositories and review specs without ever seeing each other's data"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My company's data is mine alone (Priority: P1)

A founder signs up, creates their company and connects their repositories. Another company does the same on the same service. Neither can see, change or point at the other's data, even if the application has a bug.

**Why this priority**: One leak between companies ends the product's credibility; everything else builds on this.

**Independent Test**: Create two companies with the same shape of data and try to read, write and link across them as each person and as an anonymous visitor.

**Acceptance Scenarios**:

1. **Given** a signed-in person who creates a company, **When** it is created, **Then** they are its owner (FR-001)
2. **Given** two companies, **When** a member of one reads any table, **Then** they get no row of the other (FR-002, NFR-001)
3. **Given** an anonymous visitor, **When** they read any table, **Then** they get nothing (FR-002)
4. **Given** a company with one owner, **When** that owner tries to leave or step down, **Then** the change is refused (FR-007)

---

### User Story 2 - Only the right people decide, and history cannot be rewritten (Priority: P1)

A product owner approves or rejects a feature. Viewers cannot. Every decision stays, chained to the previous one, and any edit shows.

**Why this priority**: The decision record is the product's evidence; if it can be changed it proves nothing.

**Independent Test**: Record decisions with each role, try to change or delete them, alter one directly and run the verification.

**Acceptance Scenarios**:

1. **Given** a viewer or a member, **When** they try to record a decision, **Then** it is refused (FR-003)
2. **Given** a rejection, conditions or a delegation without a reason, **When** it is recorded, **Then** it is refused (FR-006)
3. **Given** recorded decisions, **When** anyone tries to edit or delete one, **Then** it is refused (FR-005)
4. **Given** a decision altered behind the system's back, **When** the verification runs, **Then** it names the first entry that no longer matches (FR-004, FR-008)

---

### User Story 3 - What GitHub gives us stays inside one company (Priority: P2)

When a company installs the GitHub App, its installation, repositories, features, spec versions and reviews are stored under that company only, and a repeated delivery from GitHub is handled once.

**Why this priority**: The connection is the way data enters; it must not be a way across companies.

**Independent Test**: Store data for two companies, try to link a row to the other company, and deliver the same webhook twice.

**Acceptance Scenarios**:

1. **Given** a repository of one company, **When** a row of another company points at it, **Then** the database refuses (FR-009)
2. **Given** the same delivery twice, **When** it is stored, **Then** it is processed once (FR-010)
3. **Given** a signed-in person, **When** they read stored deliveries, **Then** they are refused (FR-011)

---

### User Story 4 - Connect GitHub without handing over the keys (Priority: P1)

An owner installs the GitHub App on the repositories they choose. The service learns about the installation and its repositories, keeps them in sync from GitHub's notifications, and queues work when the specs change.

**Why this priority**: Without this the product has no code to look at; with a careless version, one company could attach another company's installation.

**Independent Test**: Run the install round trip as an owner, as a viewer and as a person of another company, then send pushes, installation changes and forged requests.

**Acceptance Scenarios**:

1. **Given** an owner or an admin, **When** they connect GitHub, **Then** the installation and its repositories are stored under their company (FR-012)
2. **Given** a viewer or a person of another company, **When** they try to start the connection, **Then** it is refused (FR-012)
3. **Given** an installation already linked to a company, **When** another company claims it, **Then** it is refused (FR-013)
4. **Given** a request that does not carry GitHub's signature, **When** it reaches the webhook, **Then** it is refused and nothing is stored (FR-014)
5. **Given** a push to the default branch that changes the specs, **When** it arrives, **Then** one job is queued for that repository even if several pushes arrive before it runs (FR-015)
6. **Given** a delivery that failed halfway, **When** GitHub retries it, **Then** it is processed again (FR-010)
7. **Given** the service itself, **When** its code tries to rewrite a decision, **Then** the database refuses (NFR-002)
8. **Given** a request to the API without a valid sign-in token, **When** it arrives, **Then** it is refused (FR-016)

---

### User Story 5 - Reviews appear on their own (Priority: P1)

When the specs of a connected repository change, the service reads them at that commit, reviews them and stores the result, so the person finds an up-to-date review without running anything.

**Why this priority**: This is the moment the product starts delivering value to a connected company.

**Independent Test**: Queue a push for a repository with a real spec, run the worker, then repeat with the same content, with a changed spec and with GitHub failing.

**Acceptance Scenarios**:

1. **Given** a queued push, **When** the worker runs, **Then** each feature version and its review are stored under the company (FR-017)
2. **Given** a commit whose specs have the same content as a stored version, **When** the worker runs, **Then** nothing new is stored (FR-018)
3. **Given** a repository with files that are not specs, with oversized files or with too many features, **When** the worker runs, **Then** it reads only the permitted spec files and refuses the excess (FR-019)
4. **Given** GitHub fails, **When** the worker runs, **Then** the job is retried later with growing delays and it stops after five attempts (FR-020)

---

### Edge Cases

- What happens when a company is deleted while it has decisions?
- How are two decisions recorded at the same moment ordered?
- What happens to a person who belongs to several companies?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a signed-in person creates a company, the system MUST make them its owner
- **FR-002**: The system MUST show a person only the data of the companies they belong to
- **FR-003**: While a person's role is viewer or member, the system MUST refuse the decisions they try to record
- **FR-004**: When a decision is recorded, the system MUST chain it by hash to the previous decision of the company
- **FR-005**: The system MUST refuse any edit or deletion of a recorded decision
- **FR-006**: If a decision is anything but a plain approval, then the system MUST require a reason
- **FR-007**: If a change would leave a company without an owner, then the system MUST refuse it
- **FR-008**: When the verification runs, the system MUST report the first decision whose hash does not match
- **FR-009**: The system MUST store every installation, repository, feature, spec version and review under exactly one company
- **FR-010**: When GitHub delivers the same webhook twice, the system MUST process it once
- **FR-011**: The system MUST keep stored webhook payloads unreadable to signed-in people
- **FR-012**: When an owner or an admin connects GitHub, the system MUST store the installation and its repositories under their company
- **FR-013**: If an installation is already linked to a company, then the system MUST refuse to link it to another one
- **FR-014**: If a webhook request does not carry a valid GitHub signature, then the system MUST refuse it and store nothing
- **FR-015**: When a push to the default branch changes files under specs, the system MUST queue one pending job for that repository
- **FR-017**: When a queued push is processed, the system MUST store each feature version and its review under the company of the repository
- **FR-018**: If the specs of a commit have the same content as a stored version, then the system MUST NOT store that version again
- **FR-019**: The system MUST read only the Spec Kit files and the product files of a repository, within fixed limits of size and count
- **FR-020**: If reading a repository fails, then the system MUST retry the job later with growing delays up to five attempts
- **FR-016**: When a person is not signed in with a valid token, the system MUST refuse their requests to the API

### Non-Functional Requirements

- **NFR-001**: The system MUST enforce company isolation inside the database and not only in the application
- **NFR-002**: The system MUST run its own database work with the least privilege that work needs

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every table that holds company data, a member of company A reads 0 rows of company B and an anonymous visitor reads 0 rows (NFR-001)
- **SC-002**: After one decision is altered directly in the database, the verification fails and names that decision's position
- **SC-004**: The stored hash of a feature version equals the hash the command line uses for approvals, so a decision recorded in either place points at the same version
- **SC-003**: A webhook delivered twice, or retried after a failure, changes the data exactly once

## Assumptions

- Supabase provides sign-in, the `authenticated` and `service_role` roles and `auth.uid()`; the tests reproduce only those (source: D-008)
- The review engine is used as a library by the worker; it parses text only and nothing from a repository is executed
- GitHub shows the person an install page; the callback is trusted only through a signed, short-lived state created by an owner or an admin
