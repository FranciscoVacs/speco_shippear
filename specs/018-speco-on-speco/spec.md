# Feature Specification: Speco on Speco

**Feature Branch**: `018-speco-on-speco`

**Created**: 2026-10-15

**Status**: Draft

**Goals**: G-12, G-3, G-8

**Decisions**: D-012, D-009, D-008

**Input**: User description: "Speco's own repository must be the first company connected to Speco, so we try everything on ourselves first and iterate faster; for that the MCP must work and a Claude session must be able to connect to it with OAuth"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Speco is its own first company (Priority: P1)

The repository of Speco is connected to a company in Speco, which shows its inventory, its rules, its baseline and its changes like any other company.

**Why this priority**: It is how we find what is wrong before anybody else does.

**Independent Test**: Connect the repository and read the portrait of Speco.

**Acceptance Scenarios**:

1. **Given** the Speco repository, **When** it is connected, **Then** the company sees its specs reviewed and its portrait proposed (FR-001)
2. **Given** a confirmed rule of Speco, **When** a commit changes its supporting lines, **Then** a change awaiting a decision is opened (FR-002)

---

### User Story 2 - A remote MCP that any Claude can reach (Priority: P1)

Speco exposes an MCP endpoint over the web. A person adds it once as a connector in Claude, signs in through the browser and the session can then use Speco with that person's identity.

**Why this priority**: The local MCP only works on a machine with a checkout; the loop needs Claude sessions anywhere to reach the same data a person sees.

**Independent Test**: Add the endpoint as a connector, sign in and list the pending decisions from a Claude session.

**Acceptance Scenarios**:

1. **Given** a client with no access, **When** it calls the endpoint, **Then** it is told where and how to get authorized (FR-003)
2. **Given** a Claude client, **When** it registers itself, **Then** it does so without a person configuring it by hand (FR-004)
3. **Given** a person who signs in and accepts, **When** the client calls the tools, **Then** it sees only what that person sees (FR-005)
4. **Given** an access that did not come from a client authorized by a person, **When** it is presented to the endpoint, **Then** it is refused (FR-006)

---

### User Story 3 - Agents read and propose, never decide (Priority: P1)

The tools let an agent look at decisions, reviews, rules and changes, and check a draft spec before it implements it. No tool decides, confirms, approves or freezes anything.

**Why this priority**: The decision belongs to a person; an agent that could decide would defeat the product.

**Independent Test**: List the tools and try every write through a connected session.

**Acceptance Scenarios**:

1. **Given** a connected session, **When** it asks what waits for a person's decision, **Then** it gets the list (FR-007)
2. **Given** a draft spec in text, **When** the session checks it, **Then** it gets the review without anything being stored (FR-008)
3. **Given** any tool, **When** it is called, **Then** it cannot record an approval, confirm or reject a rule, freeze a baseline or acknowledge a change (FR-009)
4. **Given** the access of a connected client, **When** it is used directly against the database or the web API instead of the tools, **Then** any decision is still refused (FR-011)

---

### User Story 4 - Speco-first: check before building, compare after (Priority: P1)

When a feature of Speco is built with an agent, the agent checks the draft spec through the MCP before implementing, and after the merge the portrait and the changes show whether a decided rule moved.

**Why this priority**: It is the recursive loop that makes us the first users and lets us iterate faster.

**Independent Test**: Build one small feature of Speco following the loop and read the result in Speco.

**Acceptance Scenarios**:

1. **Given** a new spec in the Speco repository, **When** a session checks it before implementing, **Then** the questions that would make an agent guess are listed (FR-008)
2. **Given** the feature is merged, **When** the repository syncs, **Then** a decided rule that moved shows as a change awaiting a decision (FR-002)
3. **Given** the product folder of Speco, **When** a change touches the goals or the decisions, **Then** it needs a person's approval (FR-010)

---

### Edge Cases

- What happens when the person revokes the connector in Claude?
- How are two Claude sessions of the same person handled?
- What happens when Speco reviews a change to Speco that breaks the review itself?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the Speco repository is connected, the system MUST review its specs and propose its portrait like any other company
- **FR-002**: When a commit changes the supporting lines of a confirmed rule of Speco, the system MUST open a change awaiting a decision
- **FR-003**: If a client calls the MCP endpoint with no access, then the system MUST tell it where and how to get authorized
- **FR-004**: When a Claude client registers itself, the system MUST accept it without manual configuration
- **FR-005**: While a client acts for a person, the system MUST show it only what that person can see
- **FR-006**: If an access did not come from a client authorized by a person, then the system MUST refuse it at the MCP endpoint
- **FR-007**: When a connected session asks what waits for a decision, the system MUST list it
- **FR-008**: When a session checks a draft spec, the system MUST return its review and MUST NOT store the draft
- **FR-009**: The system MUST NOT offer any MCP tool that records an approval, confirms or rejects a rule, freezes a baseline or acknowledges a change
- **FR-011**: If the access of a connected client is used to decide, then the database MUST refuse it
- **FR-010**: When a change touches the goals or the decisions of a product, the system MUST require a person's approval

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person adds the connector and lists their pending decisions from a Claude session in at most 5 interactions
- **SC-002**: 0 MCP tools, and 0 direct uses of a connected client's access, can change a decision, a rule, a baseline or a change
- **SC-003**: The Speco repository has a portrait and a baseline in Speco before any other company is invited

## Assumptions

- The access tokens that Supabase issues to a client carry the client's identifier and give the same reach as the person's own session, with no custom scopes yet, so the limit to read only is enforced by us in the database and in the service (source: Supabase OAuth 2.1 server guide)
- Supabase Auth acts as the OAuth 2.1 authorization server (beta, free on all plans), including registration of MCP clients, and Speco hosts the consent screen (source: D-008)
- A person adds the connector to their own Claude; no session can add it to itself (source: D-012)
- The existing local MCP keeps working for people who work on a checkout without the cloud
