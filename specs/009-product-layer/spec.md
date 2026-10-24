# Feature Specification: Product Layer

**Feature Branch**: `009-product-layer`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-1, G-4

**Decisions**: D-001, D-003

**Input**: User description: "Validate a spec against the goals and decisions the product already made, not only against itself"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch a feature that contradicts a decision (Priority: P1)

A product owner is told, before any code exists, that a spec goes against a decision the team already took.

**Why this priority**: "We already discussed this and said no" is the most expensive rework there is.

**Independent Test**: Review a spec that cites a superseded decision and one that uses a term a decision rules out.

**Acceptance Scenarios**:

1. **Given** a spec that cites a decision that is superseded, **When** it is reviewed, **Then** a blocker names that decision (FR-001)
2. **Given** a requirement that uses a term an accepted decision rules out, **When** it is reviewed, **Then** a warning names the requirement and the decision (FR-002)

---

### User Story 2 - Trace features to goals (Priority: P1)

A founder sees which goals have features, which goals nobody builds and which features answer to no goal.

**Why this priority**: A goal without a feature is a promise without an owner, and a feature without a goal is scope that crept in.

**Independent Test**: Run the goal report on a repository with one uncovered goal.

**Acceptance Scenarios**:

1. **Given** a repository with goals, **When** a spec declares no goal, **Then** a warning says the feature answers to no declared goal (FR-003)
2. **Given** a goal that no feature cites, **When** the goal report runs, **Then** the goal is listed as built by nobody (FR-004)
3. **Given** a spec that cites a goal that does not exist, **When** it is reviewed, **Then** a warning names the missing goal (FR-005)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a spec cites a decision that is superseded or rejected, the system MUST report a blocker that names the decision
- **FR-002**: When a requirement uses a term that an accepted decision rules out, the system MUST report a warning that names the requirement and the decision
- **FR-003**: Where the repository defines goals, the system MUST report a warning for a spec that declares no goal
- **FR-004**: When the goal report runs, the system MUST list every goal that no feature cites
- **FR-005**: When a spec cites a goal or a decision that does not exist, the system MUST report a warning that names it
- **FR-006**: Where the repository has no product folder, the system MUST NOT report any product finding

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of the tested repositories without a product folder, the review output is identical to the output before this layer

## Assumptions

- Teams keep goals and decisions as files in the repository (source: the pilot teams already keep ADRs there)
