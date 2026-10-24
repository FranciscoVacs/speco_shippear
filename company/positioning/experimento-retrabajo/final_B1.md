I wrote `wires.py` with `fee`, `daily_limit`, `check_wire` and `refund`, plus `test_wires.py`. All 12 pytest tests pass.

The first run had one failure, and the mistake was in my test, not the code. I had worked out the rounding example wrong, so I fixed the test.

The module covers only the four functions you named. The review queue, audit log, refund job and weekly digest tasks from `tasks.md` are not part of it.

**Assumptions**
- **Fee:** 0.5% of the amount, rounded half-up to the cent, with a floor of 2.00. A fee of exactly 5.005 rounds to 5.01.
- **Limits:** tier 1 is 5,000 and tier 2 is 25,000. Any other tier raises `ValueError`.
- **Limit check:** a wire is rejected only if `sent_today + amount` is strictly above the tier limit, so reaching the limit exactly is allowed.
- **Hold threshold:** a wire is held only if it is strictly above 10,000, so exactly 10,000 is queued. Tier 1 can never reach a hold, because its limit is 5,000.
- **Precedence:** a wire over the limit is "rejected" even if it is also over 10,000. This matches the spec saying a wire over the limit must be rejected. The spec doesn't state the order itself.
- **Invalid input:** a zero or negative amount, or a negative `sent_today`, raises `ValueError`.
- **Refund:** `refund(amount)` returns `amount + fee(amount)` (FR-009).
- **Fraud rules:** FR-007 is not implemented, because the spec doesn't define the rules. `check_wire` therefore never holds a wire for a fraud-rule match.
- **Inputs only:** the FR-008 4-business-hour resolution target, the exchange-rate edge case and FR-011 retention don't affect these functions, so they are left out.
- **Rejected wires and the daily total:** it is unspecified whether a wire the bank rejects still counts toward `sent_today`. The caller decides what to pass in.
