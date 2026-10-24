# Tasks: Conversational Assistant

**Input**: Design documents from `/specs/003-conversational-assistant/`

## Phase 1: Setup

- [X] T001 Write the backend and interface contract in docs/06-assistant-contract.md

## Phase 2: Foundational

- [X] T002 Reject foreign hosts and origins and require a JSON content type in src/specreview/server.py (FR-008)
- [X] T003 [P] Keep the latest 40 messages and cut each to 8000 characters in src/specreview/assistant.py (FR-009)

## Phase 3: User Story 1 - Ask the assistant about a finding (Priority: P1)

- [X] T004 [P] [US1] Test the streamed events, the prompt content and the history limits in tests/test_assistant.py (FR-001, FR-002, FR-009)
- [X] T005 [US1] Build the system prompt from the findings and the numbered files in src/specreview/assistant.py (FR-002)
- [X] T006 [US1] Stream the model reply as server-sent events in src/specreview/server.py and src/specreview/llm.py (FR-001)
- [X] T007 [US1] Add the chat interface with assistant-ui and the streaming adapter in web/src/assistant/AssistantPanel.tsx (FR-001)
- [X] T008 [US1] Add the ask-the-assistant action on each finding that writes the question in the message box without sending it in web/src/FindingRow.tsx (FR-006, FR-011)
- [X] T009 [US1] Test that a conversation leaves every file of the reviewed repository unchanged by comparing hashes in tests/test_assistant.py (FR-004, SC-002)

## Phase 4: User Story 2 - Know when the assistant is not available (Priority: P2)

- [X] T010 [US2] Report availability and the way to turn it on in src/specreview/server.py (FR-003)
- [X] T011 [US2] Reduce provider failures to a generic message in src/specreview/server.py (FR-005)
- [X] T012 [US2] Show the unavailable panel with the start command in web/src/assistant/AssistantPanel.tsx (FR-003)

## Phase 5: User Story 3 - Try the assistant without a model (Priority: P3)

- [X] T013 [US3] Add the demo provider that is never used as an analysis judge in src/specreview/llm.py and src/specreview/server.py (FR-007)
- [X] T014 [US3] Show the demo badge in the interface in web/src/assistant/AssistantPanel.tsx (FR-007)
- [X] T015 [US3] Keep the conversation across tab switches and clear it when the feature changes in web/src/App.tsx (FR-010, FR-012)

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T016 Measure the time to the first reply characters with the demo provider in the browser (SC-001)
