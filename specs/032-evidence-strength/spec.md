# Feature Specification: Evidence strength

**Feature Branch**: `032-evidence-strength`

**Created**: 2026-10-24

**Status**: Draft

**Goals**: G-19

**Decisions**: D-019, D-020

**Input**: User description: "A rule verified by a test is only as good as that test. When an agent edits the test that verifies a rule (weakens an assert, rewrites it to pass), the old green run must stop counting, and the review of the change must say so to a person. The ledger also says how strong the evidence of each rule is (examples or generated cases, never proved; D-019), and how many rules are invariants, conditionals or not formalizable, so the team knows how much stronger verification would pay (docs/37 §7, step 1). Motivated by Anthropic's formal verification post (2026-10-22, note 6: the agent could make any theorem provable by rewriting the program) and crosscheck's evidence record."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A green run stops counting when its test is edited (Priority: P1)

An agent can make a rule «pass» by weakening the test that verifies it. The run recorded before the edit proved a test that no longer exists, so it must stop counting until someone runs the new test.

**Acceptance Scenarios**:

1. **Given** a rule verified by a test, **When** the run is recorded, **Then** the run stores a fingerprint of that test's source (FR-001)
2. **Given** a verified rule, **When** someone edits the body of the test that cites it, **Then** the rule is covered again and the ledger names the test that changed (FR-002, FR-003)
3. **Given** a verified rule, **When** a new test starts citing it, **Then** the rule is covered again until the new test runs (FR-004)
4. **Given** a run recorded before fingerprints existed, **When** the ledger is built, **Then** the run still counts as it did (FR-005)

### User Story 2 - The review of a change flags edited tests (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a change against the base branch that edits a test citing a rule, **When** the change is reviewed, **Then** the review lists the rule and the test and asks a person to look at it (FR-006)
2. **Given** a repository whose specreview.toml says `[pr] review_tests = true`, **When** a pull request edits a test citing a rule, **Then** the GitHub comment lists the rule and the test (FR-011)
3. **Given** a repository without that setting, **When** a pull request is reviewed, **Then** no test file is read (FR-012)

### User Story 3 - The ledger says how strong the evidence is (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a rule cited by a test that uses Hypothesis, fast-check or another property-based library, **When** the ledger is built, **Then** its evidence is labeled generated cases (FR-007)
2. **Given** any rule, **When** the ledger is built, **Then** its evidence is never labeled proved (FR-008)

### User Story 4 - How many rules could be verified more strongly (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a repository with specs, **When** the person asks for the shape of the rules, **Then** each functional requirement is classified as invariant, conditional or not formalizable (FR-009)
2. **Given** that classification, **When** it is printed, **Then** it shows the count and percentage of each class and the total (FR-010)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a verification run is recorded, the system MUST record a fingerprint of the source of each test that cites the rule
- **FR-002**: When the source of a test that cites a rule differs from the fingerprint recorded in the latest run of that rule, the system MUST treat that run as stale and show the rule as covered
- **FR-003**: When a run of a rule no longer counts because its tests changed, the system MUST name each test that changed
- **FR-004**: When a test cites a rule and the latest run of that rule has fingerprints but none for that test, the system MUST treat that run as stale and show the rule as covered
- **FR-005**: While a run has no recorded fingerprints, the system MUST count it as it did before this feature existed
- **FR-006**: When a change against a base branch modifies a test that cites a rule, the system MUST list that rule and that test in the review of the change
- **FR-007**: When a test that cites a rule uses a property-based testing library, the system MUST label the evidence of that rule as generated cases, and as examples otherwise
- **FR-008**: The system MUST NOT label the evidence of any rule as proved
- **FR-009**: When the person asks for the shape of the rules, the system MUST classify each functional requirement as invariant, conditional or not formalizable
- **FR-010**: When the shape of the rules is printed, the system MUST show the count and the percentage of each class with the total
- **FR-011**: Where the repository opts in to test review in its specreview.toml, the system MUST list in the pull request comment each rule whose citing test the pull request edits
- **FR-012**: While a repository has not opted in to test review, the system MUST NOT read any test file of its pull requests

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The ledger of this repository, with fingerprints, is built in under 5 seconds
- **SC-002**: Editing the body of a test that verifies a rule turns that rule from verified to covered in 100% of the tested cases

## Assumptions

- The fingerprint of a test cited inside a Python function is the hash of that function's source with whitespace normalized; for any other citation it is the hash of the whole test file.
- Property-based libraries are recognized by their markers: Hypothesis `@given`, fast-check `fc.assert` / `fc.property`, jqwik `@Property`, QuickCheck and ScalaCheck `forAll`, Rust `proptest!`.
- Shape heuristic, deterministic: a requirement about presenting something (show, print, display, offer a page, tell, say, explain) or with a vague quality finding is not formalizable; one with a When, If or Where trigger is conditional; any other (ubiquitous or While) is an invariant.
- The cloud PR bot reads only spec and product files by default. A repository that wants its edited tests in the GitHub comment opts in with `[pr] review_tests = true`; the bot then reads only the test files whose blob changed in the pull request.
