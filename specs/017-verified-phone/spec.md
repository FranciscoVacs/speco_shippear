# Feature Specification: Verified Phone

**Feature Branch**: `017-verified-phone`

**Created**: 2026-10-15

**Status**: Draft

**Goals**: G-11, G-8

**Decisions**: D-011, D-008

**Input**: User description: "Use Supabase's SMS verification for registration so we always capture real users and no fake emails"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign up with my phone (Priority: P1)

A new person types their phone number, receives a code by SMS, types it and is in. The country defaults to Argentina and other countries can be chosen.

**Why this priority**: It is the registration path that guarantees a real person.

**Independent Test**: Sign up with a test number and its fixed code.

**Acceptance Scenarios**:

1. **Given** the sign-in screen, **When** the person enters a valid number, **Then** a six digit code is sent by SMS (FR-001)
2. **Given** a sent code, **When** the person enters it before it expires, **Then** they are signed in (FR-002)
3. **Given** a wrong or expired code, **When** the person enters it, **Then** they are told so and can ask for a new one (FR-003)

---

### User Story 2 - Every account has a verified phone (Priority: P1)

A person who signs in with GitHub or with an email still has to verify a phone before using the product, so no account exists without one.

**Why this priority**: A rule with a bypass is not a rule.

**Independent Test**: Sign in with GitHub and try to use the product before verifying a phone.

**Acceptance Scenarios**:

1. **Given** a signed-in person with no verified phone, **When** they open the app, **Then** they are asked to verify one before anything else (FR-004)
2. **Given** a signed-in person with no verified phone, **When** their access reaches the service directly, **Then** the service refuses it (FR-005)
3. **Given** a phone already verified by another account, **When** a person tries to use it, **Then** they are refused (FR-006)

---

### User Story 3 - Abuse of the SMS cannot cost us money (Priority: P1)

Somebody who requests thousands of codes to numbers they do not own cannot run up the SMS bill.

**Why this priority**: SMS pumping is the main way phone sign-up is abused and every message costs money.

**Independent Test**: Request many codes from one source and for one number.

**Acceptance Scenarios**:

1. **Given** repeated requests for one number, **When** they exceed the limit, **Then** further codes are refused for a while (FR-007)
2. **Given** a request from a source that did not pass the human check, **When** it arrives, **Then** no SMS is sent (FR-008)
3. **Given** the daily budget of messages is used, **When** another request arrives, **Then** it is refused and the owner is told (FR-009)

---

### User Story 4 - We can test it without sending SMS (Priority: P2)

Our automatic checks sign up with test numbers and fixed codes, and never send a real message.

**Why this priority**: Without it the registration cannot be verified in a browser check.

**Independent Test**: Run the browser check with a test number.

**Acceptance Scenarios**:

1. **Given** a number declared as a test number, **When** the check signs up with its fixed code, **Then** it is signed in and no SMS is sent (FR-010)

---

### Edge Cases

- What happens when a person changes number or loses their phone?
- How are numbers that belong to a country where SMS is not delivered handled?
- What happens when the SMS provider is down?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a person enters a valid phone number, the system MUST send a six digit code by SMS
- **FR-002**: When a person enters the right code before it expires, the system MUST sign them in
- **FR-003**: If the code is wrong or has expired, then the system MUST say so and offer a new one
- **FR-004**: While a signed-in person has no verified phone, the system MUST ask them to verify one before showing anything else
- **FR-005**: If an access has no verified phone, then the service MUST refuse it
- **FR-006**: If a phone is already verified by another account, then the system MUST refuse it for a second one
- **FR-007**: If requests for one number exceed the limit, then the system MUST refuse further codes for a while
- **FR-008**: If a request has not passed the human check, then the system MUST NOT send an SMS
- **FR-009**: If the daily budget of messages is used, then the system MUST refuse new requests and tell the owner
- **FR-010**: Where a number is declared as a test number, the system MUST accept its fixed code without sending an SMS

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person completes the sign-up from the number to being inside in at most 90 seconds with the code at hand
- **SC-002**: 0 requests to the service with an access that has no verified phone succeed
- **SC-003**: A script that requests 100 codes for 100 numbers from one source sends at most the allowed few

## Assumptions

- The owner configures an SMS provider supported by Supabase (Twilio, Twilio Verify, MessageBird or Vonage) and bears the cost of each message (source: Supabase phone login guide)
- The verified phone is part of the access the person gets from Supabase, so the service can check it without asking again (source: D-011)
- The phone number is personal data: it stays with the sign-in provider and is never returned by the API
