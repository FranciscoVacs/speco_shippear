# Feature Specification: Agent-First App

**Feature Branch**: `005-agent-first-app`

**Created**: 2026-10-14

**Status**: Implemented

**Goals**: G-4

**Input**: User description: "Make the interface an agent-first product: sidebar layout with tenant switcher, user menu, language, theme and notifications; the home page is an empty chat; on other pages the agent lives in a collapsible side panel; the demo deploys to Vercel"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start from the agent (Priority: P1)

A product manager opens the app and finds a chat waiting for a request, not a dashboard to decode.

**Why this priority**: The product is agent-first; the agent has to be the first thing a person meets.

**Independent Test**: Open the root page, press one suggested prompt and read the review card in the answer.

**Acceptance Scenarios**:

1. **Given** a user who opens the root page, **When** the page loads, **Then** the whole page is an empty chat with suggested prompts and a message box (FR-001)
2. **Given** the empty chat, **When** the user sends a message, **Then** the conversation appears and the message box stays at the bottom (FR-002)
3. **Given** the empty chat, **When** the user asks the agent to review a feature, **Then** the answer includes a review card with the count of findings per severity and the most serious findings (FR-003)

---

### User Story 2 - Work with the agent beside any page (Priority: P1)

A reviewer reads a finding and asks the agent about it without leaving the page.

**Why this priority**: Agent-first means the agent is never more than one click away from the work.

**Independent Test**: Open a feature page, ask a question in the side panel, collapse the panel and reopen it.

**Acceptance Scenarios**:

1. **Given** a user on any page other than the root page, **When** the page loads, **Then** the agent appears in a side panel on the right (FR-004)
2. **Given** the side panel is open, **When** the user collapses it, **Then** the panel closes, the conversation is kept and a button reopens it (FR-005)
3. **Given** the user is on the page of a feature, **When** the user opens the panel, **Then** the panel shows that feature as the context of the agent (FR-006)
4. **Given** a conversation started on the root page, **When** the user goes to another page, **Then** the same conversation is in the side panel (FR-007)

---

### User Story 3 - Navigate like a real product (Priority: P1)

A new user finds every part of the product from a sidebar and a top bar, as in any production application.

**Why this priority**: Familiar navigation lowers the cost of learning a new tool.

**Independent Test**: Reach every section with the mouse and again with the keyboard only.

**Acceptance Scenarios**:

1. **Given** the app is open, **When** the user looks at the left edge, **Then** a sidebar shows the main sections and can be collapsed to icons (FR-008)
2. **Given** the sidebar, **When** the user opens the tenant switcher, **Then** it lists the workspaces of the user and switches to the chosen one (FR-009)
3. **Given** the top bar, **When** the user opens the user menu, **Then** it offers profile, language, theme, documentation, help and log out (FR-010)
4. **Given** the user menu, **When** the user chooses log out, **Then** the app shows a signed-out screen with a button that signs in again (FR-011)
5. **Given** the top bar, **When** the user opens the notifications, **Then** recent events are listed and become read (FR-012)
6. **Given** any page, **When** the user presses the command palette shortcut, **Then** a palette opens that searches pages, features and rules (FR-013)
7. **Given** only a keyboard, **When** the user goes through the sidebar, the menus, the palette and the panel, **Then** each control can be reached and used (FR-020)

---

### User Story 4 - See what a production workspace offers (Priority: P2)

A buyer evaluating the product sees the pages a team would expect: members, API keys, integrations, usage and notification settings.

**Why this priority**: A demo that looks like a toy does not convince a team to adopt a product.

**Independent Test**: Open each settings page and check it is labelled as demo data.

**Acceptance Scenarios**:

1. **Given** a page that shows simulated data, **When** the user looks at it, **Then** it is labelled as demo data (FR-014)

---

### User Story 5 - Use it in my language (Priority: P3)

A user who prefers English switches the interface language.

**Why this priority**: Teams are international and a language switch is expected in a product.

**Independent Test**: Switch to English and read the sidebar and the menus.

**Acceptance Scenarios**:

1. **Given** the interface in Spanish, **When** the user switches the language to English, **Then** the sidebar, the menus and the new pages show English texts (FR-015)

---

### User Story 6 - Share the demo on Vercel (Priority: P1)

A founder deploys the demo to Vercel and sends the link to a prospect.

**Why this priority**: The demo is how the product is shown to customers.

**Independent Test**: Build the app, serve the output as static files and open a deep link.

**Acceptance Scenarios**:

1. **Given** the production build, **When** it is served as static files without any server of ours, **Then** the app works and answers with the simulated agent (FR-017, FR-018)
2. **Given** a deployed demo, **When** the visitor opens the address of an inner page directly, **Then** that page is shown (FR-016)
3. **Given** a local server with a model, **When** the app can reach it, **Then** the conversation uses that model instead of the simulation (FR-019)

---

### Edge Cases

- What happens when the side panel is open on a narrow phone screen?
- How does the command palette behave when no result matches?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a user opens the root page, the system MUST show an empty chat with suggested prompts and a message box as the whole page
- **FR-002**: When the user sends a message on the root page, the system MUST show the conversation with the message box at the bottom
- **FR-003**: When the user asks the agent to review a feature, the system MUST answer with a review card that shows the count of findings per severity and the most serious findings
- **FR-004**: While the user is on a page other than the root page, the system MUST show the agent in a side panel on the right
- **FR-005**: When the user collapses the side panel, the system MUST keep the conversation and show a button that reopens the panel
- **FR-006**: While the user is on the page of a feature, the system MUST show that feature as the context of the agent
- **FR-007**: The system MUST keep one conversation shared by the root page and the side panel
- **FR-008**: The system MUST show a sidebar with the main sections that the user can collapse to icons
- **FR-009**: When the user opens the tenant switcher, the system MUST list the workspaces of the user and switch to the one the user chooses
- **FR-010**: When the user opens the user menu, the system MUST offer profile, language, theme, documentation, help and log out
- **FR-011**: When the user chooses log out, the system MUST show a signed-out screen from which the user can sign in again
- **FR-012**: When the user opens the notifications, the system MUST list recent events and mark them as read
- **FR-013**: When the user presses the command palette shortcut, the system MUST open a palette that searches pages, features and rules
- **FR-014**: Where a page shows simulated data, the system MUST label it as demo data
- **FR-015**: When the user switches the language, the system MUST show the texts of the shell and of the new pages in that language
- **FR-016**: When the user opens the address of an inner page directly, the system MUST show that page
- **FR-017**: The system MUST build into static files that run on Vercel without a server of ours
- **FR-018**: While no backend can be reached, the system MUST answer with a simulated agent and state that the answers are examples
- **FR-019**: While a backend with a model can be reached, the system MUST use that model for the conversation
- **FR-020**: The system MUST let the user reach and use the sidebar, the menus, the palette and the side panel with the keyboard alone

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the root page, a visitor gets a review card in at most 2 interactions
- **SC-002**: The JavaScript needed to show the first view of any page, before the first interaction and without the prefetch that runs later when the browser is idle, is at most 250 KB gzipped
- **SC-003**: In 100% of the tested inner pages, opening the address directly shows that page

## Assumptions

- Sign-in, workspaces, members, billing and notifications are simulated in the demo
- The public demo never calls a language model; only a local server can
