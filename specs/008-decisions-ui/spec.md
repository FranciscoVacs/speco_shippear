# Feature Specification: Decisions for Approvers

**Feature Branch**: `008-decisions-ui`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-4

**Decisions**: D-001

**Input**: User description: "The person who approves sees at a glance whether a feature can be built and what waits for their decision"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the verdict (Priority: P1)

A founder opens a review and reads one verdict and one sentence before any technical detail.

**Why this priority**: The person who approves does not read rule ids.

**Independent Test**: Open a review of each verdict and read the summary.

**Acceptance Scenarios**:

1. **Given** a feature with an open product question, **When** the review opens, **Then** the summary says the feature needs the decision of the approver (FR-001)
2. **Given** a feature with blockers that only the team can fix, **When** the review opens, **Then** the summary says the feature is blocked and the approver has nothing to decide (FR-002)
3. **Given** the summary, **When** the approver reads it, **Then** no rule id appears in it (FR-003)
4. **Given** the summary, **When** the user copies it, **Then** a plain text version is on the clipboard (FR-006)

---

### User Story 2 - See what waits for me (Priority: P1)

A product owner opens one page and sees every decision waiting for them across features.

**Why this priority**: A decision that nobody sees does not get made, and the agent guesses instead.

**Independent Test**: Open the decisions page and count the items against the reports.

**Acceptance Scenarios**:

1. **Given** several features, **When** the decisions page opens, **Then** it lists only the findings that the approver can resolve, grouped by feature (FR-004)
2. **Given** pending decisions, **When** the user looks at the sidebar, **Then** the number of pending decisions is shown (FR-005)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a feature has findings that only the approver can resolve, the system MUST show the verdict that it needs the decision of the approver
- **FR-002**: When a feature has blockers and none of them needs the approver, the system MUST show the verdict that it is blocked
- **FR-003**: The system MUST NOT show rule ids in the executive summary or in the list of decisions
- **FR-004**: When the decisions page opens, the system MUST list the findings that the approver can resolve, grouped by feature
- **FR-005**: While decisions are pending, the system MUST show their number in the sidebar
- **FR-006**: When the user copies the summary, the system MUST put a plain text version on the clipboard

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of the sample reviews, the page shows the same verdict as the report

## Assumptions

- The first approvers are founders and product owners of teams of up to 20 people (source: the pilot interviews)
