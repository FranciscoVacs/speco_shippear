# Implementation Plan: Evidence strength

## Summary

Bind each verification run to the source of the tests it ran (FR-001 to FR-005), flag edited tests in the review of a change (FR-006), label the strength of the evidence (FR-007, FR-008) and classify the rules by shape (FR-009, FR-010).

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: none at runtime (ast and hashlib from the standard library)
**Storage**: `.specreview/verifications.jsonl`, the same hash chain, with a new `test_hashes` field
**Testing**: pytest on temporary repositories and on this repository

## Approach

- A new module `strength.py` computes the fingerprint of a cited test (the function source through `ast` for a Python node, the file otherwise), detects property-based markers and classifies rule shapes (FR-001, FR-007, FR-009)
- `verify` and `import_junit` add `test_hashes` to each run; `build` compares them with the current tests and treats a run as stale when one changed or is missing, naming the changed tests (FR-001 to FR-005)
- Each intent carries `evidence` (examples | generated cases); no label says proved (FR-007, FR-008)
- `specreview diff` lists the rules whose citing tests changed against the base, rendered by `render_comment` (FR-006)
- The PR bot reads `[pr] review_tests` from the head's specreview.toml; only then it picks, from the trees, the test files whose blob changed, reads their two versions and renders the same section (FR-011, FR-012)
- `specreview ledger --shape` prints the classes with count, percentage and total (FR-009, FR-010)
