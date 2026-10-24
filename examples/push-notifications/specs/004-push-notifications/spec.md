# Feature Specification: Push Notifications

**Feature Branch**: `004-push-notifications`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Send mobile push notifications for order updates"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Order shipped alert (Priority: P1)

A customer gets a push notification when their order ships.

**Why this priority**: It cuts "where is my order" support tickets.

**Independent Test**: Ship a test order and receive the alert on a device.

**Acceptance Scenarios**:

1. **Given** a customer with notifications enabled, **When** their order ships, **Then** a push notification with the tracking link arrives

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an order ships, the system MUST send a push notification with the tracking link to the customer's registered devices
- **FR-002**: Where a customer has disabled notifications, the system MUST NOT send push notifications to that customer
- **FR-003**: When a notification cannot be delivered, the system MUST retry delivery up to 3 times within 15 minutes
- **FR-004**: The system MUST record the delivery status of every notification

## Success Criteria *(mandatory)*

- **SC-001**: "Where is my order" support tickets drop by 20% within 60 days
