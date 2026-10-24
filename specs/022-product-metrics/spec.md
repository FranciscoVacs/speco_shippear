# Feature Specification: Product Metrics

**Feature Branch**: `022-product-metrics`

**Created**: 2026-10-16

**Status**: Implemented

**Goals**: G-16, G-14, G-15

**Decisions**: D-016, D-014, D-011

**Input**: User description: "Have the go to market metrics ready before the first customers: buyer persona, journey, CAC, time to value, LTV, retention, churn, product market fit and the Sean Ellis test, so that whenever we launch there is a report to read"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A report I can read the day after launch (Priority: P1)

The owner of the service runs one command and reads the month: how many companies arrived, how many reached a first result in five minutes, how long it took, who stayed and who left.

**Why this priority**: Without it nothing in the go to market plan (docs/24) can be validated, and every experiment E1 to E7 depends on it.

**Independent Test**: Create companies with known dates and results in a test database, run the report, compare the numbers by hand.

**Acceptance Scenarios**:

1. **Given** companies created in a month, **When** the report runs, **Then** it shows how many reached a first result, how many in five minutes or less, and the median and 90th percentile of the time to value (FR-001)
2. **Given** a ratio over fewer than 30 companies, **When** the report prints it, **Then** it marks it as not conclusive and shows the sample size (FR-002)
3. **Given** a company marked as excluded, **When** the report runs, **Then** that company is in no number (FR-003)
4. **Given** an empty database, **When** the report runs, **Then** it prints "no data" where there is nothing, and never an error or a made up number (FR-002)
5. **Given** a company that only opened the app, **When** the report measures retention and churn, **Then** it counts a company as active only for a review, a finished job, an approval, a decision or a use of the model (FR-010)
6. **Given** a signed in person, **When** they try to read the capture tables or the derived views, **Then** the database refuses (FR-011)

---

### User Story 2 - Know where each person came from (Priority: P1)

The owner sees activation by door and by channel, so the plan can be corrected where the numbers say so.

**Why this priority**: The go to market doc bets that one door brings volume and the other brings revenue; only this split can say so.

**Independent Test**: Record two channels for two people, create their companies, read the split.

**Acceptance Scenarios**:

1. **Given** a signed in person, **When** the web app tells the service the channel and the door, **Then** the first one is kept and a later one changes nothing (FR-004)
2. **Given** companies with different channels, **When** the report runs, **Then** it lists sign-ups and activations per door and channel (FR-005)

---

### User Story 3 - Ask the Sean Ellis question (Priority: P2)

A person who uses the product is asked how disappointed they would be to lose it, and the owner reads the share of "very disappointed".

**Why this priority**: It is the earliest honest signal of product market fit, but it is only worth reading with enough answers.

**Independent Test**: Record 38 answers and read the share and the verdict.

**Acceptance Scenarios**:

1. **Given** a member of a company, **When** they answer the question, **Then** one answer per person per quarter is kept (FR-006)
2. **Given** answers, **When** the report runs, **Then** it shows the share of "very disappointed", ignores people who no longer use the product, and says whether it passes 40 % only when there are at least 30 answers (FR-007)

---

### User Story 4 - What it costs to get a company (Priority: P2)

The owner sees the cost of acquiring a company that reached a first result, and what a lifetime value would be under a price they are considering.

**Why this priority**: The free plan costs real money (spec 020); the owner needs to know the cost per activated company before setting a price.

**Independent Test**: Enter a marketing spend, create companies, read the cost per activated company.

**Acceptance Scenarios**:

1. **Given** the marketing spend of a month, **When** the report runs, **Then** it adds the SMS and the model cost of the new companies and divides by the companies that reached a first result (FR-008)
2. **Given** no price, **When** the report runs, **Then** it says lifetime value cannot be calculated, and with a price and a measured churn it shows it as a scenario, never as a result (FR-009)

---

### User Story 5 - The app captures it by itself (Priority: P1)

