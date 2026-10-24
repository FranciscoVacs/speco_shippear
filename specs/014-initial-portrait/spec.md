# Feature Specification: Initial Portrait of Business Rules

**Feature Branch**: `014-initial-portrait`

**Created**: 2026-10-15

**Status**: Implemented

**Goals**: G-9, G-8

**Decisions**: D-009, D-003, D-008

**Input**: User description: "When a company connects its repositories, show what its software does today as business rules in plain language, let the people who approve confirm them, freeze them as the company's baseline, and flag when a later change touches a confirmed rule without anyone deciding it"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what exists in my repositories (Priority: P1)

A founder connects a repository and, without waiting for any analysis of the code, sees what kind of things it holds: specs, documentation, API definitions, tests, database structure, configuration.

**Why this priority**: It is the first useful answer after connecting and it costs no analysis of the code.

**Independent Test**: Connect a repository and read its inventory.

**Acceptance Scenarios**:

1. **Given** a connected repository, **When** its first sync ends, **Then** an inventory with the count of files by kind is stored for it (FR-001)

---

### User Story 2 - Rules proposed with proof (Priority: P1)

The system proposes the business rules that already live in the repository, each in plain language and each with the exact place that supports it. A proposal that cannot be backed by that place is discarded.

**Why this priority**: A rule without checkable evidence is an opinion; the product exists to replace opinions with decisions.

**Independent Test**: Run the portrait on a repository with implemented specs and, with consent, on code. Try a model answer that invents a quote.

**Acceptance Scenarios**:

1. **Given** specs marked as implemented, **When** the portrait runs, **Then** each of their requirements becomes a proposed rule that points at its line (FR-002)
2. **Given** a company that consented to code analysis, **When** the portrait runs, **Then** rules found in the code are proposed with the file and lines that support them (FR-003)
3. **Given** a company that did not consent, **When** the portrait runs, **Then** no code is sent to a model (FR-004, NFR-001)
4. **Given** a proposal whose quoted lines are not in the file at that commit, **When** it is checked, **Then** it is discarded (FR-005)
5. **Given** the same rule found twice, **When** it is stored, **Then** only one proposal exists (FR-012)

---

### User Story 3 - The people who approve decide (Priority: P1)

A product owner goes through the proposed rules one by one and confirms, corrects or rejects each. Nothing a machine proposed counts until they do.

**Why this priority**: This is the step that turns a guess about the code into a decision of the company.

**Independent Test**: Decide rules as an approver and as a viewer, then read the record.

**Acceptance Scenarios**:

1. **Given** proposed rules, **When** nobody has decided, **Then** they stay proposed (FR-006)
2. **Given** a proposed rule, **When** an approver confirms, corrects or rejects it, **Then** who, when and what changed is recorded and cannot be altered (FR-007)
3. **Given** a viewer or a member, **When** they try to decide a rule, **Then** it is refused (FR-008)

---

### User Story 4 - Freeze the baseline (Priority: P1)

Once the important rules are confirmed, an owner or an approver freezes them as the company's baseline, a snapshot nobody can edit.

**Why this priority**: Without a fixed point there is nothing to compare future changes against.

**Independent Test**: Freeze with confirmed and proposed rules, then try to change the snapshot.

**Acceptance Scenarios**:

1. **Given** confirmed and proposed rules, **When** the baseline is frozen, **Then** only the confirmed rules enter it, with a hash of the whole (FR-009)

---

### User Story 5 - Notice when a change touches a decided rule (Priority: P1)

After the baseline, every new commit is compared with the evidence of the confirmed rules. If the supporting lines changed or disappeared, the system opens a finding naming the rule and waits for a person to acknowledge it.

**Why this priority**: This is the guarantee that decided rules do not change by themselves.

**Independent Test**: Change and delete the lines that support a confirmed rule and sync again.

**Acceptance Scenarios**:

1. **Given** a confirmed rule, **When** a new commit changes or removes its supporting lines, **Then** a finding naming the rule is opened (FR-010)
2. **Given** an open finding, **When** an approver acknowledges it, **Then** who and why are recorded (FR-011)

---

### Edge Cases

- What happens when the repository is too large to analyze within the budget?
- How are rules from a repository that is later removed handled?
- What happens when a corrected rule is proposed again by the next analysis?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a repository finishes its first sync, the system MUST store an inventory of its files by kind
- **FR-002**: When a repository has specs marked as implemented, the system MUST propose a rule for each of their requirements
- **FR-003**: Where the company consented to code analysis of a repository, the system MUST propose the rules it finds in that code
- **FR-004**: While the company has not consented to code analysis of a repository, the system MUST keep that repository's code away from any model
- **FR-005**: If the lines quoted as evidence of a proposed rule are not in the repository at that commit, then the system MUST discard the proposal
- **FR-006**: The system MUST keep every rule it proposes as proposed until a person decides
- **FR-007**: When an approver confirms, corrects or rejects a rule, the system MUST record who, when and what changed in a record that cannot be altered
- **FR-008**: While a person's role is viewer or member, the system MUST refuse their decisions on rules
- **FR-009**: When an owner or an approver freezes the baseline, the system MUST store the confirmed rules as a snapshot that cannot be altered, with a hash of the whole
- **FR-010**: When a new commit changes or removes the supporting lines of a confirmed rule, the system MUST open a finding that names the rule
- **FR-011**: When an approver acknowledges a finding, the system MUST record who and why
- **FR-012**: If a rule is proposed that already exists for the repository, then the system MUST NOT create a second one

### Non-Functional Requirements

- **NFR-001**: The system MUST send code to a model only for repositories with consent and only the files selected within a fixed budget

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the stored proposals have at least one evidence whose quoted lines were found in the repository at that commit
- **SC-002**: Changing any rule inside a frozen baseline is refused, and the baseline hash differs for any different set of confirmed rules
- **SC-003**: A change to the supporting lines of a confirmed rule opens a finding on the next sync of that repository

## Assumptions

- The model that proposes rules is optional and injected; without one the portrait still produces rules from implemented specs (source: D-003)
- A rule proposed from code is a hypothesis: its confidence is never above medium until a person confirms it (source: D-009)
- Reading business rules from code works best on the files that name money, permissions, limits and notifications; the analysis selects those first
