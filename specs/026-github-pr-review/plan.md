# Implementation Plan: GitHub Pull Request Review

## Summary

Compare the spec files of a pull request's base and head commits and post one comment with what changes in the business (FR-001 to FR-005).
A stateless bot serves the App for a first try (FR-006 to FR-011).

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: the review engine (specreview), FastAPI, httpx, PyJWT
**Storage**: none for the bot; recent reviews in memory
**Testing**: pytest with a fake GitHub transport

## Approach

- The engine compares requirements by id between two copies of a repository, pairs the quantities that moved and reuses the cross reference for the linked tasks and plan steps (FR-001, FR-002, FR-003, FR-004)
- Blockers are compared by fingerprint between base and head so only new ones are listed (FR-005)
- The bot compares the blob shas of the selected spec files before reading any content and skips the comment when they match (FR-010)
- The comment is found by a hidden marker and edited in place (FR-009)
- The webhook verifies the signature, answers at once and reviews in a background task (FR-008, FR-011)
- The diff command copies the merge base's spec files with git and renders the comment (FR-012, FR-013)
- The home page links to the App's installation page and the setup page gives the next step without reading anything from the query string (FR-006, FR-007)
