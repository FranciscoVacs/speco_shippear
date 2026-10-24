# Feature Specification: Onboarding and Product Guide

**Feature Branch**: `004-onboarding-and-guide`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-2

**Input**: User description: "The product must be easy to use, with an onboarding and a detailed explanation of what it does and how"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand the product on the first visit (Priority: P1)

A new user opens the interface and, in under a minute, learns what the product is, what problem it solves and how to read a result.

**Why this priority**: A tool nobody understands in the first minute is not opened a second time.

**Independent Test**: Open the interface in a browser with empty storage and go through the introduction.

**Acceptance Scenarios**:

1. **Given** a browser that never opened the interface, **When** the user opens it, **Then** a dismissible introduction with four steps appears (FR-001)
2. **Given** the user dismissed the introduction, **When** the user opens the interface again, **Then** the introduction does not appear (FR-002)
3. **Given** the user dismissed the introduction, **When** the user presses the help button in the top bar, **Then** the introduction opens again (FR-003)
4. **Given** a browser that blocks local storage, **When** the user opens the interface, **Then** the interface works and shows the introduction on every visit (FR-009, FR-011)

---

### User Story 2 - Understand a finding where it appears (Priority: P1)

A user looks at a finding they do not understand and gets the meaning of its rule without leaving the page.

**Why this priority**: A finding nobody understands gets ignored, and the review loses its value.

**Independent Test**: Expand any finding and read the explanation of its rule.

**Acceptance Scenarios**:

1. **Given** a finding on the screen, **When** the user expands it, **Then** the interface offers what the rule detects, why it matters and how to fix it (FR-004)
2. **Given** an expanded explanation, **When** the user chooses to see it in the guide, **Then** the guide opens at that rule (FR-006)

---

### User Story 3 - Read the full product guide (Priority: P2)

A team lead who wants to adopt the product reads a page that explains what it is, how it works, how to read a report and how far to trust it.

**Why this priority**: Adoption needs an honest explanation of the limits, not only a demo.

**Independent Test**: Open the guide page and check each section is present.

**Acceptance Scenarios**:

1. **Given** the guide page, **When** the team lead reads it, **Then** it explains what the product is, how it works and how to read a report (FR-005)
2. **Given** the rule glossary in the guide, **When** the team lead searches for a rule, **Then** the rule appears with what it detects, an example that triggers it and the correct example (FR-006)
3. **Given** the guide page, **When** the team lead reads the section on reliability, **Then** it states which findings are deterministic and which are inferred from text (FR-005)

---

### User Story 4 - Get unstuck when there is nothing to show (Priority: P2)

A user who opens the interface without data, or on sample data, learns what to do next instead of seeing an error.

**Why this priority**: Empty and error screens are where new users give up.

**Independent Test**: Open the interface on sample data, then on a server with no features.

**Acceptance Scenarios**:

1. **Given** the interface shows sample data, **When** the user looks at the page, **Then** a banner says so and shows the command that reviews the user's own repository (FR-007)
2. **Given** a server that has no features or cannot be reached, **When** the user opens the interface, **Then** the page shows the commands that start the review instead of an error message (FR-008)
3. **Given** a keyboard and no mouse, **When** the user goes through the introduction, **Then** every control of the dialog can be reached and activated with the keyboard (FR-010)

---

### Edge Cases

- What happens when a rule has no example in the catalog?
- How does the introduction behave on a 375 pixel wide screen?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a user opens the interface for the first time, the system MUST show a dismissible introduction with four steps
- **FR-002**: When the user has dismissed the introduction, the system MUST NOT show it on later visits
- **FR-003**: When the user presses the help button, the system MUST open the introduction
- **FR-004**: When the user expands a finding, the system MUST offer what its rule detects, why it matters and how to fix it
- **FR-005**: The system MUST provide a guide page that explains what the product is, how it works, how to read a report and how far to trust it
- **FR-006**: The system MUST list every rule of the catalog in the guide with what it detects and an example
- **FR-007**: While the interface shows sample data, the system MUST say so and show the command that reviews the user's own repository
- **FR-008**: If the server has no features or cannot be reached, then the system MUST show the commands that start the review instead of an error message
- **FR-009**: Where local storage is unavailable, the system MUST keep working
- **FR-011**: Where local storage is unavailable, the system MUST show the introduction on every visit
- **FR-010**: The system MUST let the user operate the introduction with the keyboard alone

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the closing of the introduction, a user reaches the exact source line of any finding in at most 2 clicks
- **SC-002**: 100% of the rules the tool can emit appear in the guide

## Assumptions

- The rule catalog is the single source of what each rule means
- The guide text follows docs/07-product-guide.md
