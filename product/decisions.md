# Product decisions

## D-001: Every review is deterministic and works offline
**Status**: accepted
**Date**: 2026-09-18
**Out of scope**: network-only analysis

## D-002: The tool has no runtime dependencies
**Status**: accepted
**Date**: 2026-09-18

## D-003: A model is an optional layer and never required for a finding to exist
**Status**: accepted
**Date**: 2026-09-19

## D-004: The review does not modify the reviewed repository
**Status**: superseded by D-005
**Date**: 2026-09-19

## D-005: Only explicit commands write files, and only the files they announce
**Status**: accepted
**Date**: 2026-10-14

## D-006: Simple by default, depth on demand
**Status**: accepted
**Date**: 2026-10-14

## D-007: The product is the layer where business intent lives, for people who approve and not for people who program
**Status**: accepted
**Date**: 2026-10-15

## D-008: The multi-tenant service is a separate layer on Postgres (Supabase) and the review engine stays dependency-free
**Status**: accepted
**Date**: 2026-10-15

## D-009: Rules found by a model are proposals, and only a person turns them into the company's baseline
**Status**: accepted
**Date**: 2026-10-15

## D-010: One product with two doors: a company with software, and a person with an idea and no code
**Status**: accepted
**Date**: 2026-10-15

## D-011: Registration requires a phone number verified by SMS, so every account is a real person
**Status**: accepted
**Date**: 2026-10-15

## D-012: Agents connected through MCP read and propose, and only a person decides
**Status**: accepted
**Date**: 2026-10-15

## D-013: Code hosting is a provider behind one small read only interface, and a company chooses which of its repositories Speco reads
**Status**: accepted
**Date**: 2026-10-16

## D-014: The free plan limits what a model costs us, never what is deterministic
**Status**: accepted
**Date**: 2026-10-16

## D-015: A referral is rewarded with credits, and only after the person invited gets their first result
**Status**: accepted
**Date**: 2026-10-16
**Fixes**: 021/FR-005 = 20, 021/FR-008 = 10, 021/FR-009 = 6, 021/FR-013 = 12, 021/SC-003 = 200

## D-016: Product metrics are derived from what the product already records, and no figure is reported without its sample size
**Status**: accepted
**Date**: 2026-10-16

## D-017: Payment sits behind one small interface, billing is off until the operator turns it on, and a plan change happens only after the charge is accepted
**Status**: accepted
**Date**: 2026-10-16

## D-018: Value delivered is the problems caught before code, counted from the reviews and weighted by what the company says would have shipped
**Status**: accepted
**Date**: 2026-10-20

## D-019: Verification of the code against an approved rule sits behind one small interface, and a rule is never described as proved unless a formal proof exists
**Status**: proposed
**Date**: 2026-10-24

## D-020: A rule is called verified only when a recorded run of the tests that cite it passed for its current text, and an agent may draft and change rules but never approve them
**Status**: accepted
**Date**: 2026-10-24
**Out of scope**: inferring verification from test names or coverage reports
