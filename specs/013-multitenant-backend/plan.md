# Implementation Plan: Multi-tenant Backend

**Branch**: `013-multitenant-backend` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

Postgres on Supabase holds the data and enforces isolation with row level security (NFR-001). A company creation function makes the creator the
owner (FR-001) and triggers refuse to leave a company without an owner (FR-007). Policies let members read their company's rows (FR-002) and
only owners, admins and approvers insert decisions as themselves (FR-003). Installations, repositories, features, spec versions and reviews carry
composite foreign keys that include the company, so a row cannot point across companies (FR-009), and only the service role writes them.
Decisions get their position and hash from a trigger under a per-company lock (FR-004), reject edits and deletions with privileges and triggers
(FR-005), need a reason unless they are plain approvals (FR-006), and a verification function walks the chain (FR-008). Webhook events are unique
by delivery id (FR-010) and have no policy for signed-in people (FR-011). A Python service (FastAPI, psycopg) in its own package verifies GitHub's signature, stores each delivery once and processes it, so a failed delivery is
retried (FR-010, FR-014). The install round trip uses a signed, short-lived state created by an owner or an admin, calls GitHub as the App with a short
lived token and links the installation to exactly one company (FR-012, FR-013). Pushes that change files under specs queue one pending job per
repository in a Postgres queue (FR-015). The API verifies Supabase tokens (FR-016) and opens each request as that person so row level security decides
what they see; the service's own work runs as the service role (NFR-002). The worker claims a job, reads only the permitted spec files at the pushed commit through GitHub (FR-019), runs the review engine as a library
on text and stores one snapshot and one review per feature version, keyed by the same content hash the command line uses so repeated content is
not stored again (FR-017, FR-018, SC-004). Failures go back to the queue with growing delays and stop after five attempts (FR-020). Tests run the migrations on a real Postgres with the Supabase roles stubbed and check isolation, roles and the chain (NFR-001, SC-001, SC-002).

## Technical Context

**Language/Version**: SQL (PostgreSQL 15 on Supabase), Python 3.11 for the service and the tests

**Storage**: PostgreSQL

**Testing**: pytest driving `psql` against a throwaway cluster; skipped when Postgres is not installed

**Project Type**: database layer of a web service

## Project Structure

```text
supabase/config.toml
supabase/migrations/20261015000001_tenancy.sql
supabase/migrations/20261015000002_github_and_reviews.sql
supabase/migrations/20261015000003_approvals.sql
tests/cloud/supabase_stub.sql
tests/cloud/cluster_fixture.py
tests/cloud/test_tenancy.py
supabase/migrations/20261015000004_jobs.sql
cloud/pyproject.toml
cloud/speco_cloud/config.py
cloud/speco_cloud/db.py
cloud/speco_cloud/auth.py
cloud/speco_cloud/state.py
cloud/speco_cloud/github_app.py
cloud/speco_cloud/webhooks.py
cloud/speco_cloud/app.py
cloud/speco_cloud/worker.py
tests/cloud/test_service.py
tests/cloud/test_worker.py
docs/17-multitenant-backend.md
```
