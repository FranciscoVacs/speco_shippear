# Feature Specification: Decided numbers reach product

**Feature Branch**: `031-decided-numbers-reach-product`

**Created**: 2026-10-24

**Status**: Draft

**Goals**: G-4, G-5, G-19

**Decisions**: D-012

**Input**: User description: "In the experiment of docs/40 both agents noticed that the decision behind the referral cap does not state the number, and the warning about a moved number reached the developer, never the person who decides. A decision states the numbers it fixes; a spec that disagrees is blocked; a change of a decided number says which decision it reopens; and a pull request that moves a decided number in the code waits for a person in Speco."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A decision states the numbers it fixes (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a decision that fixes 021/FR-008 at 10 and a rule that states 10, **When** the feature is reviewed, **Then** there is no finding about it (FR-001)
2. **Given** the same decision and a rule that states 15, **When** the feature is reviewed, **Then** a blocker names the decision, its number and the rule (FR-002)

### User Story 2 - A moved number says which decision it reopens (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a rule fixed by a decision, **When** a bound line of code holds another number, **Then** the reason of the broken rule names the decision (FR-003)
2. **Given** a rule fixed by a decision, **When** an agent changes its number, **Then** the answer lists the decision and says a person has to decide again (FR-004)

### User Story 3 - A pull request that moves a decided number waits for a person (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a repository a company reads and a pull request that only moves a decided number in the code, **When** the pull request is reviewed, **Then** the version of that feature with the numbers of the code waits for a decision and the check is pending (FR-005)
2. **Given** that version, **When** a person opens it in Speco, **Then** it shows each moved number, the number the rule states and where it is (FR-006)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Where a decision states the numbers it fixes as `<feature>/<id> = <number>`, the system MUST read them as part of the decision
- **FR-002**: When a rule fixed by an accepted decision does not state the number the decision fixes, the system MUST report a blocker that names the decision, its number and the rule
- **FR-003**: When a bound line of code breaks a rule fixed by a decision, the system MUST name that decision in the reason
- **FR-004**: When a change to a requirement moves a number that an accepted decision fixes, the system MUST list that decision and say that a person has to decide again
- **FR-005**: When a pull request in a repository a company reads moves a decided number in the code, the system MUST keep the check «Speco · decisión» pending until a person decides that version of the feature
- **FR-006**: When a person opens the version a pull request proposes, the system MUST show each decided number the pull request moves, the number the rule states and the file and line

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On this repository, D-015 states the referral numbers and the review of 021 reports 0 findings about them
- **SC-002**: A pull request that raises the referral cap in the code leaves the check pending in 100% of the runs of the bridge test

## Assumptions

- The numbers of a decision live in `product/decisions.md`, in a `**Fixes**:` line of the decision, separated by commas.
- The version a person decides is the one of the feature in the pull request; the moved numbers are part of what is decided, so a version with other numbers is a new version.
