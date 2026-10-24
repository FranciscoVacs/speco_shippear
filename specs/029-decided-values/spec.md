# Feature Specification: Decided values

**Feature Branch**: `029-decided-values`

**Created**: 2026-10-24

**Status**: Draft

**Goals**: G-9, G-19

**Input**: User description: "Product decides numbers (a monthly cap, a reward, an expiry). Code holds them. Today the ledger says a rule is verified even when someone changed its number in the code after the last run, and tests often override the number to test the mechanism. Bind each decided number to the line of code that holds it and check it every time the ledger is built, without running tests, naming who changed it."

## Why

Experiment of 2026-10-24 (`docs/40-cursor-for-product-experiment.md`): a commit raised the referral monthly cap from 10 to 25 in the code and left the spec at 10. The ledger kept saying «verificada» for 021/FR-008 and 021/SC-003, because a verification counts for the text of a rule and not for the code, and because the test of FR-008 sets the cap to 2 to test the mechanism. Asked the same questions, an agent without Speco found the change by reading the code. A product person should not need to know what to ask: the ledger has to say it on its own.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See that a decided number changed in the code (Priority: P1)

A product person opens the ledger and sees that a rule they decided is broken because the code holds another number, and who changed it, without running tests and without asking.

**Acceptance Scenarios**:

1. **Given** a rule that states 10 and a binding to a line of code that holds 10, **When** the ledger is built, **Then** the binding reads 10 and the rule keeps its state (FR-001)
2. **Given** the same binding and the line now holds 25, **When** the ledger is built, **Then** the rule is failing and shows 10, 25, the file and the line (FR-002)
3. **Given** that drift in a git repository, **When** the ledger is built, **Then** it names the commit, the author and the date that last changed that line (FR-003)

### User Story 2 - Trust the binding itself (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a binding to a file that does not exist, **When** the ledger is built, **Then** the binding is reported as broken (FR-004)
2. **Given** a binding whose pattern matches nothing, **When** the ledger is built, **Then** the rule is not reported as verified even with a passing run (FR-005)

### User Story 3 - Know what else a change of a number touches (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a rule that states 20 credits bound to code that holds 20, and another rule of the same feature that states 200 credits, **When** the rule is changed to 30 credits, **Then** the answer lists the binding that still holds 20 and the rule that states 200 credits (FR-006)

### User Story 4 - Know how old a verification is (Priority: P3)

**Acceptance Scenarios**:

1. **Given** a run recorded two commits ago, **When** the ledger is built, **Then** the rule says its run is two commits old (FR-007)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Where the repository binds a rule to a line of code in specreview.toml with a file and a pattern that captures one number, the system MUST read that number every time it builds the ledger, without running any test
- **FR-002**: When the number a bound line holds is not one of the numbers the rule states, the system MUST mark the rule as failing and show the number the rule states, the number the code holds, and the file and line
- **FR-003**: When a bound number differs from the rule, the system MUST name the commit, the author and the date that last changed that line
- **FR-004**: If the bound file does not exist or the pattern matches nothing, then the system MUST report the binding as broken
- **FR-005**: While a binding of a rule is broken, the system MUST NOT report the rule as verified
- **FR-006**: When a change to a requirement moves a number, the system MUST list the bindings that still hold the old number and the other rules of the same feature that state a number in the same unit
- **FR-007**: When the latest verification of a rule ran on a commit other than the current one, the system MUST say how many commits ago it ran

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the referral monthly cap raised to 25 in the code and the spec still saying 10, the ledger reports 021/FR-008 as failing with the commit that raised it, in under 5 seconds and without running tests
- **SC-002**: Three builds of the ledger on the same commit report the same bound values

## Assumptions

- A binding is declared by a person or proposed by an agent in `specreview.toml`, and reviewed in the pull request like any other file. The system does not guess bindings.
- A number in the code matches the rule when it equals any number the rule states; units are not converted.
