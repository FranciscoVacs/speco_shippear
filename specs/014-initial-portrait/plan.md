# Implementation Plan: Initial Portrait of Business Rules

**Branch**: `014-initial-portrait` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

A first sync of a newly connected repository stores its inventory, built from file names only (FR-001). The portrait job proposes rules from two sources:
the requirements of specs that say they are Implemented (FR-002) and, only where the company consented, the business rules a model reads out of a small
budgeted set of code files (FR-003, FR-004, NFR-001). Every candidate must quote its evidence verbatim at the lines it names or it is discarded (FR-005,
SC-001); the service can only insert proposals, never decided rules, and a code rule can never be stored with high confidence (FR-006). A rule already
known for the repository is not created again (FR-012). Approvers confirm, correct or reject through a function that records the decision in an
append-only table and refuses viewers and members (FR-007, FR-008). Freezing the baseline stores the confirmed rules and their evidence hashes as an
immutable snapshot with a hash (FR-009, SC-002). On every sync the supporting lines of confirmed rules are compared by hash; a change or a removal opens a
finding unless the lines only moved, and an approver acknowledges it with a reason (FR-010, FR-011, SC-003).

## Technical Context

**Language/Version**: SQL (PostgreSQL 15 on Supabase), Python 3.11

**Storage**: PostgreSQL

**Testing**: pytest on a throwaway Postgres with a fake GitHub and a fake model

**Project Type**: database layer and worker of a web service

## Project Structure

```text
supabase/migrations/20261015000005_portrait.sql
cloud/speco_cloud/portrait/inventory.py
cloud/speco_cloud/portrait/candidates.py
cloud/speco_cloud/portrait/extractors.py
cloud/speco_cloud/portrait/pipeline.py
cloud/speco_cloud/portrait/drift.py
cloud/speco_cloud/worker.py
cloud/speco_cloud/webhooks.py
cloud/speco_cloud/app.py
tests/cloud/test_portrait.py
tests/cloud/test_decisions.py
docs/18-initial-portrait.md
```
