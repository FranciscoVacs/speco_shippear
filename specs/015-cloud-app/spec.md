# Feature Specification: Cloud App

**Feature Branch**: `015-cloud-app`

**Created**: 2026-10-15

**Status**: Implemented

**Goals**: G-8, G-9, G-7

**Decisions**: D-008, D-006

**Input**: User description: "Make the web app work against the cloud service: a person signs in with Supabase, picks or creates their company, connects GitHub for real and works the initial portrait on their own data, while the public demo keeps working untouched"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and have a company (Priority: P1)

A new person opens the app, signs in with GitHub or with an email link, creates their company and lands inside it. Next time they come back signed in.

**Why this priority**: Nothing else in the cloud works without a person and a company.

**Independent Test**: Open the app with no session, sign in, create a company, reload, sign out.

**Acceptance Scenarios**:

1. **Given** the app configured for the cloud and nobody signed in, **When** it opens, **Then** it offers to sign in with GitHub or with an email link (FR-001)
2. **Given** a signed-in person with no company, **When** the app opens, **Then** it asks them to create one before anything else (FR-002)
3. **Given** a signed-in person with companies, **When** the app opens, **Then** the workspace switcher lists their real companies and nobody else's (FR-003)
4. **Given** a signed-in person, **When** they sign out, **Then** the app forgets the session and shows the sign-in again (FR-004)
5. **Given** the service answers that the session is invalid, **When** the app receives it, **Then** it signs the person out (FR-005)
6. **Given** a signed-in person, **When** the session is stored, **Then** the access token is only in the sign-in library's own storage (NFR-002)

---

### User Story 2 - Connect GitHub for real (Priority: P1)

An owner or admin presses one button, installs the GitHub App on the repositories they choose, comes back to the app and sees those repositories. From there they ask for the portrait.

**Why this priority**: This is when the product first touches the person's own code.

**Independent Test**: Start the connection as an owner and as a viewer, complete the round trip and request the portrait.

**Acceptance Scenarios**:

1. **Given** an owner or admin, **When** they press connect, **Then** the app sends them to GitHub to install the App for their company (FR-006)
2. **Given** a viewer or a member, **When** they open the connect page, **Then** they can see the repositories but not start the connection (FR-007)
3. **Given** the person comes back from GitHub, **When** the app opens, **Then** the connected repositories are listed (FR-008)
4. **Given** connected repositories, **When** the person asks for the portrait, **Then** the request is queued and they are taken to the portrait (FR-009)

---

### User Story 3 - The portrait on my own rules (Priority: P1)

The initial portrait screen shows the company's real rules, evidence, baselines and changes, and every decision goes to the service.

**Why this priority**: The portrait is the reason to connect; on demo data it proves nothing.

**Independent Test**: Seed a company with proposed rules and a confirmed rule whose code changed, then work the screen as an approver and as a viewer.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** they open the portrait, **Then** it shows their company's rules and not the demo's (FR-010)
2. **Given** an approver, **When** they confirm, correct or reject a rule, **Then** the decision is stored by the service and still there after a reload (FR-011)
3. **Given** a viewer, **When** they try to decide, **Then** the service refuses and the app says so (FR-012)
4. **Given** confirmed rules, **When** an approver freezes the baseline, **Then** the service stores it and the app shows its hash (FR-011)
5. **Given** a change that touched a confirmed rule, **When** the approver acknowledges it with a reason, **Then** it stops being open (FR-011)
6. **Given** an owner, **When** they allow code analysis for a repository, **Then** the service stores the permission (FR-013)

---

### User Story 4 - The public demo stays as it is (Priority: P1)

Where no cloud is configured, the app behaves exactly as before, with simulated data and no network calls to any service.

**Why this priority**: The demo is how people meet the product, and the exported report must stay a single self-contained file.

**Independent Test**: Build without cloud settings and run the existing browser checks.

**Acceptance Scenarios**:

1. **Given** no cloud configuration, **When** the app runs, **Then** it never contacts a service and shows the demo data labelled as such (FR-014)
2. **Given** no cloud configuration, **When** the app is built, **Then** the sign-in library is not part of the files the demo loads (NFR-001)

---

### Edge Cases

- What happens when the service is down while the person is signed in?
- How does the app behave when the person belongs to several companies?
- What happens when the person returns from GitHub without having finished the installation?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Where the app is configured for the cloud and nobody is signed in, the system MUST offer to sign in with GitHub or with an email link
- **FR-002**: If a signed-in person has no company, then the system MUST ask them to create one before showing anything else
- **FR-003**: The system MUST list in the workspace switcher the companies the service reports for the signed-in person
- **FR-004**: When a person signs out, the system MUST forget the session
- **FR-005**: If the service refuses the session as invalid, then the system MUST sign the person out
- **FR-006**: When an owner or an admin connects GitHub, the system MUST send them to GitHub to install the App for their company
- **FR-007**: While a person's role is viewer or member, the system MUST NOT let them start the GitHub connection
- **FR-008**: When the person returns from GitHub, the system MUST list the repositories connected to the company
- **FR-009**: When a person asks for the portrait of a repository, the system MUST queue the request and show the portrait
- **FR-010**: Where the app is configured for the cloud, the system MUST show the company's rules from the service and not the demo's
- **FR-011**: When a person decides a rule, freezes a baseline or acknowledges a change, the system MUST send it to the service and show the stored result
- **FR-012**: If the service refuses a decision, then the system MUST tell the person why
- **FR-013**: When an owner changes the permission to analyze a repository's code, the system MUST send it to the service
- **FR-014**: Where no cloud is configured, the system MUST NOT contact any service

### Non-Functional Requirements

- **NFR-001**: The system MUST NOT load the sign-in library in an app built without cloud settings
- **NFR-002**: The system MUST NOT write the person's access token anywhere other than the sign-in library's own storage

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in owner goes from the first screen to a decided rule in the portrait in at most 8 interactions, with the data coming from the service
- **SC-002**: A cross-origin page that is not the web app cannot read any answer of the service from a browser
- **SC-003**: The existing browser checks of the demo pass without change

## Assumptions

- The Supabase project, the GitHub App and the service are configured by the owner; the app only needs their public addresses (source: D-008)
- Screens other than sign-in, workspace, connect and the portrait still show demo data, labelled as such, until their own specs move them
