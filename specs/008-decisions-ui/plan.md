# Implementation Plan: Decisions for Approvers

**Branch**: `008-decisions-ui` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

The report gains a verdict, an owner for each finding and a risk class, computed in one module so the command line, the agent
server and the web app agree (FR-001, FR-002). The review page shows an executive summary that speaks in consequences and hides
rule ids (FR-003, FR-006). A decisions page lists what waits for the approver, grouped by feature (FR-004), and the sidebar shows
the number of pending decisions (FR-005).

## Technical Context

**Language/Version**: Python 3.11 for the verdict, TypeScript 5 with React 18 for the pages

**Testing**: pytest for the verdict rules, a real browser script that compares the pages with the generated reports

**Project Type**: web application

## Project Structure

```text
src/specreview/decision.py
web/src/decision/
├── ExecSummary.tsx
└── useDecisions.ts
web/src/pages/DecisionsPage.tsx
```
