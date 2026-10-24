---
name: the-what
description: Use whenever you need to know what this product does today, what is left to build, or why a rule says what it says, and whenever you are about to create or change a product rule. Reads the intent ledger (specs + evidence + history) through the specreview MCP tools instead of reading code.
---
# The what before the how

The specs are where the **what** of this product lives; the code is the how. Learn and change the what here, not in the code.

1. To learn what the software does, call `what_it_does` **before reading code**. Each rule comes with a state (proposed, decided, built, covered, verified, failing) and the tests that cite it. Trust a rule as much as its state says, no more.
2. To learn why a rule says what it says, call `intent_history` with `<feature>/<id>` (for example `028/FR-002`): every version from git with who and when, the approvals and the verification runs.
3. To create a feature, call `draft_feature` with plain-language requirements. To correct or add a rule, call `change_requirement` with a `reason`. Both write only the spec and leave an auditable record. Then fix what their review reports.
4. When a test checks a rule, cite it in the test as `<feature>/<id>`. Then `verify_intent` runs only those tests and records the result.
5. You propose; a person approves. If `change_requirement` says the approval no longer covers the spec, tell the person instead of carrying on as if it were approved.
