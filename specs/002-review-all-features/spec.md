# Feature Specification: Review All Features

**Feature Branch**: `002-review-all-features`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-1, G-2

**Input**: User description: "Review every feature of a repository with one command"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review every feature with one command (Priority: P1)

A tech lead who keeps many features under specs/ wants one command that reviews all of them and shows where the problems are.

**Why this priority**: Repositories hold many features; reviewing them one by one hides which feature needs attention first.

**Independent Test**: Run the tool with the all option on a repository that has three features and read one summary table.

**Acceptance Scenarios**:

1. **Given** a repository with the features 001, 002 and 003 under specs/, **When** the tech lead runs the tool with the all option on the repository root, **Then** the tool reviews the three features in name order and prints each review
2. **Given** the three reviews finished, **When** the tool prints its summary table, **Then** the table has one row per feature with its blocker, warning and suggestion counts
3. **Given** a repository without any specs/ directory, **When** the tech lead runs the tool with the all option, **Then** the tool exits with code 2 and names the directory it searched
4. **Given** a path that is itself a feature folder, **When** the tech lead runs the tool with the all option, **Then** the tool reviews that single feature

---

### User Story 2 - Get one verdict for automation (Priority: P2)

A release manager wants a single exit code that says whether any feature of the repository has a serious problem.

**Why this priority**: Automation needs one answer, not one per feature.

**Independent Test**: Run the tool with the all option on a repository where one of three features has a blocker and read the exit code.

**Acceptance Scenarios**:

1. **Given** one feature with a blocker among three, **When** the release manager runs the tool with the all option and the default fail-on setting, **Then** the exit code is 1
2. **Given** a feature whose files cannot be parsed, **When** the tool reviews all features, **Then** the tool reports that feature as failed, still reviews the others and exits with code 2
3. **Given** the min-severity option set to blocker, **When** the tool prints the reviews, **Then** each listing hides the lower severities and the summary table still counts every finding

---

### User Story 3 - Feed all reviews to other tools (Priority: P3)

A developer wants one JSON document with the reports of all features to feed a dashboard.

**Why this priority**: Dashboards and bots consume one document more easily than many.

**Independent Test**: Run the tool with the all and JSON options and parse the output as one JSON document.

**Acceptance Scenarios**:

1. **Given** a repository with three features, **When** the developer asks for the JSON format with the all option, **Then** the output is one JSON document with a schema version and a list holding the three reports
2. **Given** the HTML format with the all option, **When** the developer runs the tool, **Then** the tool exits with code 2 and explains that HTML export reviews one feature at a time
3. **Given** a repository with three features, **When** the developer runs the tool without the all option, **Then** the output is identical to what the tool printed before this feature existed

---

### Edge Cases

- What happens when one feature has no plan or tasks yet?
- How does the tool order features whose names do not start with a number?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the user runs the tool with the all option on a repository root, the system MUST review every directory under specs/ that contains spec.md, in name order
- **FR-002**: If no feature is found, then the system MUST exit with code 2 and a message that names the specs directory searched
- **FR-003**: When every feature has been reviewed, the system MUST print a summary table with one row per feature showing its blocker, warning and suggestion counts
- **FR-004**: While the path given is itself a feature folder, the system MUST review that single feature when the all option is present
- **FR-005**: Where the JSON format is chosen together with the all option, the system MUST print one document with a schema version and a list of the feature reports
- **FR-006**: If any reviewed feature has a finding at or above the fail-on severity, then the system MUST exit with code 1
- **FR-007**: If a feature cannot be parsed, then the system MUST report that feature as failed, continue with the remaining features and exit with code 2
- **FR-008**: Where the HTML format is chosen together with the all option, the system MUST exit with code 2 and explain that HTML export reviews one feature at a time
- **FR-009**: Where the min-severity option is present, the system MUST hide lower severities from each listing without changing the counts in the summary table
- **FR-010**: While the all option is absent, the system MUST print exactly the output it printed before this feature existed

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reviewing the four features of this repository with the all option completes in under 5 seconds
- **SC-002**: With the all option, the exit code equals the worst result among the features in 100% of the tested combinations

## Assumptions

- Features live under specs/ as Spec Kit generates them
- The per-feature review is unchanged by this feature