A person who arrives through a tagged link is recorded with that channel, and a person who has used the product for a while is asked the Sean Ellis question once a quarter without being interrupted.

**Why this priority**: Without it the capture endpoints stay empty and the channel split and the product market fit signal never exist.

**Independent Test**: Open the app with a tagged link, sign in and create a company; later open it as a member for whom the service says it is time.

**Acceptance Scenarios**:

1. **Given** a link with a channel, **When** the person signs in, **Then** the first channel and door are handed to the service once and dropped from the browser (FR-004)
2. **Given** a new account with no kept channel, **When** it creates its first company, **Then** it is recorded as direct (FR-012)
3. **Given** the service says it is time to ask, **When** the person opens the app, **Then** a card with the question appears that does not block the page and cannot be sent without an answer (FR-006, FR-013)
4. **Given** the card, **When** the person chooses later, **Then** it stays away for two weeks without asking the service again (FR-013)

---

### Edge Cases

- What happens when nobody was active in the previous month, so there is no churn base?
- What happens when a company reaches its first result before the week a retention measure needs has ended?
- What happens when the same person answers the question twice in a quarter?
- What happens when a person invents a channel with spaces or symbols?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the report runs for a month, the system MUST show the companies created, the share that reached a first result, the share that did so within five minutes, and the median and 90th percentile of the time to value
- **FR-002**: If a ratio has fewer than 30 companies behind it, then the system MUST print the sample size and mark it as not conclusive, and where there is no data the system MUST say so instead of showing a number
- **FR-003**: Where a company is listed as excluded, the system MUST leave it out of every figure
- **FR-004**: When a signed in person reports the channel and the door they came from, the system MUST keep the first report and ignore later ones, and MUST refuse a channel that is not a short lowercase label
- **FR-005**: The system MUST show sign-ups, first results and first results within five minutes for each door and channel
- **FR-006**: When a member answers the Sean Ellis question, the system MUST keep at most one answer per person per quarter
- **FR-007**: The system MUST show the share of "very disappointed" among the people who still use the product, and MUST give a verdict about the 40 % threshold only with at least 30 answers
- **FR-008**: The system MUST calculate the cost per company that reached a first result as marketing spend plus verification and model cost, divided by those companies, with the unit prices given as visible assumptions
- **FR-009**: Where no price is given or no churn was measured, the system MUST NOT show a lifetime value; otherwise it MUST show it labelled as a scenario
- **FR-010**: The system MUST count a company as active only for a recorded action: a review, a finished job, an approval, a decision or a use of the model, and MUST report retention in weeks 1 and 4 and the monthly share of active companies that stopped
- **FR-011**: The system MUST NOT let anyone signed in read the capture tables or the derived views
- **FR-012**: When a person creates their first company without a kept channel, the system MUST record them as direct, and MUST NOT record an existing account as direct
- **FR-013**: When the service says it is time, the system MUST show the question as a card that does not block the page, and MUST say it is time only to a member who is not a viewer, whose company had a first result at least 7 days ago with at least 2 active days, and who has not answered this quarter

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The report for a month runs in under 10 seconds on 10 000 companies
- **SC-002**: 100 % of the figures in the report can be recomputed by hand from the tables in the test database
- **SC-003**: 0 ratios are printed over fewer than 30 companies without the not conclusive mark
- **SC-004**: A person who opens a tagged link and signs in has the channel recorded in 100% of the runs of the browser check

## Assumptions

- Without billing there is no cancellation: churn means stopping use, and lifetime value is a scenario until someone pays
- The price of a credit and of a verification SMS are assumptions passed to the report, to be replaced by the real ones
- Visits before sign up (traffic, landing conversion) live in a web analytics tool, not here, because nobody has an account yet to attach them to
- The question is only asked of someone who had a first result at least a week ago, was active on at least two days and is not a viewer, because asking earlier measures politeness, not value
- A person who signed up without any link is recorded as direct; accounts that existed before this feature stay unknown
