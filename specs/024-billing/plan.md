# Implementation Plan: Billing and plan upgrades

**Branch**: `024-billing` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

A catalog in the database says what each plan costs and gives (FR-001). A subscription and its invoices record what a company pays for and what was charged, written only by the service and read only by owners and admins (FR-009, FR-013). The service talks to payments through one small provider interface; the only implementation is a simulated one that accepts or declines and never sees a card (FR-010, FR-012), and a setting turns billing on, so that without it the app behaves as in spec 020 (FR-011). A change to a higher plan asks the provider for the charge first and only then calls one database function that changes the plan, opens the period, writes the invoice and grants the credits of the period, all in one transaction and once for the same request (FR-002, FR-003, FR-004, FR-014). A lower plan or a cancellation is scheduled for the end of the period and can be undone (FR-007). The worker renews what is due, charging once and granting once, and a declined renewal keeps the plan for three days before the company returns to the free plan (FR-006, FR-008). The credit gate of spec 020 now meters paid companies with the daily cap of their plan and without the monthly budget of the free plan, and the summary of credits tells when the period ends and whether billing is on (FR-005, FR-016). Companies that were on a paid plan before get a subscription and the credits of their plan when the migration runs (FR-015). The web app gets a billing page, and the upgrade button of the indicator, the chat and the usage page lands on it (FR-016).

## Technical Context

**Language/Version**: Python 3.11, TypeScript 5 with React 18

**Storage**: PostgreSQL

**Testing**: pytest on a real Postgres with the simulated provider, a real browser for the upgrade

**Project Type**: web service

## Project Structure

```text
supabase/migrations/20261020000001_billing.sql
cloud/speco_cloud/billing.py
cloud/speco_cloud/credits.py
cloud/speco_cloud/config.py
cloud/speco_cloud/app.py
cloud/speco_cloud/worker.py
web/src/cloud/billing.ts
web/src/cloud/UpgradeButton.tsx
web/src/cloud/creditsStore.ts
web/src/pages/settings/Billing.tsx
web/src/pages/settings/CloudUsage.tsx
web/src/router.tsx
web/src/shell/Sidebar.tsx
tests/cloud/test_billing.py
tests/cloud/test_credits.py
tests/cloud/test_cloud_assistant.py
web/scripts/verify-cloud.mjs
docs/30-billing.md
```
