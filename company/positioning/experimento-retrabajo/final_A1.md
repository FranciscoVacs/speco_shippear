I implemented `wires.py` at the workspace root with the four functions you listed. I also wrote `test_wires.py`, and all 9 pytest tests pass.

**Assumptions**
- **Conflicting tier 1 limit:** FR-003 says 5,000 USD for tier 1 and FR-004 says 10,000 USD. I used FR-003. It is the only one that also covers tier 2, and FR-004's 10,000 matches the hold threshold, so it looks like a stray edit. Limits are 5,000 for tier 1 and 25,000 for tier 2.
- **Vague requirements:** I ignored FR-007 ("handle suspicious transfers appropriately") and FR-008 ("process reviews quickly"). Neither is testable.
- **Out of scope:** FR-006 (analyst decision logging), FR-011 (audit retention) and T007 (weekly digest) need storage or workflow code. They are not part of the four functions you asked for.
- **Fee:** The fee is `amount × 0.005`, rounded half-up to the cent, with a 2.00 minimum. The minimum is applied after rounding.
- **Check order:** `check_wire` rejects first, then holds. A wire is rejected if `sent_today + amount` is greater than the daily limit, so landing exactly on the limit is allowed. Otherwise it is held if the amount is greater than 10,000, so exactly 10,000 is queued. A wire over the limit is therefore never held, which follows SC-002.
- **`sent_today`:** The caller supplies it. A wire rejected by the bank after being queued is excluded from it, which is my reading of the spec's open edge case.
- **Refund:** `refund(amount)` returns the amount plus the fee (FR-009).
- **Invalid input:** `fee`, `check_wire` and `refund` raise `ValueError` for an amount of zero or less. `daily_limit` and `check_wire` raise `ValueError` for a tier other than 1 or 2.
- **Currency:** Everything is in USD. I did nothing about the exchange-rate edge case.
