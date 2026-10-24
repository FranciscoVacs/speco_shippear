# Implementation Plan: Decided numbers reach product

## Summary

Read the numbers a decision fixes (FR-001), block a spec that disagrees with them (FR-002), name the decision when a number breaks in the code or changes in a spec (FR-003, FR-004), and make a pull request that moves a decided number wait for a person in the cloud (FR-005, FR-006).

## Technical Context

**Language/Version**: Python 3.11+, TypeScript (web)
**Primary Dependencies**: none new
**Storage**: `product/decisions.md`; in the cloud, the same snapshots and pull request rows
**Testing**: pytest, with a real Postgres and a fake GitHub for the bridge

## Approach

- The product loader reads a `Fixes` field into the decision record (FR-001)
- A new product rule compares the numbers of each fixed rule with its decision and reports a blocker (FR-002)
- The ledger and the requirement change look up the decisions that fix a rule and add them to the reason and to the touched items (FR-003, FR-004)
- The bridge adds the features with moved numbers to the versions that wait, stores the moved numbers as a file of that version, so its hash differs from the approved one, and the review page shows that file (FR-005, FR-006)
