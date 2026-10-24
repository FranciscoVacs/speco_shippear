# Implementation Plan: Activation in Five Minutes

**Branch**: `012-activation` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

A checklist component replaces the introduction dialog on the first sign in (FR-001) and is reopened from the help menu (FR-004). Each milestone
watches an event the product already emits, such as opening a feature, opening the decisions page, recording an approval or asking the agent, and
marks itself done (FR-002). The existing demo feature 003-team-invitations, which has a rule contradiction (CON001), is the sample (FR-003). The agent
gets a tool that turns a business need into a draft spec whose open questions become decisions, kept in memory until the person confirms
(FR-005, FR-006), with a template as the fallback when no model is configured (FR-007). A three step flow connects a repository, runs the first
review and offers the draft flow when there are no specs (FR-008, FR-009). The vocabulary change and the empty states are text only (FR-010, FR-011)
and the digest is rewritten with the same words (FR-012). No page gets a new permanent element (NFR-001).

## Technical Context

**Language/Version**: TypeScript 5 with React 18, Python 3.11 for the digest

**Storage**: browser storage for the checklist progress only

**Testing**: a real browser script that signs in with no saved state and follows the checklist, plus the existing Python tests for the digest

**Project Type**: web application

## Project Structure

```text
web/src/activation/store.ts
web/src/activation/Checklist.tsx
web/src/activation/milestones.ts
web/src/shell/HelpMenu.tsx
web/src/agent/demo/tools.ts
web/src/pages/ConnectRepo.tsx
web/src/i18n/es.ts
web/src/i18n/en.ts
src/specreview/slack.py
web/scripts/verify-activation.mjs
```
