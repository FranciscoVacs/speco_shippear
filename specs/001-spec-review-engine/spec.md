# Feature Specification: Spec Review Engine

**Feature Branch**: `001-spec-review-engine`

**Created**: 2026-10-14

**Status**: Implemented (retroactive specification of the first version)

**Goals**: G-1

**Input**: User description: "Review Spec Kit specs like code, before any code is written"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review a feature from the command line (Priority: P1)

An engineer points the tool at a feature folder or a repository and reads a list of findings, one per line, each with a
severity, a location and a short explanation.

**Why this priority**: Without a readable review nothing else in the product has value.

**Independent Test**: Run the tool on the example repository and check that every finding line names a severity, a file and a line.

**Acceptance Scenarios**:

1. **Given** a repository that contains specs/003-x/spec.md, **When** the engineer runs the tool on the repository root, **Then** the tool reviews the active feature and prints one finding per line
2. **Given** a folder without spec.md, **When** the engineer runs the tool on it, **Then** the tool exits with code 2 and names the path it searched
3. **Given** a feature whose review contains a blocker, **When** the engineer runs the tool with the default fail-on option, **Then** the tool prints the blocker and exits with code 1
4. **Given** any feature, **When** the engineer asks for the JSON report or the Markdown report, **Then** the tool prints the same findings in that format with their severity, location and rule

---

### User Story 2 - Find requirements nobody will implement (Priority: P1)

A reviewer learns which requirements have no counterpart in the plan or the tasks, and which tasks answer to no requirement.

**Why this priority**: A requirement without a task is simply not built, and work without a requirement is built unasked.

**Independent Test**: Run the tool on the example repository and compare against the planted gaps.

**Acceptance Scenarios**:

1. **Given** a requirement that no task or plan step mentions, **When** the tool reviews the feature, **Then** it reports a coverage gap naming the requirement and its line in spec.md
2. **Given** a task that introduces concepts no requirement mentions, **When** the tool reviews the feature, **Then** it reports possible scope creep naming the task and its line in tasks.md
3. **Given** a repository that never cites requirement ids in its tasks, **When** the tool finds an inferred gap, **Then** the gap is reported as a warning and not as a blocker

---

### User Story 3 - Find requirements that cannot be verified (Priority: P2)

A product manager learns which requirements are ambiguous, untestable or without acceptance criteria, and which contradict each other.

**Why this priority**: These are the requirements where the agent silently picks a default nobody chose.

**Independent Test**: Run the tool on the example repository and check each planted quality defect is reported.

**Acceptance Scenarios**:

1. **Given** a requirement that says "fast" without a number, **When** the tool reviews the spec, **Then** it reports the requirement as not testable (FR-006)
2. **Given** two requirements that expire the same item after 7 days and after 30 days, **When** the tool reviews the spec, **Then** it reports a blocking contradiction naming both (FR-007)
3. **Given** a user story without acceptance scenarios, **When** the tool reviews the spec, **Then** it reports the story

---

### User Story 4 - Understand and trust a finding (Priority: P2)

A user learns what each rule means, why it matters and how to fix it, and how much to trust it.

**Why this priority**: A report nobody understands is ignored.

**Independent Test**: Ask the tool to explain every rule it can emit.

**Acceptance Scenarios**:

1. **Given** a rule id from a report, **When** the user asks the tool to explain it, **Then** the tool prints what it detects, why it matters, how to fix it and an example

---

### User Story 5 - Trust the tool with my repository (Priority: P2)

A team lead runs the tool on a private repository and needs to know it only reads, stays offline unless told otherwise, and sends a model only what it must.

**Why this priority**: Teams will not point a review tool at their specs if it can change files or leak them.

**Independent Test**: Run the tool on a read-only copy of the example repository with the network disabled and confirm it completes.

**Acceptance Scenarios**:

1. **Given** a repository whose files are read-only, **When** the tool reviews it, **Then** the review completes and no file in the repository has changed (FR-009)
2. **Given** no model configured, **When** the tool reviews a feature, **Then** it completes without opening any network connection
3. **Given** a model configured, **When** the tool reviews a feature whose requirements the text comparison already resolved, **Then** the tool sends the model nothing for those requirements and sends only the unresolved ones

---

### Edge Cases

- What happens when plan.md or tasks.md is missing?
- How does the tool treat HTML comments and code fences inside the markdown files?
- What happens when a task cites a requirement id that does not exist?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the user runs the tool on a feature folder or a repository root, the system MUST locate spec.md, plan.md and tasks.md and parse them into requirements, user stories, plan items and tasks
- **FR-002**: If spec.md cannot be found, then the system MUST exit with code 2 and a message that names the path searched
- **FR-003**: When a requirement has no counterpart in the plan or the tasks, the system MUST report a coverage gap with the requirement id and its file and line
- **FR-004**: While the repository does not cite requirement ids in its plan or tasks, the system MUST report an inferred coverage gap with the warning severity
- **FR-005**: When a task or plan step introduces concepts that no requirement mentions, the system MUST report possible scope creep with its id and location
- **FR-006**: When a requirement uses a quality attribute without a numeric threshold, the system MUST report that the requirement is not testable
- **FR-007**: When two requirements on the same topic state different values in the same unit, the system MUST report a contradiction as a blocker
- **FR-008**: When a user story has no acceptance scenarios, the system MUST report the story
- **FR-009**: The system MUST NOT modify any file in the reviewed repository
- **FR-010**: The system MUST print each finding on one line with its severity, location, rule and message
- **FR-015**: Where the user asks for another format, the system MUST print the same findings as JSON or as Markdown
- **FR-011**: If any finding reaches the severity chosen with the fail-on option, then the system MUST exit with code 1
- **FR-012**: While no model is configured, the system MUST NOT make any network request
- **FR-013**: When the user asks to explain a rule, the system MUST print what it detects, why it matters and how to fix it
- **FR-014**: Where a model is configured, the system MUST send it only the requirements and tasks the text comparison could not resolve

### Key Entities

- **Requirement**: an FR or SC identifier, its text and its location
- **Finding**: a rule, a severity, the affected identifiers, a location and a message
- **Report**: the findings of one feature with counts and metrics

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the example repository the tool reports every planted defect listed in expected.json and none of the forbidden findings
- **SC-002**: Every rule the tool can emit has an entry in the rule catalog
- **SC-003**: A review of a feature with 17 requirements and 48 tasks completes in under 2 seconds
- **SC-004**: On the three implemented features of the real reference repository the tool reports 0 blockers

## Assumptions

- The reviewed repository follows the file layout and identifier formats that Spec Kit generates
- Spec Kit does not link requirements to tasks, so coverage is inferred from text unless identifiers are cited
