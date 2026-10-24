# Feature Specification: Invoice Exports

**Feature Branch**: `001-invoice-exports`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Let finance users export invoices to CSV and PDF"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export invoices to CSV (Priority: P1)

A finance user selects a date range and downloads the invoices as a CSV file.

**Why this priority**: Accountants need the data in spreadsheets every month-end.

**Independent Test**: Export one month and open the file in a spreadsheet.

**Acceptance Scenarios**:

1. **Given** a finance user on the invoices page, **When** they choose a date range and press export, **Then** a CSV file with one row per invoice downloads
2. **Given** a date range with no invoices, **When** the user presses export, **Then** the user sees a message that there is nothing to export

---

### User Story 2 - Export a single invoice to PDF (Priority: P2)

A finance user downloads one invoice as a PDF to send it to a customer.

**Why this priority**: Customers ask for a formatted copy of a single invoice.

**Independent Test**: Open an invoice and download the PDF.

**Acceptance Scenarios**:

1. **Given** an invoice, **When** the user presses download PDF, **Then** a PDF with the invoice number, lines and totals downloads

---

### Edge Cases

- What happens when the export has more than 100000 invoices?
- How are amounts in different currencies shown in one file?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a finance user presses export with a date range, the system MUST generate a CSV file with one row per invoice in the range
- **FR-002**: System MUST include invoice number, customer, date, currency and total in every CSV row
- **FR-003**: When the date range has no invoices, the system MUST show a message that there is nothing to export
- **FR-004**: When a user presses download PDF on an invoice, the system MUST generate a PDF with the invoice number, lines and totals
- **FR-005**: System MUST make exports quick even for large date ranges
- **FR-006**: System MUST only allow users with the finance role to export invoices
- **FR-007**: System MUST keep exported files for 30 days
- **FR-008**: System MUST delete exported files after 7 days
- **FR-009**: System MUST email the user a link when an export takes longer than expected
- **FR-010**: System MUST record who exported which invoices and when

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of CSV exports of one month finish in under 10 seconds
- **SC-002**: Finance users complete a PDF download in under 3 clicks

## Assumptions

- Invoices already exist in the billing database
- The finance role already exists
