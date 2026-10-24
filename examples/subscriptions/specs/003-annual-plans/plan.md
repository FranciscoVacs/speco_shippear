# Implementation Plan: Annual Plans

**Branch**: `003-annual-plans` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

## Summary

An admin switches a team to the annual plan and the billing service issues one invoice for twelve months at the annual price
(FR-001). A 15% discount coupon is applied to the first year (FR-002). The billing page shows the renewal date of the plan (FR-003).

## Technical Context

**Language/Version**: Python 3.12

**Storage**: PostgreSQL

**Testing**: pytest

## Project Structure

```text
src/
├── billing/switch_plan.py
├── billing/coupons.py
└── billing/renewal.py
```
