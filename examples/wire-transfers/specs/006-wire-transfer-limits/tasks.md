# Tasks: Wire Transfer Limits and Fraud Holds

## Phase 3: User Story 1 - Send a wire within limits (Priority: P1)

- [ ] T001 [US1] Charge 0.5% fee with a 2.00 USD minimum when a wire is confirmed in src/transfers/fee-calculator.java (FR-001)
- [ ] T002 [US1] Reject a wire that exceeds the daily limit of the customer tier in src/transfers/limit-check.java (FR-002)
- [ ] T003 [US1] Round fees to the nearest cent in src/transfers/fee-calculator.java (FR-010)

## Phase 4: User Story 2 - Review a held transfer (Priority: P2)

- [ ] T004 [US2] Hold wires above 10,000 USD in the analyst review queue in src/transfers/review-queue.java (FR-005)
- [ ] T005 [US2] Record analyst decisions in the audit log in src/transfers/review-queue.java (FR-006)
- [ ] T006 [US2] Refund the amount and fee of rejected wires in src/transfers/refund-job.java (FR-009)
- [ ] T007 [US2] Send a weekly digest of held transfers to the compliance team in src/transfers/digest.java
