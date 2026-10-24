I implemented `wires.py` with the four functions you listed, and wrote `test_wires.py`. All 13 pytest tests pass.

**What each function does**
- **`fee(amount)`** is 0.5% of the amount, rounded to the nearest cent, with a 2.00 minimum (FR-001, FR-010).
- **`daily_limit(tier)`** returns 5,000 for tier 1 and 25,000 for tier 2 (FR-003).
- **`check_wire(tier, sent_today, amount)`** returns `"rejected"` if `sent_today + amount` exceeds the limit (FR-002). Otherwise it returns `"held"` if the amount is above 10,000 (FR-005), and `"queued"` if neither applies.
- **`refund(amount)`** returns the amount plus its fee (FR-009).

**Assumptions**
1. **Rounding:** I used half-up rounding. The spec only says "nearest cent". The 2.00 minimum applies to the rounded fee.
2. **Reject vs. hold:** a wire that breaks the daily limit is rejected even if it is also above 10,000. The spec doesn't say which comes first.
3. **Exact boundaries:** a total equal to the limit is allowed, since FR-002 says "exceeds". An amount of exactly 10,000 is queued, since FR-005 says "above".
4. **Daily total:** `sent_today` counts wire amounts only, not fees. It is the caller's job to count the day's wires, including ones later rejected by the bank. The spec's edge case on that question is left open.
5. **Bad input:** an unknown tier, a non-positive amount or a negative `sent_today` raises `ValueError`.
6. **Refund:** `refund()` re-derives the fee from the amount instead of using the fee actually charged. It is correct as long as the fee rules haven't changed since the wire was confirmed.

**Not implemented**
- Fraud-rule holds (FR-007), which the `check_wire` signature has no inputs for.
- The analyst review queue and its 4-business-hour resolution time (FR-006, FR-008).
- The audit log and 5-year retention (FR-011).
- The weekly digest (T007), which has no matching requirement in the spec.
