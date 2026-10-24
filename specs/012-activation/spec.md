# Feature Specification: Activation in Five Minutes

**Feature Branch**: `012-activation`

**Created**: 2026-10-15

**Status**: Implemented

**Goals**: G-7, G-4

**Decisions**: D-007, D-006, D-005, D-003

**Input**: User description: "A new person must understand what the product is for within five minutes of signing in, get a flow running quickly and see results, and the thesis must show through the product without adding elements to every screen"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand it by doing it (Priority: P1)

A product owner signs in for the first time and, instead of reading an introduction, follows a short checklist that takes them through a real decision in the product.

**Why this priority**: People who approve do not read manuals, and the value of the product is only clear when they see a decision they would otherwise have missed.

**Independent Test**: Sign in with no saved state and follow the checklist from the first milestone to the last.

**Acceptance Scenarios**:

1. **Given** a first sign in, **When** the home page opens, **Then** a checklist with four milestones is shown instead of the text-only introduction (FR-001)
2. **Given** the checklist, **When** the person does what a milestone asks in the real page, **Then** the milestone is marked as done without any manual action (FR-002)
3. **Given** the checklist, **When** the person opens the first milestone, **Then** a sample feature is shown with one open decision between two rules that contradict each other, labelled as a sample (FR-003)
4. **Given** the checklist was closed, **When** the person opens the help menu, **Then** the checklist can be reopened and shows what is already done (FR-004)
5. **Given** the browser blocks storage, **When** the person signs in, **Then** the checklist is shown and works without remembering its progress (NFR-002)
6. **Given** the checklist, **When** the person uses only the keyboard, **Then** every milestone can be opened and its state is announced (NFR-003)

---

### User Story 2 - Try it with my own idea (Priority: P1)

A founder writes a business need in their own words and gets a draft spec whose open questions are the decisions they have to make.

**Why this priority**: It closes the cycle from intent to verified spec for a person who does not write specs.

**Independent Test**: Write one sentence describing a need and read the draft.

**Acceptance Scenarios**:

1. **Given** a business need written in plain language, **When** the person sends it, **Then** a draft spec is shown with its open questions listed as decisions (FR-005)
2. **Given** a draft, **When** it is shown, **Then** nothing has been written to the repository until the person confirms (FR-006)
3. **Given** no model is configured, **When** the person sends a need, **Then** the system offers a spec template with the questions to answer (FR-007)

---

### User Story 3 - Connect my repository (Priority: P2)

A person connects a repository in three steps and sees the first executive summary without using a terminal.

**Why this priority**: The sample proves the idea, but only the person's own repository proves the value.

**Independent Test**: Connect a repository that has specs, then one that has none.

**Acceptance Scenarios**:

1. **Given** the connect flow, **When** the person picks a repository, **Then** the first review runs and its executive summary is shown (FR-008)
2. **Given** a repository with no specs, **When** the review ends, **Then** the system offers to start from a business need (FR-009)

---

### User Story 4 - One language across the product (Priority: P2)

A manager reads decisions and intents, not findings and requirements, and every empty state tells them what is decided and what is next.

**Why this priority**: A consistent vocabulary makes the thesis visible without adding anything to the screen.

**Independent Test**: Read every page for people who approve and the weekly digest.

**Acceptance Scenarios**:

1. **Given** a page for people who approve, **When** it is shown, **Then** it says decision where it would say finding and intent where it would say requirement (FR-010)
2. **Given** a page with nothing to show, **When** it is shown, **Then** it says what is already decided and what the person can do next (FR-011)
3. **Given** the weekly digest, **When** it is sent, **Then** it summarizes decisions waiting, features ready to build and decisions recorded (FR-012)

---

### Edge Cases

- What happens when the person closes the checklist halfway and signs in on another device?
- How does the checklist behave when the browser blocks storage?
- What happens when the idea is too short or too vague to draft anything?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a person signs in for the first time, the system MUST show a checklist with four milestones instead of the text-only introduction
- **FR-002**: When the person completes the action of a milestone in the product, the system MUST mark that milestone as done without a manual action
- **FR-003**: The system MUST include a sample feature with one open decision between two rules that contradict each other and MUST label it as a sample
- **FR-004**: When the person opens the help menu, the system MUST offer to reopen the checklist and MUST show which milestones are done
- **FR-005**: When the person sends a business need in plain language, the system MUST show a draft spec whose open questions are listed as decisions
- **FR-006**: The system MUST NOT write the draft to the repository until the person confirms
- **FR-007**: Where no model is configured, the system MUST offer a spec template with the questions to answer
- **FR-008**: When the person picks a repository, the system MUST run the first review and show its executive summary
- **FR-009**: If the repository has no specs, then the system MUST offer to start from a business need
- **FR-010**: While a page is for people who approve, the system MUST say decision instead of finding and intent instead of requirement and MUST keep the technical terms inside the technical detail
- **FR-011**: When a page has nothing to show, the system MUST say what is already decided and what the person can do next
- **FR-012**: When the weekly digest is sent, the system MUST summarize the decisions waiting, the features ready to build and the decisions recorded

### Non-Functional Requirements

- **NFR-001**: The system MUST NOT add a new element to every page to repeat the thesis
- **NFR-002**: Where the browser blocks storage, the system MUST still show the checklist and MUST work without remembering its progress
- **NFR-003**: The checklist MUST be usable with the keyboard and MUST announce the state of each milestone

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new person completes the third milestone in at most 5 minutes and at most 12 interactions, typing only one short reason
- **SC-002**: After signing in, the first executive summary is reachable in at most 3 interactions
- **SC-003**: Pages for people who approve contain 0 uses of the words finding and requirement outside the technical detail
- **SC-004**: The thesis adds 0 permanent elements to the pages of the product beyond the checklist (NFR-001)

## Assumptions

- The idea-to-spec draft is simulated in the public demo and uses a real model only with a configured model (source: D-003)
- Connecting a repository in the browser needs the local server or a GitHub connection, so the public demo shows it simulated
