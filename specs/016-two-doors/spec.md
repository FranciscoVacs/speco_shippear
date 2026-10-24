# Feature Specification: Two Doors

**Feature Branch**: `016-two-doors`

**Created**: 2026-10-15

**Status**: Partially implemented (stories 1, 2, 3 and 5; the comparison of story 4 is not built)

**Goals**: G-10, G-7

**Decisions**: D-010, D-006

**Input**: User description: "The product must onboard companies that already have software and people who are vibecoding with no code yet and are not technical"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick the door in plain words (Priority: P1)

Right after creating their company, a person is asked one question in plain language: do you already have software, or are you starting from an idea? Each answer leads to a first result in minutes.

**Why this priority**: The two audiences need opposite first steps; showing the wrong one makes either leave.

**Independent Test**: Create a company and answer each way, without knowing any technical term.

**Acceptance Scenarios**:

1. **Given** a company with nothing in it, **When** the person arrives, **Then** they are asked whether they already have software or are starting from an idea, without technical words (FR-001)
2. **Given** either answer, **When** the person changes their mind, **Then** they can switch door at any time without losing what they did (FR-002)

---

### User Story 2 - A company with software sees what it does today (Priority: P1)

A company connects its repositories and gets the initial portrait of its rules to confirm, as described in the portrait spec.

**Why this priority**: It is the door the product already has and its value is proven.

**Independent Test**: Take the first door and reach the first rule awaiting confirmation.

**Acceptance Scenarios**:

1. **Given** the first door, **When** the person connects GitHub, **Then** they are taken through the connection and the initial portrait without being asked for a spec (FR-003)

---

### User Story 3 - A person with an idea and no code decides before building (Priority: P1)

A person who is vibecoding tells Speco what they want in their own words and answers the questions that matter, one at a time. Speco keeps what they decided as their spec and hands them a brief to paste into the AI tool they build with.

**Why this priority**: These people are the ones who most need decisions made before an agent starts guessing, and they have no repository to connect.

**Independent Test**: As a person with no code, go from one sentence to a brief with every open question decided.

**Acceptance Scenarios**:

1. **Given** the second door, **When** the person writes what they want, **Then** Speco asks the open questions one at a time in plain language, with examples (FR-004)
2. **Given** answered questions, **When** the person finishes, **Then** their decisions are saved as a spec inside Speco with no repository needed (FR-005)
3. **Given** a saved spec, **When** the person asks for it, **Then** they get a brief they can paste into any AI building tool (FR-006)
4. **Given** a question the person cannot answer, **When** they say so, **Then** Speco keeps it open and marks it as a risk instead of guessing (FR-007)

---

### User Story 4 - What they built is compared with what they decided (Priority: P2)

When the person later connects the code their AI tool produced, Speco shows what the code does that nobody decided and what was decided and is missing.

**Why this priority**: This is the product's thesis applied to the person who needs it most.

**Independent Test**: Connect code built from a saved spec and read the comparison.

**Acceptance Scenarios**:

1. **Given** a saved spec and a connected repository, **When** the portrait runs, **Then** each proposed rule is shown as decided, undecided or contradicting a decision (FR-008)
2. **Given** a decided intent with no match in the code, **When** the comparison is shown, **Then** it is listed as missing (FR-009)

---

### User Story 5 - The second door speaks without jargon (Priority: P1)

Nothing in the second door requires knowing what a repository, a commit or a spec file is, unless the person asks.

**Why this priority**: A person who is not technical leaves at the first word they do not know.

**Independent Test**: Read the whole second door looking for technical words.

**Acceptance Scenarios**:

1. **Given** the second door, **When** any screen is read, **Then** it avoids the words repository, commit, pull request and requirement outside an explicit detail view (FR-010)

---

### Edge Cases

- What happens when a person has code in an AI tool but cannot say where it lives?
- How does a company that starts from an idea behave once it has code?
- What happens when a person answers every question with "I don't know"?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a company has nothing in it, the system MUST ask whether the person already has software or is starting from an idea, in words that need no technical knowledge
- **FR-002**: When the person changes door, the system MUST keep everything they did in the other door
- **FR-003**: When the person says they have software, the system MUST lead them through connecting GitHub and the initial portrait
- **FR-004**: When the person says what they want, the system MUST ask the open questions one at a time in plain language with examples
- **FR-005**: When the person finishes the questions, the system MUST save their decisions as a spec that belongs to the company and does not need a repository
- **FR-006**: When the person asks for their spec, the system MUST give a brief they can paste into an AI building tool
- **FR-007**: If the person cannot answer a question, then the system MUST keep it open and mark it as a risk
- **FR-008**: When a repository is connected to a company that has saved decisions, the system MUST show each rule found as decided, undecided or contradicting a decision
- **FR-009**: When a decided intent has no match in the code, the system MUST list it as missing
- **FR-010**: While the person is in the second door, the system MUST avoid technical words outside an explicit detail view

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person with no code and no technical knowledge goes from one sentence to a brief with every question decided or marked as a risk in at most 10 minutes
- **SC-002**: A company with software reaches its first rule awaiting confirmation in at most 5 minutes after connecting GitHub
- **SC-003**: The second door shows 0 technical words outside the detail view

## Assumptions

- The brief is plain text a person pastes into the tool they already use; Speco does not build their software (source: D-010)
- The comparison between decisions and code reuses the proposals of the initial portrait and is as approximate as they are (source: D-009)
