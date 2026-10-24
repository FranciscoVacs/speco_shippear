# Feature Specification: Value Delivered

**Feature Branch**: `025-value-delivered`

**Created**: 2026-10-20

**Status**: Implemented

**Goals**: G-18, G-16

**Decisions**: D-018, D-016

**Input**: User description: "Define a KPI that sums up how much value the software added to the client's processes: the problems caught before code, with the client's own word on what would have reached production"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what the reviews caught (Priority: P1)

The owner of the service, or a client, reads for a month how many blockers and warnings were found in a spec and fixed before any code was written.

**Why this priority**: It is the one number that says what the product did, rather than whether people opened it.

**Independent Test**: Review a feature twice, with a blocker present in the first review and gone in the second, and read the month.

**Acceptance Scenarios**:

1. **Given** a finding present in a review of a feature and absent from the latest review of that same feature, **When** the report runs, **Then** it counts it as resolved in the month of that latest review (FR-001)
2. **Given** a finding still present in the latest review, **When** the report runs, **Then** it is not counted as resolved and shows as an open blocker (FR-001)
3. **Given** a resolved blocker raised by a product rule or a contradiction rule, **When** the report runs, **Then** it counts it also as a protected decision or a removed contradiction (FR-002)
4. **Given** a company marked as excluded, **When** the report runs, **Then** its findings are in no figure (FR-007)

---

### User Story 2 - The client says what would have shipped (Priority: P1)

A member who fixed a blocker or a warning answers one question: would this have reached code without Speco?

**Why this priority**: Nobody can observe what did not happen; the only honest evidence is the word of the person who fixed it.

**Independent Test**: Resolve a blocker, list the pending questions, answer, and read the report.

**Acceptance Scenarios**:

1. **Given** resolved blockers and warnings without an answer, **When** a member who is not a viewer asks, **Then** the service lists up to five, newest first (FR-003)
2. **Given** a resolved finding, **When** a member answers yes, probably or no, **Then** the first answer is kept and a later one changes nothing (FR-004)
3. **Given** a finding that is not resolved, or a viewer, or someone who is not a member, **When** they try to answer, **Then** the service refuses (FR-004)
4. **Given** answers, **When** the report runs, **Then** it weighs yes as 1 and probably as 0.5 (FR-005)

---

### User Story 3 - An estimate of hours that is never presented as a fact (Priority: P2)

The owner reads an estimate of the rework avoided, with the hours per blocker visible as an assumption.

**Why this priority**: A number of hours is what a manager repeats in a renewal; it is only defensible if its assumptions are on the page.

**Independent Test**: Answer one blocker as yes and read the estimate with two different assumptions.

**Acceptance Scenarios**:

1. **Given** no answers, **When** the report runs, **Then** it shows the counts and no hours (FR-006)
2. **Given** answers, **When** the report runs, **Then** it shows a range of hours from the weighted blockers times a low and a high assumption, and says that blockers without an answer add nothing (FR-006)
3. **Given** a company id, **When** the report runs for it, **Then** it prints only that company's section, ready to hand to that client (FR-008)

---

### User Story 4 - Are the specs getting better? (Priority: P3)

The owner reads the average blockers in the first review of each feature, by month.

**Why this priority**: It is value that stays after the product is gone: the team writes better specs.

**Independent Test**: Review features in two months with different numbers of blockers and read the trend.

**Acceptance Scenarios**:

1. **Given** first reviews of features in several months, **When** the report runs, **Then** it shows features and average blockers per month, marked not conclusive under 30 features (FR-009)

---

### User Story 5 - Asked without being bothered (Priority: P1)

A member who fixed a problem sees one small line with three answers, a few seconds after the app opens, and then not again for a day.

**Why this priority**: Without it the answers never exist; if it nags, people stop using the app or answer at random.

**Independent Test**: Open the app with a resolved finding pending, answer with one tap, reload; then close the card and reload.

**Acceptance Scenarios**:

1. **Given** a resolved finding pending, **When** the app opens, **Then** the card appears only after a few seconds, once per page load, and the page stays usable behind it (FR-010)
2. **Given** the card, **When** the person taps an answer, **Then** it is sent in that one tap, nothing has to be typed, and the card stays away for a day (FR-010)
3. **Given** the card, **When** the person closes it, **Then** it stays away for three days without asking the service again (FR-010)

---

### Edge Cases

- What happens when a finding disappears because it was waived or put in the baseline instead of fixed?
- What happens when a feature is deleted from the repository?
- What happens when the same finding comes back after being resolved?
- What happens when a feature has only one review?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST count a finding as resolved when it appears in a review of a feature and is absent from the latest review of that feature, dating it at that latest review, and MUST count a finding present in the latest review as open
- **FR-002**: The system MUST count separately the resolved blockers raised by product rules (PRD) and by contradiction rules (CON)
- **FR-003**: When a member who is not a viewer asks, the system MUST list up to five resolved blockers or warnings without an answer, newest first
- **FR-004**: When a member who is not a viewer answers yes, probably or no for a resolved finding, the system MUST keep the first answer, and MUST refuse a finding that is not resolved, a value outside those three, and anyone who is not a member of that company
- **FR-005**: The system MUST weigh yes as 1 and probably as 0.5 and no as 0, over resolved blockers with an answer
- **FR-006**: Where no blocker has an answer, the system MUST NOT estimate hours; otherwise it MUST show a range from the weighted blockers times a low and a high assumption passed to the report, and MUST say that blockers without an answer add nothing
- **FR-007**: The system MUST leave excluded companies out of every figure and MUST NOT let anyone signed in read the answers or the derived views
- **FR-008**: Where the report is given a company, the system MUST print only the value section for that company
- **FR-009**: The system MUST show, per month, the features first reviewed and the average blockers of that first review, marked not conclusive under 30 features

- **FR-010**: When a resolved finding is pending, the system MUST show one small card with the three answers, only after a few seconds, never over the sidebar and never together with the survey on a narrow screen, and MUST keep it away for a day after an answer and for three days after it is closed, without ever blocking the page or showing an error

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % of the figures in the value section can be recomputed by hand from the reviews in the test database
- **SC-002**: 0 hour estimates are printed without the assumption that produced them and without at least one answer behind them
- **SC-003**: A client's report contains no figure from another company in 100 % of the runs of the tests

## Assumptions

- The count says what was caught, not what it was worth: hours per blocker are an assumption (default 4 to 16) to be replaced with the client's own
- A finding removed by a waiver or a baseline can count as resolved, because the review no longer reports it; the owner reads the open blockers next to it
- The start of implementation is not recorded anywhere, so every resolved finding counts as caught before code; the recorded answer to the question is what says whether it would have shipped
- The wording shown on the card is the message the review produced when it first found the problem
