# Tasks: Cloud App

## Phase 3: User Story 1 - Sign in and have a company (Priority: P1)

- [X] T001 [US1] Detect the cloud settings and load the sign-in library on demand in web/src/cloud/config.ts and web/src/cloud/auth.ts (FR-001, NFR-001)
- [X] T002 [US1] Add the gate with the sign-in, the company creation and the real workspace list in web/src/cloud/CloudGate.tsx and web/src/cloud/SignInCloud.tsx (FR-001, FR-002, FR-003)
- [X] T003 [US1] Sign out and react to an invalid session in web/src/cloud/auth.ts and web/src/cloud/api.ts (FR-004, FR-005, NFR-002)

## Phase 4: User Story 2 - Connect GitHub for real (Priority: P1)

- [X] T004 [US2] Allow browser calls only from the web app's origin in cloud/speco_cloud/app.py and cloud/speco_cloud/config.py (SC-002)
- [X] T005 [US2] Start the install, list the connected repositories and request the portrait in web/src/pages/ConnectRepo.tsx (FR-006, FR-007, FR-008, FR-009)

## Phase 5: User Story 3 - The portrait on my own rules (Priority: P1)

- [X] T006 [US3] Put the portrait behind one interface with a demo backend and a service backend in web/src/portrait/backend.ts and web/src/portrait/cloud.ts (FR-010, FR-011, FR-012, FR-013)
- [X] T007 [US3] Move the portrait screen onto that interface in web/src/pages/PortraitPage.tsx (FR-010, FR-011, FR-012)

## Phase 6: User Story 4 - The public demo stays as it is (Priority: P1)

- [X] T008 [US4] Keep the demo free of network calls and of the sign-in library in web/src/cloud/config.ts and web/src/router.tsx (FR-014, NFR-001)

## Phase 7: Verification

- [X] T009 Run the real service on a real database with a fake GitHub for the browser check in scripts/cloud_e2e_server.py (SC-001)
- [X] T010 Drive the cloud app end to end and the demo unchanged in web/scripts/verify-cloud.mjs (SC-001, SC-003, FR-014)
