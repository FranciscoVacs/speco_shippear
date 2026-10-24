# Feature Specification: Verification Trace

**Feature Branch**: `040-verification-trace`

**Created**: 2026-10-24

**Status**: Implemented

**Goals**: G-2, G-4

**Decisions**: D-001, D-019

**Input**: User description: "Let a team see which requirements a test, a property or a proof checks, and which requirements nothing checks, without claiming that anything is proved"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what checks each requirement (Priority: P1)

An engineer wants to know which requirements of a feature have a test, a property or a proof behind them, and which have none.

**Why this priority**: A decided requirement that nothing checks is the gap between what was decided and what is built.

**Independent Test**: Add one comment line above a test and run the verification command.

**Acceptance Scenarios**:

1. **Given** a test with a comment line naming a feature and a requirement, **When** the command runs, **Then** it lists that requirement as checked, at the level the line states, with the file and the line (FR-001)
2. **Given** a requirement cited by a test and by a property, **When** the command runs, **Then** it reports the strongest level (FR-002)
3. **Given** a repository where no test cites a requirement, **When** the command runs, **Then** it explains how to start and exits with code 0 (FR-006)
4. **Given** a requirement worded as a «never» or an «at most» that no property or proof cites, **When** the command runs, **Then** it points it out as a candidate for a property (FR-007)

---

### User Story 2 - Trust the trace (Priority: P1)

A reviewer wants a trace that cannot quietly rot or overstate what is checked.

**Why this priority**: A trace that points at nothing, or that says «proved» about a plain test, is worse than no trace.

**Independent Test**: Cite a requirement that does not exist and run the command.

**Acceptance Scenarios**:

1. **Given** a line that names a feature, a requirement or a level that does not exist, **When** the command runs, **Then** it reports the line as broken and exits with code 1 (FR-003)
2. **Given** a tag quoted inside a string or written after code on the same line, **When** the command runs, **Then** it does not count it (FR-004)
3. **Given** any output of the command or of the pull request comment, **When** it names a check, **Then** it names the level of the check and never says a requirement is proved (FR-005)

---

### User Story 3 - See it where the change happens (Priority: P2)

A product owner reads a pull request that changes a requirement and wants to know whether anything checks it.

**Why this priority**: The moment a requirement changes is the moment its check may stop being true.

**Independent Test**: Change a requirement in a repository that uses the tags and run the diff command.

**Acceptance Scenarios**:

1. **Given** a pull request that changes a requirement in a repository that uses the tags, **When** the comment is built, **Then** it names what checks the requirement and asks to review it, or says that nothing checks it (FR-008)
2. **Given** a repository that uses no tags, **When** the comment is built, **Then** it says nothing about verification (FR-009)
3. **Given** the command, **When** the person asks for another format, **Then** it prints the same trace as Markdown or as JSON (FR-010)

### Edge Cases

- A test file in a language other than Python carries the line after `//` or `--` (FR-001)
- Two features share a number prefix, so the line does not name one feature (FR-003)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a comment line of a test file names a feature and a requirement after the word verifies, the system MUST list that requirement as checked at the level the line states, with the file and the line
- **FR-002**: When a requirement is cited at two or more levels, the system MUST report the strongest of them
- **FR-003**: If a tag names a feature, a requirement or a level that does not exist, then the system MUST report it as broken and exit with code 1
- **FR-004**: The system MUST NOT count a tag that is quoted in a string or that follows code on the same line
- **FR-005**: The system MUST NOT say that a requirement is proved, because it only names the level of the check that cites it
- **FR-006**: While no test cites any requirement, the system MUST explain how to start and exit with code 0
- **FR-007**: When a requirement is worded as a never or an at most and no property or proof cites it, the system MUST point it out as a candidate for a property
- **FR-008**: When a pull request changes a requirement in a repository that uses the tags, the system MUST name what checks the requirement and ask to review it, or say that nothing checks it
- **FR-009**: While the repository uses no tags, the system MUST NOT say anything about verification in the pull request comment
- **FR-010**: Where the person asks for another format, the system MUST print the same trace as Markdown or as JSON

### Key Entities

- **Tag**: a comment line above a test that names a feature, one or more requirements and a level (test, property or formal)
- **Trace**: the requirements of every feature, each with the checks that cite it and the strongest level

## Success Criteria *(mandatory)*

- **SC-001**: The command reports a repository of 300 requirements in less than 5 seconds
