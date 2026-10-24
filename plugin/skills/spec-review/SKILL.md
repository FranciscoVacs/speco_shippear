---
name: spec-review
description: Use before implementing or planning any Spec Kit feature (specs/NNN-*/spec.md), and whenever you write or edit a requirement. Checks the spec with the specreview MCP tools so ambiguity, missing acceptance criteria and contradictions are fixed before code exists.
---
# Spec review before code

1. Before `/speckit.implement` or any implementation of a feature under `specs/`, call `get_blockers`. Do not implement while `can_implement` is false: fix the spec, then re-check.
2. When you write or rewrite a requirement, call `check_requirement` with its text first; aim for EARS form (`When <trigger>, the system MUST <response>`) and a measurable threshold for any quality attribute.
3. `explain_rule` gives the reason and the fix for any rule id you do not recognise.
4. Product decisions (scope, priorities, trade-offs) are not yours: surface them as a question instead of choosing.
