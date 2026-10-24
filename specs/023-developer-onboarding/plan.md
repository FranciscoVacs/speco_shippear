# Implementation Plan: Developer Onboarding

**Branch**: `023-developer-onboarding` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

A `demo` subcommand copies a sample feature bundled in the package to a folder and reviews it with the same engine, showing
only blockers unless asked (FR-001, FR-002, FR-003). When a folder holds no features, one helper in the loader looks for features
nearby and builds the hint that every command appends to its error (FR-004, FR-005). The app gets a page at `/docs/developers`
that reads all its content from one JSON file: code once, prose in Spanish and in English (FR-006, FR-011, FR-014). The page has
client tabs that remember the choice and follow the keyboard (FR-006, FR-008, FR-009), copy buttons (FR-006, FR-012), the check
command and the tools table (FR-010), deep links that focus a section (FR-017) and a layout that does not scroll sideways (FR-016).
The help menu, the command palette and the product guide link to it (FR-013). Tests compare the JSON with the markdown guides and with
what the tool prints, and check that Spanish and English have the same shape (FR-015, FR-007).

## Technical Context

**Language/Version**: Python 3.11 for the tool, TypeScript 5 with React 18 for the page

**Storage**: browser storage for the chosen client only; the sample feature ships as package data

**Testing**: pytest for the demo, the hints and the consistency with the guides; a real browser script for the page

**Project Type**: command line tool plus web application

## Project Structure

```text
src/specreview/cli_sub.py
src/specreview/parser/loader.py
src/specreview/demo_data/wire-transfers/specs/
web/src/developers/content.json
web/src/developers/Rich.tsx
web/src/pages/DevelopersPage.tsx
web/scripts/verify-developers.mjs
tests/test_developer_docs.py
tests/test_adoption.py
docs/28-developer-quickstart.md
docs/29-developer-recipes.md
```
