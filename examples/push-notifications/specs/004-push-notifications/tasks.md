# Tasks: Push Notifications

## Phase 3: User Story 1 - Order shipped alert (Priority: P1)

- [ ] T001 [US1] Send a push notification with the tracking link to the registered devices of the customer when an order ships in src/push/sender.kt
- [ ] T002 [US1] Skip customers who disabled notifications in src/push/preferences.kt
- [ ] T003 [US1] Retry failed deliveries up to 3 times within 15 minutes in src/push/retry.kt
- [ ] T004 [US1] Record the delivery status of every notification in src/push/delivery-log.kt
