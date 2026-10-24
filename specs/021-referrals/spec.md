# Feature Specification: Referrals

**Feature Branch**: `021-referrals`

**Created**: 2026-10-16

**Status**: Implemented

**Goals**: G-15, G-14, G-11

**Decisions**: D-015, D-014, D-011

**Input**: User description: "A referral system to grow, where the person who referred gets credits"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share my link (Priority: P1)

A person with a verified phone has a personal link and a ready message. They copy it from the usage page and send it.

**Why this priority**: Without a link to send there is no loop.

**Independent Test**: Open the usage page, copy the link and open it in another browser.

**Acceptance Scenarios**:

1. **Given** a person with a verified phone, **When** they open usage, **Then** they see their link and a message ready to send (FR-001)
2. **Given** anyone, **When** they open a link with a code, **Then** they see the product and are told that someone invited them, without the name or the phone of that person (FR-002)

---

### User Story 2 - The invitation survives the sign-up (Priority: P1)

The person invited signs up through the phone, which can take several screens and a return from an outside page, and the invitation is still there at the end.

**Why this priority**: A referral lost during the sign-up is a reward nobody can explain.

**Independent Test**: Open a link, sign up with a test number, and check that the referral is recorded.

**Acceptance Scenarios**:

1. **Given** a person who opened a link, **When** they sign up within 30 days, **Then** the referral is recorded as pending (FR-003)
2. **Given** a person who already had an account, **When** they open a link, **Then** no referral is recorded (FR-004)

---

### User Story 3 - Both are thanked when the invited person gets a result (Priority: P1)

When the invited person gets their first result, they receive credits and so does the person who invited them.

**Why this priority**: Rewarding the sign-up rewards empty accounts. Rewarding the first result rewards the thing we want people to reach.

**Independent Test**: Sign up through a link, build the first portrait, and read both balances.

**Acceptance Scenarios**:

1. **Given** a pending referral, **When** the invited company builds its first portrait or records its first review, **Then** both companies receive 20 credits (FR-005)
2. **Given** a referral already rewarded, **When** the invited company produces more results, **Then** nothing more is granted (FR-006)
3. **Given** the person who invited, **When** they are rewarded, **Then** they are notified (FR-012)

---

### User Story 4 - Cheating does not pay (Priority: P1)

Inviting yourself, or inviting empty accounts, earns nothing, and a person can earn only so much from referrals.

**Why this priority**: Credits cost real money, so a way to print them is a way to lose money.

**Independent Test**: Try to refer your own account, and then refer eleven real accounts in one month.

**Acceptance Scenarios**:

1. **Given** a person, **When** they use their own code, **Then** no referral is recorded (FR-007)
2. **Given** a person who earned for ten referrals this month, **When** another invited person gets a result, **Then** the invited company is rewarded and the person who invited is not (FR-008)
3. **Given** credits earned by a referral, **When** a person tries to move them to another company or turn them into money, **Then** it is not possible (FR-009)
4. **Given** referrals turned off by the owner of the service, **When** someone signs up with a code, **Then** no referral is recorded and the rewards already due are still granted (FR-011)

---

### User Story 5 - I see what my referrals did (Priority: P2)

The person sees how many signed up, how many got a result, what they earned and how much of the monthly limit is left. Never the name or the phone of anyone.

**Why this priority**: A reward that cannot be seen does not make anyone invite again.

**Independent Test**: Make two referrals, activate one, read the numbers.

**Acceptance Scenarios**:

1. **Given** a person with referrals, **When** they open usage, **Then** they see the counts, the credits earned and the monthly limit left (FR-010)

---

### Edge Cases

- What happens when the person who invited has no company yet?
- What happens when the invited person's account is deleted right after the reward?
- What happens when the same device is used for many sign-ups with different numbers?
- What happens when the link is opened in one browser and the sign-up finishes in another?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a person has a verified phone, the system MUST give them one personal code, stable and impossible to guess, and show it as a link with a message ready to send
- **FR-002**: When anyone opens a link with a code, the system MUST say that someone invited them and MUST NOT show the name, the email or the phone of that person
- **FR-003**: When a new account is created and a code from the last 30 days was kept, the system MUST record a pending referral between the two people
- **FR-004**: If the account already existed before the link was opened, then the system MUST NOT record a referral
- **FR-005**: When the invited company builds its first portrait or records its first review, the system MUST grant 20 credits to the invited company and 20 credits to a company that the person who invited owns
- **FR-006**: The system MUST reward each referral at most once
- **FR-007**: If the person who invited and the person invited are the same account or share a verified phone, then the system MUST NOT record the referral
- **FR-008**: If a person already earned for 10 referrals in a calendar month, then the system MUST NOT grant them more that month, and MUST still reward the invited company
- **FR-009**: The system MUST NOT let credits earned by a referral be transferred, exchanged for money, or spent outside the company that received them, and they MUST expire after 6 months
- **FR-010**: The system MUST show a person how many referrals signed up, how many got a result, the credits earned and the monthly limit left, and MUST NOT show who they were
- **FR-011**: Where the owner of the service turns referrals off, the system MUST stop recording new referrals and MUST keep the rewards already due
- **FR-012**: When a referral rewards a person, the system MUST notify them
- **FR-013**: Where the person who invited owns no company when the reward is due, the system MUST hold the reward and grant it to the first company they create within 12 months

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The credits of a referral appear in both balances within one minute of the first result
- **SC-002**: 0 credits are granted for a sign-up that did not reach a first result
- **SC-003**: The credits a person earns from referrals in one calendar month never exceed 200
- **SC-004**: A person who opens a link and signs up in the same browser has the referral recorded in 100% of the runs of the browser check

## Assumptions

- A verified phone is unique per account (source: FR-006 of spec 017), so one person cannot be both sides with the same number; another number is stopped only by the cap, the first result and the expiry
- Credits are those of spec 020 and have the same value there
- The amounts are first guesses to be tuned from the rate of referrals that reach a first result, and they live in configuration, not in code
- Rewarding people who invite other members of their own company is out of scope: that is a member invitation, not a referral
