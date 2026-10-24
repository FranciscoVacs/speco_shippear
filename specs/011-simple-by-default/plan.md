# Implementation Plan: Simple by Default

**Branch**: `011-simple-by-default` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

A single disclosure component holds every collapsible section: it shows a count in its heading (NFR-004), opens in place with
the mouse or the keyboard and announces its state (NFR-005), opens by itself when the address points inside it (NFR-006) and keeps
its state in browser storage (NFR-008). The sidebar lists three entries and a control that reveals the rest (NFR-001, NFR-008).
The review page keeps the executive summary on top and puts the summary tiles, the findings and the sources inside one collapsed
section (NFR-002). The decisions page keeps what waits for the approver on top and collapses the goals, the history and the list
of features (NFR-003). The command palette already lists every page, so it stays the way to reach a page that the sidebar hides
(NFR-007). An exported report opens the technical section (NFR-009).

## Technical Context

**Language/Version**: TypeScript 5 with React 18

**Storage**: browser storage for the open or closed state only

**Testing**: a real browser script that checks the first view, the keyboard, the deep link and the stored state

**Project Type**: web application

## Project Structure

```text
web/src/shell/Collapsible.tsx
web/src/shell/Sidebar.tsx
web/src/pages/ReviewPage.tsx
web/src/pages/DecisionsPage.tsx
```
