# Feature Specification: Billing and plan upgrades

**Feature Branch**: `024-billing`

**Created**: 2026-10-16

**Status**: Implemented

**Goals**: G-17, G-14, G-8

**Decisions**: D-017, D-014, D-003

**Input**: User description: "Build billing and account upgrades, simulated because payments cannot be collected yet, and connect it with the token usage and the limits"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upgrade and get more room (Priority: P1)

An owner or an admin whose company is reaching its limit chooses a paid plan, confirms the price and, as soon as the payment is accepted, the company has the credits and the daily cap of that plan.

**Why this priority**: The limit of the free plan is where the paid plans start (spec 020). An upgrade that does not change the limit is only a button.

**Independent Test**: Use a free company down to zero credits, upgrade it and ask the assistant again.

**Acceptance Scenarios**:

1. **Given** an owner of a free company, **When** they open billing, **Then** they see each plan with its price, its credits for each period and its daily cap (FR-001)
2. **Given** a free company with no credits left, **When** the owner upgrades and the payment is accepted, **Then** the company holds the credits of the new plan for a period that starts now and the assistant answers again (FR-002, FR-005)
3. **Given** a company on a paid plan, **When** it asks for a model action, **Then** the action is reserved, settled and refused like on the free plan, with the daily cap of its plan and without the monthly budget of the free plan (FR-005)
4. **Given** a company on Pro, **When** the owner moves to Team, **Then** the charge is the price of Team minus the unused part of Pro, and never less than zero (FR-004)

---

### User Story 2 - A declined payment changes nothing (Priority: P1)

If the payment is refused, the company stays exactly as it was and the person is told.

**Why this priority**: Giving the plan before the money arrives, or taking it away because a payment failed on the first try, are the two ways billing loses trust.

**Independent Test**: Upgrade with a payment that is declined and read the plan, the balance and the invoices.

**Acceptance Scenarios**:

1. **Given** a payment that is declined, **When** the owner upgrades, **Then** the plan, the balance and the limits are the same as before, a failed attempt is recorded and the person is told (FR-003)
2. **Given** the same request sent twice, **When** the payment is accepted, **Then** the company is charged once and the credits are granted once (FR-014)

---

### User Story 3 - Renew, downgrade and cancel without surprises (Priority: P1)

A paid plan renews by itself each period. Going to a lower plan or cancelling takes effect when the period ends, and the person can change their mind before.

**Why this priority**: What was paid for stays until the period ends, and nothing is charged that the person did not agree to.

**Independent Test**: Schedule a cancellation, undo it, schedule it again, move the clock past the end of the period and read the plan.

**Acceptance Scenarios**:

1. **Given** a paid plan whose period ended, **When** the renewal runs, **Then** the company is charged once, receives the credits of the new period once, and the credits not used in the period before are gone (FR-006)
2. **Given** a paid plan, **When** the owner chooses a lower plan or cancels, **Then** the plan and the limits stay until the period ends, then change, and the owner can undo it before (FR-007)
3. **Given** a renewal whose payment is declined, **When** it happens, **Then** the company keeps its access for three days, the owners are told once, and after that the company is back to the limits of the free plan (FR-008)
4. **Given** a company that was on a paid plan before billing existed, **When** billing is introduced, **Then** it keeps working with the credits of its plan and renews without a charge (FR-015)

---

### User Story 4 - See what I pay and what I paid (Priority: P2)

An owner or an admin sees the plan, when it renews, what is scheduled, and the invoices.

**Why this priority**: A charge without a record to read is a dispute waiting to happen.

**Independent Test**: Upgrade, renew and read the invoices as an owner and as a member.

**Acceptance Scenarios**:

1. **Given** an owner or an admin, **When** they open billing, **Then** they see the plan, the renewal, what is scheduled and an invoice for each attempt with its number, amount, period and state (FR-009)
2. **Given** a member who is not an owner or an admin, **When** they ask for the invoices or try to change the plan, **Then** they get nothing and the change is refused (FR-013)
3. **Given** the simulated payment, **When** any screen shows money, **Then** it says that nothing is charged for real and every invoice is marked as simulated (FR-012)
4. **Given** any request to pay, **When** the service talks to the payment provider, **Then** it sends an amount and a key and never asks for, receives or keeps a card number (FR-010)

---

### User Story 5 - The limit leads to the upgrade (Priority: P1)

The upgrade button of the credits indicator, the chat and the usage page takes the person to the plans, and the renewal date they see is the one of their plan.

