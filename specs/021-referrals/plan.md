# Implementation Plan: Referrals

**Branch**: `021-referrals` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Each person with a verified phone gets one random code, shown as a link (FR-001). The public page for a link keeps the code in the browser for 30 days and says only that someone invited the visitor (FR-002). When a new account is created the service reads the kept code and records a pending referral, unless the account already existed or both sides are the same account or share a phone (FR-003, FR-004, FR-007). The reward is not given at sign-up: the service gives it when the invited company builds its first portrait or records its first review, once, with the credits of spec 020 marked as earned by referral, bound to the company and expiring in six months (FR-005, FR-006, FR-009). The person who invited is capped per calendar month, and a reward with no company to receive it is held (FR-008, FR-013). The owner of the service has a switch (FR-011). The usage page shows the link and the counts without naming anyone, and the person who invited is notified (FR-010, FR-012).

## Technical Context

**Language/Version**: Python 3.11, TypeScript 5 with React 18

**Storage**: PostgreSQL

**Testing**: pytest on a real Postgres, a real browser for the link, the sign-up and the reward

**Project Type**: web service

## Project Structure

```text
supabase/migrations/20261018000002_referrals.sql
cloud/speco_cloud/referrals.py
cloud/speco_cloud/config.py
cloud/speco_cloud/app.py
cloud/speco_cloud/worker.py
web/src/cloud/referral.ts
web/src/pages/settings/Usage.tsx
tests/cloud/test_referrals.py
web/scripts/verify-cloud.mjs
docs/26-referrals.md
```
