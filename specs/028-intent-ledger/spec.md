# Feature Specification: Intent Ledger

**Feature Branch**: `028-intent-ledger`

**Created**: 2026-10-24

**Status**: Implemented

**Goals**: G-3, G-5, G-9, G-19

**Decisions**: D-001, D-005, D-012, D-019, D-020

**Input**: User description: "Make the product the default place where a product agent creates and understands what the code does right now and which features to build: the what, never the how. That what must be verifiable, iterable, correctable and auditable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know what the software does today, by evidence (Priority: P1)

A product agent joins a repository and, before reading any code, asks what the software does today. It gets every rule the specs state, each with a state that says how much evidence backs it, and where that evidence lives.

**Why this priority**: An agent that learns the product by reading code learns the how and guesses the what. This answer is the reason to open Speco first.

**Independent Test**: Cite a requirement of an implemented feature from a test, ask for the ledger and read its state and citation.

**Acceptance Scenarios**:

1. **Given** a repository with specs, **When** the agent asks for the ledger, **Then** every requirement and success criterion appears once with one state: proposed, decided, built, covered, verified or failing (FR-001)
2. **Given** an implemented feature whose requirement is cited by a test, **When** the ledger is built, **Then** that requirement is covered and the citation shows the file and the line (FR-002, FR-003)
3. **Given** a test that cites a requirement that does not exist, **When** the ledger is built, **Then** the citation is listed as orphan evidence (FR-004)
4. **Given** the question «what does it do today», **When** the agent asks it, **Then** only built, covered, verified and failing requirements are listed, grouped by feature (FR-005)

---

### User Story 2 - Verify a rule and keep the record (Priority: P1)

The agent wants to know whether a rule still holds. It runs only the tests that cite it, with the command the repository chose, and the result stays in a record that cannot be edited without anyone noticing.

**Why this priority**: A rule nobody can check is an opinion. This turns «the spec says» into «the spec says and this run shows it».

**Independent Test**: Configure a verification command, verify a cited requirement, edit the requirement and read its state again.

**Acceptance Scenarios**:

1. **Given** a configured command and a cited requirement, **When** the agent verifies it, **Then** only the citing tests run and the result is recorded with the command, the commit and the hash of the requirement text (FR-006)
2. **Given** a recorded run, **When** someone edits or deletes an entry of the record, **Then** checking the record says where the chain breaks (FR-007)
3. **Given** a requirement verified and later reworded, **When** the ledger is built, **Then** the old run no longer counts and the requirement is covered again (FR-008)
4. **Given** a run whose tests failed, **When** the ledger is built, **Then** the requirement is failing (FR-008)
5. **Given** no configured command, **When** the agent asks to verify, **Then** nothing runs and the answer says how to configure it (FR-009)

---

### User Story 3 - Create and correct the what (Priority: P1)

The agent writes a new feature in plain language, or corrects one rule of an existing feature, and sees at once whether the rule is clear and what changed in the business.

**Why this priority**: Iterating on the what has to be cheaper than iterating on the code, or the agent will skip it.

**Independent Test**: Draft a feature with two requirements, then reword one of them with a new number and read the answer.

**Acceptance Scenarios**:

1. **Given** a title and requirements in plain language, **When** the agent drafts a feature, **Then** a new spec in Draft status is written under the next feature number and its path and review are returned (FR-010)
2. **Given** an existing requirement, **When** the agent rewords it, **Then** only that spec file changes and the answer shows before, after, every value that moved and the review of that requirement (FR-011)
3. **Given** a feature approved for its current version, **When** the agent changes one of its requirements, **Then** the answer says the approval no longer covers the spec and that a person must decide again (FR-012)
4. **Given** any draft or change made by the agent, **When** it is written, **Then** an entry with who, when, before, after and the reason is appended to the intent record (FR-013)

---

### User Story 4 - Audit how a rule got here (Priority: P2)

Someone asks why a rule says what it says. They get every version of its text with who changed it and when, the approvals of its feature and its verification runs, in one timeline.

**Why this priority**: The rule history and who decided it is the gap the thesis names for governing intent over time.

**Independent Test**: Commit two versions of a requirement in a git repository and read its history.

**Acceptance Scenarios**:

1. **Given** a requirement changed across commits, **When** someone asks for its history, **Then** each version appears oldest first with commit, author, date and whether it was added, changed or removed (FR-014)
2. **Given** approvals and verification runs, **When** the history is shown, **Then** they appear in the same timeline (FR-015)
3. **Given** a folder that is not a git repository, **When** the history is asked, **Then** the current version appears and the answer says the history is not available (FR-016)

