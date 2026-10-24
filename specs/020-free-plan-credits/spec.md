# Feature Specification: Free plan with credits

**Feature Branch**: `020-free-plan-credits`

**Created**: 2026-10-16

**Status**: Implemented

**Goals**: G-14, G-7, G-8

**Decisions**: D-014, D-001, D-003, D-011

**Input**: User description: "Offer a free tier with limits so we do not spend many tokens, and so a person can see the result quickly"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a first result at no cost (Priority: P1)

A new person creates their company, connects code (or tells their idea) and gets a first result without entering a card. The deterministic parts cost us nothing and are never limited. One model-assisted run is included so the first portrait is as good as the product can make it.

**Why this priority**: The free plan exists so that someone sees the value within five minutes (G-7). A free plan that runs out before the first result is worth nothing.

**Independent Test**: Create a new company, connect a repository and build the portrait with the welcome credits only.

**Acceptance Scenarios**:

1. **Given** a company just created, **When** it is created, **Then** it holds its welcome credits (FR-001)
2. **Given** a company with no credits at all, **When** it reviews a spec or decides on a rule, **Then** it works as always (FR-002)
3. **Given** the welcome credits, **When** the company builds its first portrait with the model, **Then** the portrait is built and the credits spent are shown (FR-004, FR-005)

---

### User Story 2 - The free plan cannot cost more than we decided (Priority: P1)

Whatever anyone does, a free company can use at most a known amount of model each month, and the whole free plan can use at most a known amount in total.

**Why this priority**: A free plan with no ceiling is a bill that grows with the success of the product.

**Independent Test**: Ask for model-assisted actions until the balance, the daily cap and the monthly budget are each reached.

**Acceptance Scenarios**:

1. **Given** a balance lower than what an action may cost at most, **When** the action is requested, **Then** it is refused before the model is called (FR-004)
2. **Given** an action that used fewer tokens than reserved, **When** it ends, **Then** only the real use is charged (FR-005)
3. **Given** a single request, **When** it is sent to the model, **Then** it never exceeds the fixed size for that kind of action (FR-007)
4. **Given** a company that reached its daily cap, **When** it asks for another model action, **Then** it is refused until tomorrow (FR-008)
5. **Given** the monthly budget of the free plan is used, **When** a free company asks for a model action, **Then** it is refused and the owner of the service is told (FR-009)
6. **Given** a model call that fails after the reservation, **When** it fails, **Then** the whole reservation is released and the balance is as before (FR-014)
7. **Given** the first day of a month, **When** it starts, **Then** a free company holds 30 monthly credits and the unused ones of the month before are gone (FR-003)
8. **Given** a person who is not a member of a company, **When** they ask for its credits or try to write them, **Then** they get nothing and the write is refused (FR-012)

---

### User Story 3 - I always know what I have and what happens next (Priority: P1)

The company sees its balance, when it renews, what used it, and what stops working at zero, which is only what needs a model.

**Why this priority**: A limit that arrives as a surprise feels like a bug. A limit that was visible feels like a plan.

**Independent Test**: Use the credits down to zero and read the usage page and the messages shown on the way.

**Acceptance Scenarios**:

1. **Given** a company of any role, **When** an owner or admin opens usage, **Then** they see the balance, the next renewal and the recent uses (FR-011)
2. **Given** a balance under a fifth of the month, **When** it is crossed, **Then** the owner is told once (FR-013)
3. **Given** a balance of zero, **When** a model action is requested, **Then** the message says what paused, when it renews, and that everything else keeps working (FR-006)

---

### User Story 4 - One person cannot multiply the free plan (Priority: P2)

A person who already owns a free company can create another, but the second one does not receive free credits.

**Why this priority**: The phone already makes every account a real person (D-011); this closes the other door, which is many companies for one person.

**Independent Test**: Create two companies with the same account.

**Acceptance Scenarios**:

1. **Given** a person who owns a company that received the free plan, **When** they create another, **Then** the second one receives no free credits (FR-010)

---

### User Story 5 - I see my limit coming and can do something about it (Priority: P1)

Wherever the person is, a small indicator shows how many credits are left and when they come back. When the limit is close the chat warns them, and when it is reached the chat says so, with a way to upgrade and a way to earn more.

**Why this priority**: A limit that is only discovered by being refused feels like a bug. A limit that was visible, with a way out, is a plan, and the way out is where the paid plans start.

