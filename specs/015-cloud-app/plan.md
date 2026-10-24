# Implementation Plan: Cloud App

**Branch**: `015-cloud-app` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

## Summary

Cloud mode is switched on at build time by three public addresses (the service, the Supabase project and its public key). Without them nothing changes and the
sign-in library is never loaded (FR-014, NFR-001). With them, a gate in front of the shell asks Supabase for the session, shows the sign-in with GitHub or an
email link (FR-001), asks a person without a company to create one (FR-002) and fills the existing workspace switcher with the companies the service reports
(FR-003). Signing out clears the library's session (FR-004) and an invalid-session answer from the service does the same (FR-005). The access token lives only
in the library's own storage and is attached to each request to the service (NFR-002). The connect page asks the service for the install link and sends owners
and admins to GitHub (FR-006, FR-007), lists the repositories on return (FR-008) and queues the portrait (FR-009). The portrait screen reads its state through
one interface with two backends: the demo, as before, and the service, which loads rules, baselines, changes and inventory and sends every decision (FR-010,
FR-011, FR-012, FR-013). The service allows browser calls only from the web app's origin (SC-002). An end to end check runs the real service on a real database
with a fake GitHub and drives the built app in a browser (SC-001, SC-003).

## Technical Context

**Language/Version**: TypeScript 5 with React 18 and `@supabase/supabase-js` (loaded on demand), Python 3.11 for the check harness

**Storage**: the sign-in library's own browser storage for the session

**Testing**: a real browser against the real service and database; the existing demo checks unchanged

**Project Type**: web application

## Project Structure

```text
web/src/cloud/config.ts
web/src/cloud/auth.ts
web/src/cloud/api.ts
web/src/cloud/orgs.ts
web/src/cloud/CloudGate.tsx
web/src/cloud/SignInCloud.tsx
web/src/portrait/backend.ts
web/src/portrait/cloud.ts
web/src/pages/ConnectRepo.tsx
web/src/pages/PortraitPage.tsx
web/src/router.tsx
web/scripts/verify-cloud.mjs
cloud/speco_cloud/app.py
cloud/speco_cloud/config.py
scripts/cloud_e2e_server.py
docs/19-cloud-app.md
```