**Why this priority**: Spec 020 shows the limit and records the wish to upgrade; this closes the loop.

**Independent Test**: Reach the limit in the chat, press upgrade, pay and go back to the chat.

**Acceptance Scenarios**:

1. **Given** billing is enabled, **When** an owner or admin presses upgrade anywhere, **Then** the intention is recorded as before and the person lands on the plans (FR-016)
2. **Given** no payment provider is configured, **When** anyone presses upgrade, **Then** the app behaves as before: the intention is recorded and nobody is charged (FR-011)
3. **Given** a company on a paid plan, **When** the indicator shows when credits renew, **Then** it shows the end of the period of the plan (FR-016)

---

### Edge Cases

- What happens when two owners press upgrade at the same moment?
- What happens to the free credits a company still holds when it upgrades?
- What happens to the credits of the plan when the company goes back to the free plan in the middle of the period?
- What happens to a company that had a paid plan before billing existed?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Where billing is enabled, the system MUST show an owner or an admin each plan with its price, its credits for each period and its daily cap
- **FR-002**: When an owner or an admin moves a company to a higher plan, the system MUST ask the payment provider for the charge first, and only if it is accepted MUST change the plan and grant the credits of the new plan for a period that starts then
- **FR-003**: If the payment provider declines the charge, then the system MUST leave the plan, the balance and the limits as they were, MUST record the failed attempt and MUST tell the person
- **FR-004**: When a company on a paid plan moves to a higher plan, the system MUST charge the price of the new plan minus the unused part of the current period, by days, and MUST NOT charge less than zero
- **FR-005**: Where a company is on a paid plan, the system MUST meter the model with credits, MUST apply the daily cap of its plan, and MUST NOT apply the monthly budget of the free plan
- **FR-006**: When a paid period ends and no change is scheduled, the system MUST charge the next period once and grant its credits once, and the credits of a period MUST expire when it ends
- **FR-007**: When an owner or an admin chooses a lower plan or cancels, the system MUST keep the current plan and its limits until the period ends, then apply the change, and MUST let them undo it until then
- **FR-008**: If a renewal is declined, then the system MUST keep the plan for three more days, MUST tell the owners once, and after that MUST return the company to the free plan
- **FR-009**: The system MUST keep an invoice for each attempt to charge, with its number, amount, period and state, and MUST show them to owners and admins
- **FR-010**: The system MUST reach the payment provider only through one small interface that has a simulated implementation, and MUST NOT ask for, receive or keep a card number
- **FR-011**: Where no payment provider is configured, the system MUST NOT offer paid plans and MUST keep recording the intention to upgrade as before
- **FR-012**: While the payment provider is the simulated one, the system MUST say in every screen that shows money that nothing is charged for real, and MUST mark each invoice as simulated
- **FR-013**: The system MUST let only the service write billing data, MUST let only the owners and admins of a company read its subscription and invoices, and MUST let only them change its plan
- **FR-014**: When the same plan change is requested twice for the same period, the system MUST charge once and grant the credits once
- **FR-015**: Where a company was on a paid plan before billing existed, the system MUST keep it working with the credits of that plan
- **FR-016**: Where billing is enabled, the upgrade button MUST take an owner or an admin to the plans, and the renewal date shown for a paid company MUST be the end of its period

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A company at zero credits is answering again within one minute of an accepted upgrade, in the browser check
- **SC-002**: 0 plan changes happen without an accepted charge on the invoice that made them
- **SC-003**: 0 companies are charged twice, or receive the credits twice, for the same period in the tests of repeated requests and repeated renewals
- **SC-004**: The model use of a paid company in a period never exceeds the credits it holds, as for the free plan

## Assumptions

- No real payment can be collected yet, so the only provider is a simulated one that accepts or declines a charge and nothing else; a real provider is a later change behind the same interface
- Billing is off until the operator of the service turns it on, so that a public deployment never hands out paid plans for free by accident
- Prices are in US dollars and the amounts in this spec are first guesses to tune from real use: Pro costs 29 and gives 600 credits and a daily cap of 120 for each period, Team costs 99 and gives 2400 credits and a daily cap of 480 (a credit costs us about 0.02 dollars at the most, source: docs/24-growth-gtm.md, to be checked)
- A period is one calendar month from the day of the charge, and a company may hold only one plan at a time
- Taxes, receipts for the tax authority and payment methods are out of scope: the invoices here are the product's own record, not a tax document
- The credits of the plan a company held before it changed are not taken back, because they expire by themselves at the end of their period
