# Implementation Plan: Review All Features

**Branch**: `002-review-all-features` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

The command line gains an all option that discovers every feature directory under specs/ (FR-001, FR-002), reviews each one
with the existing per-feature pipeline, and prints the reviews followed by a summary table of counts per feature (FR-003).
A feature folder given as the path is treated as a single feature (FR-004). The JSON format wraps the reports in one document
with a schema version (FR-005). The exit code is the worst result across features (FR-006), and a feature that cannot be parsed
is reported as failed while the others continue (FR-007). HTML export refuses the all option (FR-008). The min-severity filter
applies to each listing but never to the table counts (FR-009). Without the all option nothing changes (FR-010).

## Technical Context

**Language/Version**: Python 3.11+

**Primary Dependencies**: none (reuses the existing review pipeline and the feature discovery of the server)

**Testing**: pytest, with the example repository and a temporary repository of three features

**Project Type**: CLI

**Performance Goals**: four features in under 5 seconds (SC-001)

## Constitution Check

I Offline and deterministic: PASS (no new network use). III Read-only: PASS. VI Dogfooding: this feature is reviewed with the
tool before it is implemented.

## Project Structure

```text
src/specreview/
├── cli.py        # the all option, exit codes
└── report.py     # summary table and the multi-feature JSON document
tests/
└── test_all_mode.py
```

## Complexity Tracking

None.
