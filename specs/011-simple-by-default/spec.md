# Feature Specification: Simple by Default

**Feature Branch**: `011-simple-by-default`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-6, G-4

**Decisions**: D-006

**Input**: User description: "The platform must be as visually simple as possible, and people navigate to fuller pages as they need them"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A calm first view (Priority: P1)

A founder opens the product and sees only what they need to decide, without a wall of controls, tables and counters.

**Why this priority**: The people who approve do not read technical detail, and a busy first view makes them leave.

**Independent Test**: Open the product for the first time, open the decisions page and open a review.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** the sidebar is shown, **Then** it has at most three entries and a way to ask for more (NFR-001)
2. **Given** a review, **When** it opens, **Then** the executive summary is shown first and the technical findings are collapsed (NFR-002)
3. **Given** the decisions page, **When** it opens, **Then** what waits for the approver is shown first and the rest is collapsed (NFR-003)

---

### User Story 2 - Go deeper when I need it (Priority: P1)

A product owner who wants the technical detail opens it in one action and does not lose the page they were on.

**Why this priority**: Simplicity that hides the detail for good would make the product useless to the team that fixes the findings.

**Independent Test**: Open a collapsed section, follow a link to a finding and reach a page through the command palette.

**Acceptance Scenarios**:

1. **Given** a collapsed section, **When** the person looks at its heading, **Then** the heading says how much is inside (NFR-004)
2. **Given** a collapsed section, **When** the person opens it with the mouse or the keyboard, **Then** it opens in place and states that it is expanded (NFR-005)
3. **Given** an address that points to a finding, **When** the page loads, **Then** the section that holds the finding opens (NFR-006)
4. **Given** any page of the product, **When** the person uses the command palette, **Then** the page opens even if the sidebar does not list it (NFR-007)

---

### User Story 3 - Keep my way of working (Priority: P2)

An engineer who always wants the detail opens it once and finds it open on the next visit.

**Why this priority**: Asking the same person to open the same section every day is friction that simplicity must not create.

**Independent Test**: Open the technical detail, reload and open another review.

**Acceptance Scenarios**:

1. **Given** a section the person opened, **When** they come back later, **Then** it is still open (NFR-008)
2. **Given** an exported report, **When** it opens, **Then** the technical findings are shown open (NFR-009)

---

### Edge Cases

- What happens when the browser blocks storage and the choice cannot be remembered?
- How does the sidebar behave on a narrow phone screen?

## Requirements *(mandatory)*

### Non-Functional Requirements

- **NFR-001**: While the person has not asked for more, the system MUST show at most three entries in the sidebar and a control that shows the rest
- **NFR-002**: When a review opens, the system MUST show the executive summary first and MUST keep the technical findings collapsed
- **NFR-003**: When the decisions page opens, the system MUST show what waits for the approver first and MUST keep the goals, the history and the list of all features collapsed
- **NFR-004**: While a section is collapsed, the system MUST show in its heading how many items it holds
- **NFR-005**: When the person opens or closes a section with the mouse or the keyboard, the system MUST do it in place and MUST state whether the section is expanded
- **NFR-006**: When the address points to a finding, the system MUST open the section that holds it
- **NFR-007**: The system MUST let the person reach every page through the command palette, whether or not the sidebar lists it
- **NFR-008**: When the person opens a section or the extra navigation, the system MUST remember that choice for the next visit
- **NFR-009**: Where the page is an exported report, the system MUST show the technical findings open

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a first visit, the sidebar shows at most 3 links and the review page shows 0 finding rows until the person asks for them
- **SC-002**: In 100% of the pages of the product, every section that is collapsed by default opens with at most 1 interaction

## Assumptions

- Founders and product owners who approve want fewer things on screen (source: the pilot interviews)
