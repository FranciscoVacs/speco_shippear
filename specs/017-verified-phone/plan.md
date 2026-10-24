# Implementation Plan: Verified Phone

**Branch**: `017-verified-phone` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

The sign-in screen leads with the phone: number with country (Argentina by default), code, in (FR-001, FR-002, FR-003). GitHub and email stay as ways to arrive but a gate in front of the app asks for a verified phone before anything else (FR-004), using the library's phone change flow so the number is confirmed by a code. The service reads the verified phone from the person's access and refuses any access without it (FR-005, SC-002), so the rule holds even if the app is bypassed. Supabase's one-account-per-phone rule covers a number used twice (FR-006). Abuse is limited in the sign-in project: a rate limit per number (FR-007), a human check in front of the code request (FR-008) and a daily budget with a notice to the owner (FR-009, SC-003). Declared test numbers with fixed codes let the browser check sign up without sending messages (FR-010).

## Technical Context

**Language/Version**: TypeScript 5 with React 18, Python 3.11

**Storage**: the sign-in provider keeps the phone; the database keeps nothing new

**Testing**: pytest for the service check, a real browser with a test number

**Project Type**: web application

## Project Structure

```text
web/src/cloud/auth.ts
web/src/cloud/SignInCloud.tsx
web/src/cloud/PhoneGate.tsx
web/src/cloud/CloudGate.tsx
cloud/speco_cloud/auth.py
cloud/speco_cloud/config.py
tests/cloud/test_service.py
web/scripts/verify-cloud.mjs
docs/21-verified-phone.md
```
