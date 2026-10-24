# Feature Specification: Loyalty Points

**Feature Branch**: `002-loyalty-points`

**Created**: 2026-10-02

**Status**: Draft

**Input**: User description: "Customers earn points on every purchase and redeem them for discounts"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Earn points on purchases (Priority: P1)

A customer completes a purchase and sees the points added to their balance.

**Why this priority**: Points are the core of the programme.

**Independent Test**: Buy one item and read the balance.

**Acceptance Scenarios**:

1. **Given** a signed-in customer, **When** a purchase is paid, **Then** the balance increases by one point per currency unit spent

---

### User Story 2 - Redeem points (Priority: P2)

A customer applies points as a discount at checkout.

**Why this priority**: Redemption is what makes earning worthwhile.

**Independent Test**: Redeem 100 points on an order.

**Acceptance Scenarios**:

1. **Given** a customer with at least 100 points, **When** they apply points at checkout, **Then** the order total drops by the redeemed value

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a purchase is paid, the system MUST add one point per currency unit spent to the customer balance
- **FR-002**: When a customer applies points at checkout, the system MUST reduce the order total by the redeemed value
- **FR-003**: The system MUST show the points balance in a fast and user-friendly way
- **FR-004**: The system MUST handle expired points appropriately
- **FR-005**: When a refund is issued, the system MUST remove the points earned from that purchase

## Success Criteria *(mandatory)*

- **SC-001**: At least 30% of customers redeem points within 90 days of the launch
