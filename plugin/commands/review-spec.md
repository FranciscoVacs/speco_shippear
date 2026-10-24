---
description: Review the current Spec Kit feature before implementing it
argument-hint: "[feature id, e.g. 003]"
---
Use the `specreview` MCP tools on $ARGUMENTS (default: the newest feature).

1. Call `get_blockers`. If `can_implement` is false, fix each blocker **in the spec files** (spec.md / plan.md / tasks.md), not in code, then call it again. Repeat until it is true. If a blocker needs a product decision you cannot make, stop and ask me with the exact question.
2. Call `review_feature` with `min_severity: "warning"` and summarize what is left, grouped by rule, in five lines or fewer.
3. Before adding a new requirement to the spec, validate it with `check_requirement`.
