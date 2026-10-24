# Implementation Plan: Auditable Approvals

**Branch**: `010-auditable-approvals` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

Members with a role and a hashed token are listed in a file of the repository. An approval log is an append-only file in which each
entry stores who decided, when, the decision and the hash of the spec files (FR-001), so a later change is shown as stale (FR-002).
Each entry also stores the hash of the previous one, and a verification walks the chain; appending to a broken chain is refused
(FR-003). The policy refuses an approval with blockers unless there is an override with a reason (FR-004) and refuses a person who
is not an approver (FR-005). The local server exposes the log over HTTP with bearer tokens, and a Slack endpoint verifies the
signature and the age of each click before it records a decision (FR-006). A Jira sync writes a cache file that reviews read
without any network call (FR-007).

## Technical Context

**Language/Version**: Python 3.11 with the standard library only, TypeScript 5 with React 18 for the screens

**Storage**: JSON lines and JSON files under .specreview/ in the repository

**Testing**: pytest with real HTTP servers, and a real browser against a real server

**Project Type**: command line tool, local server and web application

## Project Structure

```text
src/specreview/
├── approvals.py
├── members.py
├── slack.py
└── jira.py
web/src/decision/ApprovalPanel.tsx
```