**Independent Test**: Use the credits of a company down to zero in the chat and watch the indicator and the chat on the way.

**Acceptance Scenarios**:

1. **Given** a person who can ask the assistant, **When** they are in any page, **Then** they see how many credits are left and, in a panel, when they reset (FR-015)
2. **Given** less than a fifth of the credits granted, **When** the person opens the chat, **Then** it warns that they are reaching their limit, with what is left and when it resets (FR-016)
3. **Given** not enough credits for another answer, or an answer refused for that, **When** the person is in the chat, **Then** it says they reached their limit and when it resets, and a closed warning does not hide it (FR-016)
4. **Given** an owner or an admin, **When** they press upgrade, **Then** the request is recorded once a day for that place and they are told so (FR-017)
5. **Given** a member who cannot upgrade, **When** they see the limit, **Then** they are told to ask an admin and no button is shown (FR-017)

---

### Edge Cases


- What happens when the model call fails after credits were reserved?
- What happens when two actions are requested at the same moment with a balance for only one?
- What happens to a company that was free and becomes paid in the middle of the month?
- What happens with credits that were not used when the month ends?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a company is created, the system MUST grant it 20 welcome credits that expire 30 days later
- **FR-002**: The system MUST NOT charge credits for a deterministic review, a rule, a decision or an approval
- **FR-003**: Where a company is on the free plan, the system MUST grant it 30 credits at the start of each calendar month, and unused monthly credits MUST expire at the end of that month
- **FR-004**: When a model-assisted action is requested, the system MUST reserve its largest possible cost before calling the model, and MUST refuse the action if the balance is lower
- **FR-005**: When a model-assisted action ends, the system MUST charge the tokens really used and release the rest of the reservation
- **FR-006**: If the balance is zero, then the system MUST keep every deterministic feature working and MUST say which feature paused and when credits renew
- **FR-007**: The system MUST NOT send the model more than 30 files and 300 KB of code in one portrait run, nor more than 40 000 tokens in one conversation turn
- **FR-008**: If a company has used more than 40 credits in one day, then the system MUST refuse further model actions until the next day
- **FR-009**: If the monthly budget of the free plan is used, then the system MUST pause the model for free companies only and MUST tell the owner of the service
- **FR-010**: Where a person already owns a company that received the free plan, the system MUST NOT grant the free plan or the welcome credits to another company created by that person
- **FR-011**: The system MUST show an owner or an admin the balance, the next renewal and the recent uses by kind of action
- **FR-012**: The system MUST let a person read the credits of their companies and MUST let only the service write them, and a balance MUST NOT go below zero
- **FR-013**: When a balance falls under a fifth of what the month granted, the system MUST tell the owner once for that month
- **FR-014**: If the model call fails, then the system MUST release the whole reservation
- **FR-015**: While a person who can ask the assistant is in the app, the system MUST show how many credits are left, what was granted and when they reset
- **FR-016**: When less than a fifth of the credits granted is left, or another answer cannot be paid, the system MUST say so in the chat, and MUST keep saying it once the limit is reached
- **FR-017**: When an owner or an admin asks to upgrade, the system MUST record the request once per place and day, and MUST NOT show the option to anyone else

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new company reaches its first portrait in at most five minutes with only the welcome credits
- **SC-002**: 0 model calls are made without a reservation in the ledger
- **SC-003**: The model use of one free company in a month never exceeds 30 credits plus the welcome and earned credits it holds
- **SC-004**: With a balance of zero, 100% of the deterministic reviews of a company still complete

- **SC-005**: Every answer of the assistant tells the app how many credits are left after that answer was charged

## Assumptions

- One credit is 10 000 tokens, where an output token counts five times an input token, which follows the proportion of the price of the model (source: published price of the model, to be checked)
- A portrait run with the model costs at most 10 credits, because it is bounded to 300 KB of code (source: MAX_CODE_BYTES in the portrait extractor)
- The amounts in this spec are first guesses to be tuned from real use, and they live in configuration, not in code
- Payment is out of scope: Pro and Team stay as they are today and nothing is charged yet, so upgrading records the intention (to measure the willingness to pay) and tells the person that paid plans are not open yet
- The limit is close when less than a fifth of what is granted is left, and reached when what is left cannot pay another answer (one answer reserves 5 credits)
