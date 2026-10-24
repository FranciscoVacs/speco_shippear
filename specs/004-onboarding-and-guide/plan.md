# Implementation Plan: Onboarding and Product Guide

**Branch**: `004-onboarding-and-guide` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

The rule catalog in the backend becomes the single source of what each rule means and is served to the interface (FR-006).
The interface shows a four-step introduction on the first visit (FR-001), remembers that it was dismissed (FR-002), reopens it
from the help button (FR-003) and stays usable when storage is blocked (FR-009, FR-011) and from the keyboard alone (FR-010). Each
finding explains its rule inline (FR-004). A guide page transcribes the product guide and the rule glossary (FR-005, FR-006).
Sample data and missing servers get guiding screens instead of errors (FR-007, FR-008).

## Technical Context

**Language/Version**: Python 3.11+ and TypeScript 5 with React 18

**Primary Dependencies**: none beyond the existing interface stack

**Testing**: pytest for the catalog; Playwright for the interface

**Project Type**: web-service with a single-page interface

## Constitution Check

IV One source of truth: PASS, the catalog feeds the CLI, the interface and the docs (FR-006).

## Project Structure

```text
src/specreview/rules.py   # rule catalog
web/src/                  # introduction, guide page, inline rule help
docs/07-product-guide.md
```

## Complexity Tracking

None.
