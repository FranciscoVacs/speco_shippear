# Feature Specification: Wire Transfer Limits and Fraud Holds

**Feature Branch**: `006-wire-transfer-limits`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Enforce per-customer transfer limits, fees and fraud holds on outgoing wire transfers, as required by compliance"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send a wire within limits (Priority: P1)

A verified customer sends a wire transfer and sees the fee before confirming.

**Why this priority**: Outgoing wires are the main revenue line and must never break compliance limits.

**Independent Test**: Send a wire below the daily limit and check the ledger entries.

**Acceptance Scenarios**:

1. **Given** a customer with a verified identity, **When** they confirm a wire below their daily limit, **Then** the transfer is queued and the fee is shown (FR-001)
2. **Given** a customer who has reached the daily limit, **When** they confirm another wire, **Then** the transfer is rejected with the remaining limit (FR-002)

---

### User Story 2 - Review a held transfer (Priority: P2)

A compliance analyst reviews a transfer that was held by a fraud rule and releases or rejects it.

**Why this priority**: Held transfers block customers' money, so analysts need to resolve them quickly.

**Independent Test**: Trigger a hold with a test transfer and release it as an analyst.

**Acceptance Scenarios**:

1. **Given** a transfer held for review, **When** an analyst releases it, **Then** the transfer is queued and the decision is recorded (FR-006)

---

### Edge Cases

- What happens when the exchange rate changes between confirmation and settlement?
- How is the daily limit counted for a transfer that is later rejected by the bank?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a verified customer confirms a wire, the system MUST charge a fee of 0.5% of the amount, with a minimum of 2.00 USD
- **FR-002**: When the sum of a customer's wires in a calendar day exceeds the daily limit of their tier, the system MUST reject the wire
- **FR-003**: System MUST set the daily limit to 5,000 USD for tier 1 customers and 25,000 USD for tier 2 customers
- **FR-005**: When a wire is above 10,000 USD, the system MUST hold it for manual review by a compliance analyst
- **FR-006**: When an analyst releases or rejects a held wire, the system MUST record who decided, when and why
- **FR-007**: When a wire matches a fraud rule, the system MUST hold it in the analyst review queue.
- **FR-008**: The system MUST let an analyst resolve a held transfer within 4 business hours of it being held.
- **FR-009**: When a wire is rejected after being queued, the system MUST refund the amount and the fee to the customer account
- **FR-010**: System MUST round fees to the nearest cent
- **FR-011**: System MUST keep the audit trail of every limit decision for 5 years. On a customer deletion request, the system MUST anonymize the customer's personal data in the audit trail and keep the decision records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 99% of held transfers are resolved by an analyst within 4 business hours
- **SC-002**: Zero transfers settle above the customer's daily limit

## Assumptions

- Customers are classified into tiers by the KYC service
- Sanctions screening already runs before the transfer reaches this feature
