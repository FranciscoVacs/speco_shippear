# Tasks: Team Invitations

## Phase 1: Setup

- [ ] T001 Create invitations module structure in src/
- [ ] T002 [P] Configure linting in pyproject.toml

## Phase 2: Foundational

- [ ] T003 Create Invitation model in src/models/invitation.py
- [ ] T004 [P] Add database migration for invitations table in migrations/003_invitations.py

## Phase 3: User Story 1 - Admin invites a teammate (Priority: P1) 🎯 MVP

- [ ] T005 [P] [US1] Contract test for POST /invitations in tests/contract/test_invitations.py
- [ ] T006 [US1] Implement InvitationService.create in src/services/invitation_service.py to invite a person by email address
- [ ] T007 [US1] Send invitation email within 60 seconds via mail provider in src/services/mailer.py
- [ ] T008 [US1] Implement POST /invitations endpoint in src/api/invitations.py
- [ ] T009 [US1] Post a Slack notification when an invitation is created in src/integrations/slack.py
- [ ] T010 [US1] Add CSV bulk import of invitees in src/api/bulk_import.py

## Phase 4: User Story 2 - Invitee accepts (Priority: P1)

- [ ] T011 [US2] Implement accept invitation link handler that adds the invitee to the workspace in src/api/accept.py
- [ ] T012 [US2] Implement expire_invitations job to expire pending invitations after 7 days in src/jobs/expire_invitations.py

## Phase 5: User Story 3 - Admin manages pending invitations (Priority: P2)

- [ ] T013 [US3] Implement revoke pending invitation endpoint for admins in src/api/invitations.py

## Phase 6: Polish

- [ ] T014 [P] Documentation updates in docs/
