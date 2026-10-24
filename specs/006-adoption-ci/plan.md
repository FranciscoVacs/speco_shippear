# Implementation Plan: Adoption in CI

**Branch**: `006-adoption-ci` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

A composite GitHub Action runs the review on the features a pull request changed (FR-001), uploads a SARIF file so the findings
appear as annotations (FR-002) and keeps a single marked comment that it updates (FR-003). A baseline file records current
findings (FR-004) by a fingerprint of feature, rule, ids and file, without the line number (FR-005). Waivers record a reason,
an author and an optional expiry date (FR-006, FR-007). An init command writes the configuration and the workflow without
overwriting existing files (FR-008).

## Technical Context

**Language/Version**: Python 3.11 with the standard library only

**Storage**: JSON files under .specreview/ committed in the repository

**Testing**: pytest with real git repositories in temporary folders

**Project Type**: command line tool and GitHub Action

## Project Structure

```text
src/specreview/
├── suppress.py
├── sarif.py
├── gitdiff.py
└── cli_sub.py
action.yml
```
