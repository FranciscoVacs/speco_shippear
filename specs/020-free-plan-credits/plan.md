# Implementation Plan: Free plan with credits

**Branch**: `020-free-plan-credits` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Every model-assisted action goes through one small gate that reserves credits before the call and settles them after (FR-004, FR-005, FR-014). Deterministic work never goes through the gate (FR-002). Credits live in an append-only ledger per company: grants (welcome, monthly) and charges, each with an expiry, and the balance is the sum of what has not expired; only the service writes and a balance cannot go below zero (FR-012). The welcome and monthly grants are given when a company is created and by a monthly job, and a second free company of the same person gets none (FR-001, FR-003, FR-010). The gate also enforces the daily cap per company and the monthly budget of the whole free plan (FR-008, FR-009), and the size of each request is fixed where the request is built (FR-007). The assistant of a company is the first caller of the gate for conversation turns: it reads what the person may read, keeps one turn under 40 000 tokens and answers as a stream, charged to the tokens the provider reports (FR-004, FR-005, FR-007, FR-014). Every answer of the assistant ends by telling the app how many credits are left, and a small store shared by the top bar, the chat and the usage page keeps them in agreement; the chat warns when less than a fifth is left and says so when another answer cannot be paid, and the upgrade button records the intention because nothing can be bought yet (FR-015, FR-016, FR-017). A reservation that a crash left open is released after a while (FR-014). The usage page stops showing demo numbers in cloud mode and shows the balance, the renewal and the recent uses, and tells the owner when the balance is low (FR-006, FR-011, FR-013).

## Technical Context

**Language/Version**: Python 3.11, TypeScript 5 with React 18

**Storage**: PostgreSQL

**Testing**: pytest on a real Postgres with a fake model, a real browser for the usage page

**Project Type**: web service

## Project Structure

```text
supabase/migrations/20261018000001_credits.sql
cloud/speco_cloud/credits.py
cloud/speco_cloud/assistant.py
supabase/migrations/20261018000003_stale_reservations.sql
tests/cloud/test_cloud_assistant.py
supabase/migrations/20261018000004_upgrade_interest.sql
web/src/cloud/creditsStore.ts
web/src/cloud/CreditsMeter.tsx
web/src/cloud/UpgradeButton.tsx
web/src/shell/CreditsPill.tsx
web/src/agent/CreditsBanner.tsx
cloud/speco_cloud/config.py
cloud/speco_cloud/worker.py
cloud/speco_cloud/app.py
web/src/pages/settings/Usage.tsx
web/src/cloud/credits.ts
tests/cloud/test_credits.py
web/scripts/verify-cloud.mjs
docs/25-free-plan-credits.md
```
