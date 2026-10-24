# Implementation Plan: Decision Loop in the Cloud

## Summary

The service lists and opens the features of a company as the signed-in person and records decisions through one database function that refuses agents (FR-001 to FR-009). A pull request of a connected repository keeps the version it proposes, links its comment to deciding it and carries a check that a decision resolves (FR-010 to FR-016). The app opens the company a link names (FR-017, FR-019).

## Technical Context

**Language/Version**: Python 3.11+, SQL (PostgreSQL), TypeScript 5 with React 18
**Primary Dependencies**: FastAPI, psycopg, httpx, the review engine
**Storage**: PostgreSQL (approvals, snapshots, pull reviews)
**Testing**: pytest on a real Postgres with a fake GitHub; a real browser against the real service

## Approach

- A snapshot records whether it was first seen on the main branch or on a pull request, so the app lists only the branch and still opens a pull request's version by name (FR-001, FR-010)
- Reads run as the person, so row level security keeps companies apart (FR-003)
- `decide_feature` resolves the version by the hash of its files, checks the role and refuses agent tokens in the database itself (FR-004, FR-007, FR-008, FR-009, FR-018)
- The approval policy for blockers, reasons and delegates lives in one module shared by every route (FR-006)
- The bridge stores the pull request's versions, renders the status block in the comment and puts the check conclusion from the latest decision on each version (FR-011, FR-012, FR-013)
- The bridge runs only for repositories the company chose to read, and a failure of the check never loses the comment (FR-014, FR-016)
- Nothing on GitHub carries a name or a reason (FR-015)
- The app keeps the company a link names for this tab only and uses it once the person's companies are known (FR-017, FR-019)
