# Feature Specification: Developer Onboarding

**Feature Branch**: `023-developer-onboarding`

**Created**: 2026-10-16

**Status**: Implemented

**Goals**: G-7, G-3

**Decisions**: D-001, D-002

**Input**: User description: "Make it as easy as possible for a developer to start using the command line tool and the MCP server, with documentation and examples, so the time to the first useful result is as short as possible"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A first result with nothing set up (Priority: P1)

A developer who has heard of the tool wants to see what it finds before deciding to adopt it, without a repository of their own and without an account.

**Why this priority**: A developer who needs more than one command to see a result usually does not continue, so the first result decides adoption.

**Independent Test**: In an empty folder with no Spec Kit repository, run the demo command and then run the tool on a folder that has no features.

**Acceptance Scenarios**:

1. **Given** a machine with no repository and no network after the package is installed, **When** the developer runs the demo command, **Then** the tool reviews a bundled sample feature and prints its blockers (FR-001)
2. **Given** the demo command with no options, **When** it prints the review, **Then** it shows only the blockers, and with `--all-findings` it also shows warnings and suggestions (FR-002)
3. **Given** a target folder that is not empty, **When** the developer passes it as the demo folder, **Then** the tool refuses to copy into it and says so (FR-003)
4. **Given** a folder that holds no features but has features in a subfolder, **When** the developer reviews it, **Then** the error names the subfolders that do hold features and the exact command to run (FR-004)
5. **Given** a folder with no features anywhere nearby, **When** the developer reviews it, **Then** the error suggests the demo command, and when the path does not exist it says so (FR-005)

---

### User Story 2 - Connect my agent in two minutes (Priority: P1)

A developer who uses a coding agent wants the agent to review the spec before it implements, and needs the exact configuration for the client they use.

**Why this priority**: The agent checking its own spec is the main value of the MCP server, and a wrong configuration file is the most common reason for giving up.

**Independent Test**: Open the developer page, pick each client and copy its configuration.

**Acceptance Scenarios**:

1. **Given** the developer page, **When** it opens, **Then** it offers one tab for each of Claude Code, Cursor, VS Code, Claude Desktop and Codex, and each tab shows a configuration with a copy button (FR-006)
2. **Given** a configuration written in JSON, **When** the developer copies it, **Then** it parses as valid JSON (FR-007)
3. **Given** a client the developer picked, **When** they return to the page, **Then** the same client is selected (FR-008)
4. **Given** the tabs, **When** the developer uses the arrow keys, Home or End, **Then** the selection and the focus move between tabs (FR-009)
5. **Given** the developer page, **When** it opens, **Then** it shows a command that checks the server without a client and the list of the seven tools the server offers (FR-010)

---

### User Story 3 - Learn from examples (Priority: P2)

A developer wants to know what they can achieve with the tool in their daily work before investing time, and wants prompts they can paste into their agent.

**Why this priority**: Examples with a real output make the value concrete, which a list of commands does not.

**Independent Test**: Open every recipe, copy a prompt and reach the page from three places in the app.

**Acceptance Scenarios**:

1. **Given** the developer page, **When** the developer opens a recipe, **Then** it shows the problem, what to run, a real output when the recipe has one and what is gained (FR-011)
2. **Given** the prompts table, **When** the developer presses the copy button of a row, **Then** the prompt of that row is copied (FR-012)
3. **Given** any page of the app, **When** the developer opens the help menu, uses the command palette or opens the product guide, **Then** each of the three leads to the developer page (FR-013)

---

### User Story 4 - Trust it and read it in my language (Priority: P2)

A developer who reads English, or who copies a command from the page into a terminal, expects the page to be complete and the commands to work.

**Why this priority**: Documentation that disagrees with the tool costs more trust than missing documentation.

**Independent Test**: Switch the language, compare the page with the markdown guides and compare every shown output with what the tool prints.

**Acceptance Scenarios**:

1. **Given** the language set to English, **When** the developer page opens, **Then** its headings and its body are in English with no notice that the content is in Spanish (FR-014)
2. **Given** the page, the quickstart and the recipes guide, **When** the automated tests run, **Then** every command of the page appears in the markdown guides and every output of the page is what the tool prints today (FR-015)
3. **Given** a phone screen 390 pixels wide, **When** the page opens in the light or the dark theme, **Then** the page does not scroll sideways (FR-016)
4. **Given** a link with an address ending in `#dev-<section>`, **When** it opens, **Then** the page scrolls to that section and moves the focus to it (FR-017)

---

### Edge Cases

- What happens when browser storage is blocked and the chosen client cannot be remembered?
- What happens when the clipboard is not available and the copy button cannot copy?
- How does the page behave in an exported report that is opened from a file?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the developer runs the demo command, the system MUST copy a sample feature bundled in the package to a folder and review it without needing a repository, a network or a key
- **FR-002**: When the demo command runs, the system MUST show only the blockers unless the developer passes `--all-findings`
- **FR-003**: If the folder given to the demo command exists and is not empty, then the system MUST refuse to copy into it with the usage error code
- **FR-004**: If a reviewed folder holds no features and a subfolder at most three levels down does, then the system MUST name those subfolders and the command to run on the first one
- **FR-005**: If a reviewed folder holds no features and none is nearby, then the system MUST suggest the demo command, or say that the path does not exist when it does not
- **FR-006**: The system MUST offer on the developer page one tab for each of Claude Code, Cursor, VS Code, Claude Desktop and Codex, each with its configuration and a copy button
- **FR-007**: Where a client configuration is written in JSON, the system MUST show it as valid JSON
- **FR-008**: When the developer picks a client, the system MUST remember the choice in the browser for the next visit
- **FR-009**: When the developer presses an arrow key, Home or End on a tab, the system MUST move the selection and the focus between tabs
- **FR-010**: The system MUST show on the developer page a command that checks the MCP server without a client and a table of the seven tools of the server
- **FR-011**: When the developer opens a recipe, the system MUST show the problem, what to run, the real output of the tool where the recipe has one and what is gained
- **FR-012**: When the developer presses the copy button of a prompt, the system MUST copy the prompt of that row
- **FR-013**: The system MUST link the developer page from the help menu, from the command palette and from the product guide
- **FR-014**: Where the language is English, the system MUST show the headings and the body of the developer page in English
- **FR-015**: When a command of the developer page is missing from the markdown guides or an output of the page differs from what the tool prints, the system MUST fail the automated tests
- **FR-016**: The system MUST NOT scroll the developer page sideways on a screen 390 pixels wide, in both themes
- **FR-017**: When the address ends in `#dev-<section>`, the system MUST scroll to that section and move the focus to it

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer reaches a first finding with 1 command and 0 files of their own
- **SC-002**: In 100% of the commands on the developer page, the same command appears in the quickstart or the recipes guide
- **SC-003**: In 100% of the outputs on the developer page, every line is printed by the tool today
- **SC-004**: The developer page has the same sections and the same number of items in Spanish and in English

## Assumptions

- Developers who evaluate the tool prefer to see a result before reading documentation (source: the onboarding review of this session)
- A developer who uses a coding agent already has `uv` installed or can install it with one command
