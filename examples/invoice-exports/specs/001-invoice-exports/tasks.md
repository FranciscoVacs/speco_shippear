# Tasks: Invoice Exports

## Phase 1: Setup

- [X] T001 Create the exports module in src/exports/
- [X] T002 [P] Configure the PDF library in package.json

## Phase 2: Foundational

- [X] T003 Add the finance role check in src/auth/roles.ts

## Phase 3: User Story 1 - Export invoices to CSV (Priority: P1)

- [X] T004 [US1] Stream invoices of a date range as CSV rows in src/exports/csv.ts
- [X] T005 [US1] Include invoice number, customer, date, currency and total in each row in src/exports/csv.ts
- [ ] T006 [US1] Queue large exports in a background job in src/exports/queue.ts
- [ ] T007 [US1] Send a Slack message when a queued export finishes in src/integrations/slack.ts
- [ ] T008 [US1] Add an export history screen with filters in src/ui/ExportHistory.tsx

## Phase 4: User Story 2 - Export a single invoice to PDF (Priority: P2)

- [X] T009 [US2] Render one invoice with its lines and totals as PDF in src/exports/pdf.ts
- [ ] T010 [US2] Add the download PDF button to the invoice page in src/ui/InvoicePage.tsx

## Phase 5: Polish

- [ ] T011 [P] Document the export options in docs/exports.md
