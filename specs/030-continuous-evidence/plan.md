# Implementation Plan: Continuous evidence

## Summary

Tell an environment error from a broken rule (FR-001, FR-002), record every rule from one JUnit report or one run of the suite (FR-003 to FR-007), and suggest bindings for decided numbers (FR-008, FR-009).

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: none at runtime (xml.etree from the standard library)
**Storage**: `.specreview/verifications.jsonl`, the same hash chain
**Testing**: pytest on temporary repositories and on this repository

## Approach

- The verify step classifies an outcome as error when the runner could not start or its output matches the runner-missing patterns; the ledger skips error runs when it picks the latest run of a rule (FR-001, FR-002)
- A new evidence module parses JUnit, maps each test case to the pytest node of the citations and appends one run per rule with the commit (FR-003, FR-004, FR-005)
- The ledger subcommand takes a report or runs the configured suite command with a temporary report path, prints the rules broken in that run and returns 1 (FR-006, FR-007)
- The suggestion walks the source and config files, keeps lines with a rule's number next to an identifier that shares a word stem with the rule, builds a pattern from that identifier and keeps it only if its first match is that line (FR-008, FR-009)
- An MCP tool and a CLI flag expose the suggestion; a CI step imports the report of the test job (FR-007, FR-008)
