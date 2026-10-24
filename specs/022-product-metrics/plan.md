# Implementation Plan: Product Metrics

**Branch**: `022-product-metrics` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Three small capture tables hold what no existing table knows: where a person came from, how they answer the Sean Ellis question, and what was spent (FR-004, FR-006, FR-008). Everything else is derived by views from tables that already exist, in a schema only the service can read (FR-010, FR-011). A report module reads the views as the service, prints Markdown or JSON, and attaches the sample size to every ratio (FR-001, FR-002, FR-007, FR-009). The playbook `docs/27-metrics-playbook.md` records the definitions and thresholds the report applies (FR-002, FR-007).

## Technical Context

**Language/Version**: Python 3.11, PostgreSQL 15
**Primary Dependencies**: psycopg, FastAPI (already in `cloud/`)
**Storage**: Supabase Postgres, one new migration
**Testing**: pytest on a throwaway Postgres with the real migrations
**Constraints**: service only access; no new runtime dependency; the core engine stays dependency free (D-008)

## Project Structure

```text
supabase/migrations/20261019000001_metrics.sql
cloud/speco_cloud/metrics_report.py
cloud/speco_cloud/app.py              # two small endpoints
tests/cloud/test_metrics.py
docs/27-metrics-playbook.md
```

## Decisions

- Derive instead of record: a "first result" or an "active day" is read from reviews, jobs, approvals and decisions, so there is no second source of truth to drift (D-016)
- A report, not a dashboard: with fewer than a hundred companies a dashboard is decoration; a command that prints the month is enough
- Third party product analytics (events, session replay) is deliberately not added: it needs a consent and privacy decision that belongs with the first real customers
