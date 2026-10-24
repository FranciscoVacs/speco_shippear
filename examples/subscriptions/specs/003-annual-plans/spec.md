# Feature Specification: Annual Plans

**Feature Branch**: `003-annual-plans`

**Created**: 2026-10-05

**Status**: Draft

**Goals**: G-3, G-9

**Decisions**: D-003

**Input**: User description: "Let teams switch to an annual plan with a discount"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch to annual (Priority: P1)

A team admin switches the team from monthly to annual billing and sees the new price.

**Why this priority**: Annual contracts are the main revenue goal of the quarter.

**Independent Test**: Switch a test team and read the next invoice.

**Acceptance Scenarios**:

1. **Given** a team on a monthly plan, **When** the admin switches to annual, **Then** the next invoice is for twelve months at the annual price (FR-001)
2. **Given** a team on an annual plan, **When** the admin looks at billing, **Then** the renewal date is shown (FR-003)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a team admin switches to the annual plan, the system MUST issue one invoice for twelve months at the annual price
- **FR-002**: When a team admin switches to the annual plan, the system MUST apply a 15% discount coupon to the first year
- **FR-003**: The system MUST show the renewal date of an annual plan to team admins

## Success Criteria *(mandatory)*

- **SC-001**: 25% of teams that see the annual offer choose it within 30 days

## Assumptions

- Admins prefer paying once a year because it simplifies their expense reports
- Annual plans are sold to teams of at least 10 people (source: sales interviews, Sept 2026)
- The billing provider supports twelve-month invoices
