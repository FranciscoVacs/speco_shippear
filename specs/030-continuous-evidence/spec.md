# Feature Specification: Continuous evidence

**Feature Branch**: `030-continuous-evidence`

**Created**: 2026-10-24

**Status**: Draft

**Goals**: G-9, G-19

**Decisions**: D-019

**Input**: User description: "The experiment of docs/40 left three gaps in the evidence behind «verified»: a run that could not start was recorded as broken, a verification stays valid for a rule after the code changes, and binding decided numbers by hand does not scale. Record one run of the whole suite for every rule, never confuse an environment error with a broken rule, and propose the bindings."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An error of the environment is not a broken rule (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a verify command whose runner is not installed, **When** a rule is verified, **Then** the run is recorded as an error with its output (FR-001)
2. **Given** a rule verified before, **When** a later run of it is an error, **Then** the rule stays verified (FR-002)

### User Story 2 - One run of the suite verifies every rule (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a JUnit report where the tests citing a rule passed, **When** the report is imported, **Then** the rule is verified on the current commit (FR-003)
2. **Given** a JUnit report where one test citing a rule failed, **When** the report is imported, **Then** the rule is failing (FR-004)
3. **Given** a rule whose citing tests are not in the report, **When** the report is imported, **Then** nothing is recorded for that rule (FR-005)
4. **Given** a suite command configured with a placeholder for the report, **When** every rule is verified, **Then** the suite runs once and its report is imported (FR-006)
5. **Given** a report where a test that cites a rule failed, **When** the report is imported in a pull request, **Then** the output names the rule and its text and the exit code is 1 (FR-007)

### User Story 3 - The agent proposes the bindings of decided numbers (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a rule that states 10 and a line of code that holds 10 next to an identifier sharing a word with the rule, **When** bindings are suggested, **Then** that line is proposed as a TOML binding and no file is written (FR-008)
2. **Given** a proposed binding, **When** its pattern is searched in its file, **Then** its first match is the proposed line (FR-009)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a verification run ends without running any test, the system MUST record it as an error with its output
- **FR-002**: While the latest run of a rule is an error, the system MUST keep the state that the previous runs of that rule give it
- **FR-003**: When a JUnit report is imported and every test that cites a rule passed in it, the system MUST record that rule as verified on the current commit
- **FR-004**: When a JUnit report is imported and a test that cites a rule failed in it, the system MUST record that rule as failing
- **FR-005**: If none of the tests that cite a rule appear in an imported report, then the system MUST NOT record a run for that rule
- **FR-006**: Where the repository configures a suite command with a placeholder for the report, the system MUST run the suite once and import its report to verify every rule
- **FR-007**: When an imported report breaks a rule, the system MUST print that rule with its text and MUST exit with code 1
- **FR-008**: When bindings are suggested, the system MUST propose for each rule that states a number the lines of code that hold that number next to an identifier sharing a word with the rule, as TOML, without writing any file
- **FR-009**: The system MUST propose a binding only when the first match of its pattern in the file is the proposed line

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On this repository the suggestions include the bindings of 021/FR-005, 021/FR-008, 021/FR-009 and 021/FR-013 that a person wrote
- **SC-002**: Importing a JUnit report of 700 tests takes under 5 seconds

## Assumptions

- The report follows the JUnit XML that pytest writes (`--junitxml`): `classname` is the dotted module (and class) and `name` the test, with parameters in brackets.
- A suggestion is a proposal for a person to review in the pull request (D-012); the system never writes `specreview.toml` by itself.
