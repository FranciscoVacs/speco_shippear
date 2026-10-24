# Implementation Plan: Team Invitations

**Branch**: `003-team-invitations` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

## Summary

Admins create invitations by email (FR-001); an email is sent (FR-002) and invitations expire after 7 days (FR-003).
Invitees accept through a signed link (FR-004). Admins can revoke pending invitations (FR-008).
We also add a Slack notification channel so admins learn when invitations are accepted.

## Technical Context

**Language/Version**: Python 3.12

**Primary Dependencies**: FastAPI, SQLAlchemy

**Storage**: PostgreSQL

**Testing**: pytest

**Project Type**: web-service

## Constitution Check

Test-first: PASS.

## Project Structure

```text
src/
├── models/invitation.py
├── services/invitation_service.py
├── api/invitations.py
└── jobs/expire_invitations.py
```

## Complexity Tracking

None.