---

### User Story 5 - Use it from the terminal, the agent and the app (Priority: P2)

A product owner and an agent see the same ledger whether they use the terminal, the MCP tools or the web app.

**Why this priority**: The ledger has to be the default place, which means it is wherever the agent and the person already are.

**Independent Test**: Run the ledger command, call the MCP tool and open the page of the app with the same repository.

**Acceptance Scenarios**:

1. **Given** a repository, **When** the person runs the ledger command, **Then** it prints the counts by state and every requirement, as text, JSON or Markdown (FR-017)
2. **Given** the strict flag, **When** a built requirement has no test or a requirement is failing, **Then** the command exits with 1 (FR-018)
3. **Given** the web app, **When** the person opens the ledger page, **Then** it shows the counts by state and the requirements of each feature with their evidence (FR-019)
4. **Given** an agent connected through MCP, **When** it starts, **Then** its instructions tell it to read the ledger before reading code and to write the what in the specs (FR-020)

---

### Edge Cases

- A test cites a requirement by its id alone, without the feature: it is not counted, because the same id exists in many features.
- A feature has no Status line: it is implemented only when it has tasks and all of them are done.
- A verification command that does not finish within its time limit counts as a failed run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST list every requirement and success criterion of every feature once, with exactly one state among proposed, decided, built, covered, verified and failing
- **FR-002**: When a feature is implemented and a test cites one of its requirements by feature and id, the system MUST mark that requirement as covered, and as built when no test cites it
- **FR-003**: The system MUST show each citation with its file and line, and MUST tell citations in tests from citations in code
- **FR-004**: When a citation names a feature or a requirement that does not exist, the system MUST list it as orphan evidence
- **FR-005**: When the agent asks what the software does today, the system MUST list only the built, covered, verified and failing requirements, grouped by feature
- **FR-006**: When the repository configures a verification command and the agent verifies a requirement, the system MUST run only the tests that cite it and MUST record the outcome, the command, the commit and the hash of the requirement text
- **FR-007**: The system MUST keep the verification runs and the intent changes in append-only records chained by hash, and MUST report the first entry that breaks the chain
- **FR-008**: When the latest run for the current text of a requirement passed, the system MUST mark it verified, when it failed it MUST mark it failing, and runs recorded for an earlier text MUST NOT count
- **FR-009**: When no verification command is configured, the system MUST NOT run anything and MUST say which setting to add
- **FR-010**: When the agent drafts a feature, the system MUST write one spec in Draft status under the next free feature number, MUST write no other file, and MUST return its path and its review
- **FR-011**: When the agent changes or adds a requirement, the system MUST write only that spec file and MUST return the text before and after, the values that moved and the findings about that requirement
- **FR-012**: When a change touches a feature approved for its current version, the system MUST say that the approval no longer covers the spec, and MUST NOT record any approval
- **FR-013**: When the agent drafts a feature or changes a requirement, the system MUST append to the intent record who made it, when, the text before and after and the reason given
- **FR-014**: When someone asks for the history of a requirement, the system MUST list every version of its text in the git history of its spec, oldest first, with commit, author, date and kind of change
- **FR-015**: The system MUST place the approvals of the feature, the intent changes and the verification runs of the requirement in the same timeline as its versions
- **FR-016**: When the repository has no git history, the system MUST show the current version and say that the history is not available
- **FR-017**: The ledger command MUST print the counts by state and every requirement as text, JSON or Markdown
- **FR-018**: When the strict flag is given and a built requirement has no test or a requirement is failing, the ledger command MUST exit with 1
- **FR-019**: The web app MUST offer a page with the counts by state and the requirements of each feature with their state and evidence
- **FR-020**: The MCP server MUST tell a connected agent to read the ledger before reading code and to write new or corrected rules in the specs through its tools

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The ledger of a repository with 30 features and 500 source files is built in under 5 seconds without a verification run
- **SC-002**: On this repository, every requirement of this feature is covered or verified by its own tests

## Assumptions

- Tests and code cite a requirement as `<feature number>/<id>`, for example `028/FR-002`; further ids on the same line belong to the same feature.
- The verification command lives in `specreview.toml` under `[ledger]` as `verify`, with `{nodes}` or `{files}` where the citing tests go.
