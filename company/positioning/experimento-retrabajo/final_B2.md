I wrote `wires.py` with `fee`, `daily_limit`, `check_wire` and `refund`. I also wrote `test_wires.py`, and all 11 tests pass.

**Assumptions**
- **Rounding:** fees round half up. The spec only says "nearest cent". A raw fee of 5.005 becomes 5.01.
- **Fee minimum:** the 2.00 minimum applies before rounding, so the fee is the larger of 0.5% of the amount and 2.00.
- **Limit check:** a wire is rejected only if `sent_today + amount` is strictly greater than the daily limit. A wire that lands exactly on the limit is queued.
- **Fees and limits:** fees don't count toward the daily limit.
- **Decision order:** the limit check runs before the hold check, so a wire that breaks the limit is rejected even if it is above 10,000. A tier 1 wire above 10,000 is therefore always rejected. Only tier 2 wires can be held.
- **Hold threshold:** a wire is held only if it is strictly above 10,000, as FR-005 says "above". A wire of exactly 10,000 is queued.
- **Unknown tiers:** `daily_limit` and `check_wire` raise `ValueError` for any tier other than 1 or 2.
- **Refund:** `refund(amount)` returns the amount plus its fee, as FR-009 says. Both functions are pure, so the caller passes the original amount.
- **Rejected-wire edge case:** the spec leaves open how a bank-rejected wire counts toward the daily limit. I didn't model it, because `sent_today` is supplied by the caller.

**Out of scope**
These parts of the spec need state, a clock or storage, which the four required functions don't cover:
- fraud-rule holds (FR-007)
- the 4-business-hour resolution target (FR-008)
- the analyst audit log (FR-006)
- the 5-year audit retention and anonymization (FR-011)
- the weekly digest (T007)

I implemented the Python module only, not the Java files in `tasks.md`.
