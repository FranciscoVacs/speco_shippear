# Implementation Plan: Wire Transfer Limits and Fraud Holds

**Branch**: `006-wire-transfer-limits` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

## Summary

The service charges the wire fee when the customer confirms (FR-001) and checks the daily limit of the customer's tier
before queuing (FR-002, FR-003). Wires above the review threshold go to the analyst queue (FR-005) and every analyst decision is
written to the audit log (FR-006). Rejected wires are refunded by a reconciliation job (FR-009). Fees are rounded to the nearest
cent (FR-010).

## Technical Context

**Language/Version**: Java 21

**Storage**: PostgreSQL (ledger), Kafka (settlement events)

**Testing**: JUnit 5

## Project Structure

```text
src/
├── transfers/fee-calculator.java
├── transfers/limit-check.java
├── transfers/review-queue.java
└── transfers/refund-job.java
```
