# Implementation Plan: Code providers

**Branch**: `019-code-providers` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

The only things the service asks of a code host are four reads: resolve a branch to a commit, list the files of a commit, read a file, and read a file that may not exist (FR-007). They move behind one small interface with one implementation for GitHub, which already exists, and one for Bitbucket Cloud (FR-011). The tables that were named after GitHub are generalized: a connection belongs to a company and a provider, a repository belongs to a connection and has a status that now includes available, which means found and not read (FR-003, FR-004). Credentials live in their own table that no signed in person can read, encrypted with a key that only the service has (FR-008). A Bitbucket workspace is connected with the key and secret of a read only consumer, which are exchanged for short lived accesses (FR-001, FR-002). The service creates a webhook for the workspace, signed with a secret of that connection (FR-005, FR-006), and removes it when the workspace is disconnected (FR-009). A refresh finds new repositories and catches up the ones whose main branch moved while the webhook was not working (FR-010). When the provider asks to slow down the job fails with a delay that the worker already knows how to retry (FR-012). The web app asks which provider, takes the credential, lists the repositories with a search and selection (SC-004).

## Technical Context

**Language/Version**: Python 3.11, TypeScript 5 with React 18

**Storage**: PostgreSQL

**Testing**: pytest on a real Postgres with a fake Bitbucket served over HTTP, a real browser for the screens

**Project Type**: web service

## Project Structure

```text
supabase/migrations/20261017000001_code_providers.sql
cloud/speco_cloud/providers/__init__.py
cloud/speco_cloud/providers/github.py
cloud/speco_cloud/providers/bitbucket.py
cloud/speco_cloud/credentials.py
cloud/speco_cloud/webhooks.py
cloud/speco_cloud/worker.py
cloud/speco_cloud/app.py
web/src/cloud/ConnectCloud.tsx
tests/cloud/test_providers.py
tests/cloud/test_bitbucket.py
web/scripts/verify-cloud.mjs
docs/23-code-providers.md
```
