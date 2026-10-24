# Implementation Plan: Intent Ledger

## Summary

Build one ledger of every rule the specs state with how much evidence backs it (FR-001 to FR-005), a verification run that keeps a hash-chained record (FR-006 to FR-009), tools to draft and correct rules with an intent record (FR-010 to FR-013), a per-rule history from git (FR-014 to FR-016), and the same ledger in the CLI, the MCP server and the web app (FR-017 to FR-020).

## Technical Context

**Language/Version**: Python 3.11+, TypeScript (web)
**Primary Dependencies**: none at runtime; git when present
**Storage**: `.specreview/verifications.jsonl` and `.specreview/intent-log.jsonl`, append-only and chained by hash
**Testing**: pytest on temporary repositories and on this repository

## Approach

- The ledger walks the source files, skipping specs, docs and dependencies, and reads citations of the form feature/id; tests are told from code by their path (FR-002, FR-003, FR-004)
- A feature is implemented when its Status says so or all its tasks are done; approvals come from the existing approval log (FR-001, FR-005)
- The verify step expands the configured command with the citing tests as separate arguments, runs it without a shell and appends the outcome to a hash chain keyed by the requirement text hash (FR-006, FR-007, FR-008, FR-009)
- Draft and change write only the target spec.md, reuse the review and the moved values of the intent diff, read the approval status and append to the intent record (FR-010, FR-011, FR-012, FR-013)
- The history reads each commit of the spec with git, parses each version and merges approvals, intent changes and runs by date (FR-014, FR-015, FR-016)
- A ledger subcommand prints text, JSON or Markdown and the strict flag decides the exit code (FR-017, FR-018)
- The server exposes the ledger and the demo build ships this repository's ledger as a sample for the web page (FR-019)
- The MCP instructions and the agent rules written by init point to the ledger first (FR-020)
