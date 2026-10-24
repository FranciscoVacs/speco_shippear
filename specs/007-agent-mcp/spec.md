# Feature Specification: Agent MCP Server

**Feature Branch**: `007-agent-mcp`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-3

**Decisions**: D-001, D-002

**Input**: User description: "A coding agent calls the reviewer to check its spec before it implements it"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The agent checks the spec first (Priority: P1)

A coding agent asks whether a feature can be implemented and gets the blockers it has to fix in the spec.

**Why this priority**: The consumer of the spec is increasingly an agent, and an agent that guesses builds the wrong thing.

**Independent Test**: Connect an MCP client to a repository with a known blocker and call the blockers tool.

**Acceptance Scenarios**:

1. **Given** a feature with a blocker, **When** the agent asks for the blockers, **Then** it receives the blockers and the answer that the feature cannot be implemented yet (FR-001)
2. **Given** a repository with a recorded baseline, **When** the agent reviews a feature, **Then** it sees the same findings as the pull request review (FR-002)
3. **Given** a requirement the agent is about to write, **When** it asks to check that text, **Then** it receives the EARS pattern and the issues found (FR-003)
4. **Given** a machine with only the standard library installed, **When** a client connects, **Then** the server answers its requests (FR-006)

---

### User Story 2 - Stop an implementation that cannot start (Priority: P2)

A developer who asks the agent to implement a blocked feature is told why it stops.

**Why this priority**: The check only changes behaviour if skipping it is hard.

**Independent Test**: Ask Claude Code to implement a feature with a blocker and read the message.

**Acceptance Scenarios**:

1. **Given** a feature with a blocker, **When** the user asks to implement it, **Then** the request is stopped and the blockers are shown (FR-004)
2. **Given** a repository that is not a Spec Kit project, **When** the user asks anything, **Then** nothing is stopped (FR-005)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the agent asks for the blockers of a feature, the system MUST return the blockers and whether the feature can be implemented
- **FR-002**: The system MUST apply the configuration, the baseline and the waivers of the repository to every answer
- **FR-003**: When the agent asks to check a requirement text, the system MUST return its EARS pattern and its issues
- **FR-004**: When the user asks to implement a feature that has blockers, the system MUST stop the request and show the blockers
- **FR-005**: If the repository is not a Spec Kit project, the system MUST NOT stop any request
- **FR-006**: The system MUST answer over standard input and output without any runtime dependency

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client completes the handshake and gets the blockers of a feature in at most 2 requests

## Assumptions

- Claude Code is the first agent client (source: the plugin mechanism it provides)
