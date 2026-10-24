I wrote `wires.py` with `fee`, `daily_limit`, `check_wire` and `refund`, plus `test_wires.py`. All 5 pytest tests pass.

Only the four functions you listed are implemented. The review queue, audit log, refund job and weekly digest tasks in `tasks.md` aren't covered. That includes FR-006 and FR-011.

**Assumptions**
- **Tier 1 limit:** FR-003 says 5,000 USD and FR-004 says 10,000 USD for tier 1. I used 5,000 because FR-003 also defines tier 2. Tier 2 is 25,000.
- **Unknown tier:** `daily_limit` raises `ValueError`.
- **Limit check:** a wire is rejected only if `sent_today + amount` is strictly above the limit. Landing exactly on the limit is allowed.
- **Hold threshold:** a wire is held only if `amount` is strictly above 10,000. The limit check runs first, so a wire over both the limit and 10,000 is "rejected", not "held".
- **Held wires:** the function doesn't know whether a held wire counts toward `sent_today`. That's up to the caller.
- **Fee:** 0.5% of the amount, rounded half-up to the cent, with a 2.00 minimum.
- **Refund:** `refund` returns amount plus fee, per FR-009.
- **Invalid amount:** an amount of zero or less raises `ValueError`.
- **Vague requirements:** I ignored FR-007 and FR-008 ("appropriately", "quickly") because they aren't testable.
- **Audit retention:** I also left out FR-011, which has 5-year retention alongside deletion on customer request. The two conflict.
