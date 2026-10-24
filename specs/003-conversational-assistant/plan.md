# Implementation Plan: Conversational Assistant

**Branch**: `003-conversational-assistant` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

The local server gains a chat endpoint that streams the model reply as server-sent events (FR-001) with a system prompt built
from the review findings and the numbered feature files (FR-002). A status endpoint reports whether a model is configured so
the interface can explain how to turn it on (FR-003). The assistant only proposes text and never writes files (FR-004).
Provider failures are reduced to a generic message (FR-005). The interface adds a chat built with assistant-ui, an action on
each finding that prefills the question without sending it (FR-006), a demo badge (FR-007), and keeps the conversation across tabs (FR-010)
while clearing it when the feature changes (FR-012). A prefilled question waits for the user (FR-011). The server rejects foreign hosts and origins (FR-008) and bounds the history (FR-009).

## Technical Context

**Language/Version**: Python 3.11+ and TypeScript 5 with React 18

**Primary Dependencies**: assistant-ui for the chat interface; an optional model adapter on the server

**Testing**: pytest with a fake model; Playwright against the demo provider

**Project Type**: web-service with a single-page interface

**Performance Goals**: first characters visible within 1 second with the demo provider (SC-001)

## Constitution Check

III Read-only: PASS (FR-004, SC-002). I Offline by default: PASS, the assistant exists only when a model is configured.

## Project Structure

```text
src/specreview/
├── assistant.py   # prompt, history limits
├── llm.py         # chat streaming, demo provider
└── server.py      # chat and status endpoints, host and origin checks
web/src/assistant/ # chat interface
tests/test_assistant.py
```

## Complexity Tracking

None.
