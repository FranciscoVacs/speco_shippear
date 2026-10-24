# Feature Specification: Team Invitations

**Feature Branch**: `003-team-invitations`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Let workspace admins invite people to their team by email"

## Clarifications

### Session 2026-09-02

- Q: Can non-admins invite? → A: No, only admins.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin invites a teammate (Priority: P1)

An admin enters an email address and the person receives an invitation.

**Why this priority**: Without invitations nobody can join a workspace.

**Independent Test**: Invite an address and check the invitation email arrives.

**Acceptance Scenarios**:

1. **Given** an admin on the members page, **When** they submit a valid email, **Then** an invitation is created and an email is sent
2. **Given** an admin, **When** they submit an email that is already a member, **Then** the system rejects it with an error message

---

### User Story 2 - Invitee accepts (Priority: P1)

The invited person follows the link and joins the workspace.

**Why this priority**: Closes the loop of the invitation flow.

**Independent Test**: Open the link from the email and verify membership.

**Acceptance Scenarios**:

1. **Given** a pending invitation, **When** the invitee opens the link and confirms, **Then** they become a member of the workspace
2. **Given** an expired invitation, **When** the invitee opens the link, **Then** they see an "invitation expired" page

---

### User Story 3 - Admin manages pending invitations (Priority: P2)

Admins can see and revoke pending invitations from a dashboard.

**Why this priority**: Admins need control over outstanding invitations.

**Independent Test**: Revoke an invitation and check the link stops working.

---

### Edge Cases

- What happens when the same email is invited twice?
- How does the system handle a bounced invitation email?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow workspace admins to invite a person by entering an email address
- **FR-002**: When an invitation is created, the system MUST send an invitation email to the address within 60 seconds
- **FR-003**: System MUST expire pending invitations after 7 days
- **FR-004**: When an invitee opens a valid invitation link, the system MUST add them to the workspace
- **FR-005**: System MUST record an audit log entry for every invitation event (created, accepted, expired, revoked)
- **FR-006**: System MUST provide a fast and user-friendly dashboard of pending invitations
- **FR-007**: System MUST expire pending invitations after 30 days
- **FR-008**: Admins MUST be able to revoke a pending invitation
- **FR-009**: System MUST be scalable and handle invitation traffic appropriately
- **FR-010**: System MUST limit the number of invitations per admin per day [NEEDS CLARIFICATION: what is the limit?]

### Key Entities *(include if feature involves data)*

- **Invitation**: email, status (pending/accepted/expired/revoked), expiry date, inviting admin
- **Workspace**: the team space an invitation grants access to

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of invitees complete acceptance within 2 minutes of opening the link
- **SC-002**: Invitation emails are delivered within 60 seconds for 99% of invitations

## Assumptions

- Admins already exist and are authenticated
- Email delivery uses the existing mail provider
