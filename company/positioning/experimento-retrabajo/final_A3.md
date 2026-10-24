I implemented `wires.py` at the workspace root with `fee`, `daily_limit`, `check_wire` and `refund`. I also wrote `test_wires.py`, and all 5 pytest tests pass.

**Assumptions**
- **Tier 1 limit:** FR-003 says 5,000 USD and FR-004 says 10,000 USD for tier 1. I used 5,000 because it's the more conservative figure and FR-003 also covers tier 2. If 10,000 is correct, change one value in `_LIMITS`.
- **Check order:** The limit check runs before the hold check. A wire that pushes the day's total over the limit is `"rejected"`, even if it is also above 10,000 USD.
- **Limit boundary:** A day's total exactly equal to the limit is allowed (`"queued"`). Only a total strictly above the limit is rejected.
- **Hold boundary:** A wire is held only when it is strictly above 10,000 USD.
- **Fee:** It is 0.5% of the amount, rounded half-up to the cent, with a 2.00 USD minimum. The 2.00 minimum applies after rounding. A negative amount raises `ValueError`.
- **Refund:** `refund(amount)` returns the amount plus its fee (FR-009).
- **Unknown tier:** Any tier other than 1 or 2 raises `ValueError`.
- **Held wires:** The 10,000 USD hold applies to every tier, as FR-005 states no tier.
- **Left out of scope:**
  - FR-006: audit log of analyst decisions
  - FR-007 and FR-008: both too vague to implement
  - FR-011: has an internal conflict (keep for 5 years, but allow deletion on request)
  - T007: weekly digest, which has no FR behind it
  - Whether a bank-rejected wire counts toward the daily limit
