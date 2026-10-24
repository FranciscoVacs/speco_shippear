# Implementation Plan: Two Doors

**Branch**: `016-two-doors` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

After the company exists, one screen asks the plain question and sends the person to the first door, the existing GitHub connection and portrait (FR-001, FR-003), or to the second, a guided interview built on the draft that the agent already makes from an idea (FR-004). The interview asks the open questions one at a time with examples, and a question the person cannot answer stays open and counts as a risk (FR-007). The answers are saved as a spec of the company in the database without a repository, which needs the feature and its versions to be able to exist with no repository behind them (FR-005); the same spec can be exported as a plain brief (FR-006). The person can switch door and nothing is lost (FR-002). When a repository is later connected, each rule the portrait proposes is matched against the saved decisions and shown as decided, undecided or contradicting, and the decisions with no match are listed as missing (FR-008, FR-009). A vocabulary check keeps technical words out of the second door (FR-010, SC-003).

## Technical Context

**Language/Version**: SQL (PostgreSQL on Supabase), Python 3.11, TypeScript 5 with React 18

**Storage**: PostgreSQL

**Testing**: pytest on a real Postgres; a real browser with a person who knows no technical word

**Project Type**: web application

## Project Structure

```text
supabase/migrations/20261016000001_projects_without_repository.sql
cloud/speco_cloud/interview.py
cloud/speco_cloud/app.py
cloud/speco_cloud/portrait/compare.py
web/src/pages/Welcome.tsx
web/src/pages/Interview.tsx
web/src/i18n/es.ts
web/scripts/verify-two-doors.mjs
tests/cloud/test_two_doors.py
docs/20-two-doors.md
```
