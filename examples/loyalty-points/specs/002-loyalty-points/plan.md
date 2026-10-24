# Implementation Plan: Loyalty Points

**Branch**: `002-loyalty-points` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

## Summary

The service adds one point per currency unit spent when a purchase is paid (FR-001) and lets the customer redeem points as a
discount at checkout. The balance is shown on the account page (FR-003). Points earned from a purchase are removed when
the purchase is refunded (FR-005). Expiry of points is handled by a nightly job (FR-004).

## Technical Context

**Language/Version**: TypeScript 5

**Storage**: PostgreSQL

**Testing**: Jest

## Project Structure

```text
src/
├── points/earn.ts
├── points/refund.ts
└── points/expiry-job.ts
```
