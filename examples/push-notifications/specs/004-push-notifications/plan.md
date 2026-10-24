# Implementation Plan: Push Notifications

**Branch**: `004-push-notifications` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

When an order ships the service sends a push notification with the tracking link to the registered devices of the customer
(FR-001). Customers who disabled notifications are skipped (FR-002). Failed deliveries are retried up to 3 times within
15 minutes (FR-003). The delivery status of each notification is stored (FR-004).

## Technical Context

**Language/Version**: Kotlin

**Storage**: PostgreSQL

**Testing**: JUnit

## Project Structure

```text
src/
├── push/sender.kt
├── push/preferences.kt
├── push/retry.kt
└── push/delivery-log.kt
```
