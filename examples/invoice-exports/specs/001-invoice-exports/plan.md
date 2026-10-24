# Implementation Plan: Invoice Exports

**Branch**: `001-invoice-exports` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

## Summary

A finance user picks a date range and the service streams a CSV with one row per invoice (FR-001, FR-002). A single invoice is
rendered as a PDF with its lines and totals (FR-004). Exports are restricted to the finance role (FR-006). Large exports are
queued and a notification is sent to the user's Slack channel when they finish.

## Technical Context

**Language/Version**: TypeScript 5

**Primary Dependencies**: Express, a PDF library

**Storage**: PostgreSQL, object storage for files

**Testing**: Jest

**Project Type**: web-service

## Project Structure

```text
src/
├── exports/csv.ts
├── exports/pdf.ts
├── exports/queue.ts
└── auth/roles.ts
```
