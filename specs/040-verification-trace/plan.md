# Implementation Plan: Verification Trace

## Summary

Read the tags of the test files, match them to the requirements of the specs and report the level that checks each one (FR-001 to FR-007, FR-010). Add the same answer to the diff comment (FR-008, FR-009).

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: none beyond the review engine (D-001)
**Storage**: none; the trace is computed from the files
**Testing**: pytest on the wire transfer example

## Approach

- Scan only test files, and accept a tag only when it opens its own comment line, so a quoted tag cannot count (FR-001, FR-004)
- Resolve the feature by number or by full folder name and report any line that resolves to none or to several (FR-003)
- Keep the strongest level of each requirement and print the level, never a verdict of proof (FR-002, FR-005)
- Flag the requirements whose text says never or at most and that have no property or proof (FR-007)
- Exit with 1 only for broken tags, and with 0 when no test cites anything (FR-003, FR-006)
- Fill the diff comment from the same trace and stay silent when the repository uses no tags (FR-008, FR-009)
- Print text, Markdown or JSON from one structure (FR-010)
