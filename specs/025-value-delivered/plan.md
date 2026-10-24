# Implementation Plan: Value Delivered

**Branch**: `025-value-delivered` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

A view derives from the reviews which findings were resolved and when, so nothing new is recorded for the count (FR-001, FR-002, FR-009). One small table keeps the only thing no table can know, the client's answer to "would this have reached code?" (FR-004). Two endpoints list and take the answers (FR-003, FR-004). The report from spec 022 gets a section, and can print that section alone for one company (FR-005, FR-006, FR-008). A card in the web app asks the question in one tap and then stays quiet (FR-010). The playbook records the definition and the limits the report states (FR-006).

## Technical Context

**Language/Version**: Python 3.11, PostgreSQL 15
**Primary Dependencies**: psycopg, FastAPI (already in `cloud/`)
**Storage**: Supabase Postgres, one new migration
**Testing**: pytest on a throwaway Postgres with the real migrations
**Constraints**: service only access (FR-007); no new runtime dependency; the engine stays untouched (D-008)

## Project Structure

```text
supabase/migrations/20261020000001_value_delivered.sql
cloud/speco_cloud/app.py              # two endpoints
cloud/speco_cloud/metrics_report.py   # value section and --org
tests/cloud/test_metrics.py
web/src/cloud/outcomes.ts, ValueCheck.tsx   # the card
web/scripts/verify-cloud.mjs
docs/27-metrics-playbook.md
```

## Decisions

- Resolved means "gone from the latest review": it needs no event stream and cannot drift from the reviews (D-016); the cost is that a waiver counts as resolved, said in the report
- The counterfactual is asked, not guessed: one question to the person who fixed it, first answer wins (D-018)
- Hours are an assumption on the page, never a result, and unanswered blockers add none
