# Feature Specification: Conversational Assistant

**Feature Branch**: `003-conversational-assistant`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-4

**Input**: User description: "A chat to refine requirements, clear ambiguities and close the gaps a review found"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask the assistant about a finding (Priority: P1)

A product manager looks at a finding they do not know how to fix and asks the assistant to propose a better requirement.

**Why this priority**: Finding a problem is half the work; the user needs help writing the fix.

**Independent Test**: Start the server with a model, open a finding, ask the assistant and read the streamed reply.

**Acceptance Scenarios**:

1. **Given** a review with a finding about an untestable requirement, **When** the product manager presses the ask-the-assistant action on that finding, **Then** the assistant opens with the question already written in the message box and nothing has been sent (FR-011)
2. **Given** the question is in the message box, **When** the product manager sends it, **Then** the reply appears word by word as the model produces it
3. **Given** a reply that proposes new requirement text, **When** the conversation continues, **Then** no file of the reviewed repository has changed (FR-004)
4. **Given** a question about a requirement, **When** the assistant answers, **Then** the model has received the findings of the review and the numbered text of the feature files
5. **Given** a conversation with more than 40 messages, **When** the user sends the next message, **Then** the server keeps only the latest 40 messages and cuts any message longer than 8000 characters

---

### User Story 2 - Know when the assistant is not available (Priority: P2)

A user opens the assistant on a server started without a model and learns how to turn it on instead of seeing an error.

**Why this priority**: A broken-looking tab drives users away from the whole product.

**Independent Test**: Start the server without a model and open the assistant tab.

**Acceptance Scenarios**:

1. **Given** a server started without a model, **When** the user opens the assistant, **Then** the interface explains that no model is configured and shows the command that turns it on (FR-003)
2. **Given** the model provider fails in the middle of a reply, **When** the failure happens, **Then** the user sees a readable error and no provider detail or credential appears in it
3. **Given** a web page served from another site, **When** that page sends a request to the local server, **Then** the server rejects the request (FR-008)

---

### User Story 3 - Try the assistant without a model (Priority: P3)

An evaluator wants to see the assistant working without an account or an API key.

**Why this priority**: Evaluation friction is the main adoption blocker for a new tool.

**Independent Test**: Start the server with the demo provider and send a message.

**Acceptance Scenarios**:

1. **Given** the server started with the demo provider, **When** the evaluator sends a message, **Then** a reply streams and the interface states that replies are examples and not from a model
2. **Given** a conversation in progress, **When** the evaluator switches to another tab and back, **Then** the conversation is still there, and it is cleared when the evaluator switches to another feature

---

### Edge Cases

- What happens when a conversation grows beyond what the model accepts?
- What happens when another website tries to reach the local server?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the user sends a message, the system MUST stream the reply to the browser as the model produces it
- **FR-002**: The system MUST give the model the findings of the review and the numbered text of the feature files as context
- **FR-003**: While no model is configured, the system MUST report the assistant as unavailable and tell the user how to turn it on
- **FR-004**: The system MUST NOT modify any file of the reviewed repository during a conversation
- **FR-005**: If the model provider fails during a reply, then the system MUST show a readable error without any provider detail or credential
- **FR-006**: When the user asks about a finding, the system MUST open the assistant with the question written in the message box
- **FR-011**: While a question the system wrote is in the message box, the system MUST wait for the user to send it
- **FR-007**: Where the demo provider is active, the system MUST state in the interface that the replies are examples and not from a model
- **FR-008**: If a request comes from a host or an origin that is not the local machine, then the system MUST reject it
- **FR-009**: When a conversation exceeds 40 messages or a message exceeds 8000 characters, the system MUST keep only the latest 40 messages and cut each message to 8000 characters
- **FR-010**: While the interface is open, the system MUST keep the conversation across tab switches
- **FR-012**: When the user switches feature, the system MUST clear the conversation

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the demo provider, the first characters of a reply appear in the interface within 1 second of sending
- **SC-002**: In 100% of the tested conversations the hash of every file in the reviewed repository is the same before and after

## Assumptions

- The server runs on the user's own machine and listens only on the local address
- A real model needs the user's own API key
