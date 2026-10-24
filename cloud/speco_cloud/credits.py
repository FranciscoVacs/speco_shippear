"""Spec 020 · the gate every model-assisted action goes through (D-014). Reserve the largest possible cost, call the model, settle to what
was really used. Deterministic work (reviews, rules, decisions, approvals) never comes through here."""
from __future__ import annotations

import math
from contextlib import contextmanager
from typing import Iterator

from psycopg import errors as pgerr

from .config import Settings
from .db import service_tx

TOKENS_PER_CREDIT = 10_000       # an assumption of spec 020: to be checked against the price of the model
OUTPUT_WEIGHT = 5                # an output token costs about five input tokens
TURN_MAX_INPUT_TOKENS = 40_000   # FR-007: what one conversation turn may send

REFUSALS = {
    "CR001": ("no_credits", "There are not enough credits for this. They renew on the date shown in your usage."),
    "CR002": ("daily_cap", "This company reached its daily limit of model use. It resets tomorrow."),
    "CR003": ("budget", "Model use is paused for free companies for now. Everything that does not need a model keeps working."),
}


class CreditsRefused(Exception):
    """The model action must not run. `code` is no_credits, daily_cap or budget; `message` is what to tell the person."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def credits_for(input_tokens: int, output_tokens: int, weight: float = 1.0) -> int:
    """Whole credits for a use of the model, never less than one when anything was used. `weight` is the price of the model that answered
    relative to the one the credits were calibrated on (specreview.models): a cheaper model spends fewer credits for the same tokens."""
    weighted = (max(input_tokens, 0) + OUTPUT_WEIGHT * max(output_tokens, 0)) * weight
    return math.ceil(weighted / TOKENS_PER_CREDIT) if weighted > 0 else 0


def turn_cost(choice) -> int:
    """The most a turn can cost with this choice of model and effort: a full 40 000-token input and an answer using all its room.
    No choice = the settled default of `turn_credits` (the assistant as it was before the composer could choose)."""
    if choice is None:
        return 0
    return max(credits_for(TURN_MAX_INPUT_TOKENS, choice.max_tokens, choice.weight), 1)


def largest_cost(settings: Settings, kind: str) -> int:
    return settings.portrait_credits if kind == "portrait" else settings.turn_credits


class Reservation:
    def __init__(self, settings: Settings, rid: str | None, amount: int):
        self.settings, self.id, self.amount, self.spent = settings, rid, amount, 0

    def settle(self, actual: int | None = None) -> None:
        """Charges `actual` credits (everything reserved when it is not known) and gives the rest back."""
        self.spent = self.amount if actual is None else min(max(actual, 0), self.amount)
        if self.id:
            with service_tx(self.settings) as conn:
                conn.execute("select public.settle_credits(%s, %s)", (self.id, self.spent))

    def release(self) -> None:
        self.settle(0)


def reserve(settings: Settings, org_id: str, kind: str, amount: int | None = None) -> Reservation:
    """`amount` replaces the largest cost of the kind (a turn whose model and effort were chosen); it never exceeds what the choice can really spend."""
    amount = amount or largest_cost(settings, kind)
    try:
        with service_tx(settings) as conn:
            row = conn.execute("select public.reserve_credits(%s, %s, %s) as id", (org_id, amount, kind)).fetchone()
    except pgerr.Error as e:
        if e.sqlstate in REFUSALS:
            raise CreditsRefused(*REFUSALS[e.sqlstate]) from None
        raise
    return Reservation(settings, str(row["id"]) if row["id"] else None, amount)


@contextmanager
def metered(settings: Settings, org_id: str, kind: str, model=None) -> Iterator[Reservation]:
    """with metered(...) as res: <call the model>. Settles to the tokens the model client reports (or the whole reservation if it does not
    report any); if the call fails, everything is released (FR-014). Raises CreditsRefused before anything is called."""
    res = reserve(settings, org_id, kind)
    try:
        yield res
    except BaseException:
        res.release()
        raise
    usage = model.take_usage() if hasattr(model, "take_usage") else None
    res.settle(None if usage is None else credits_for(usage["input"], usage["output"]))


def status(settings: Settings, org_id: str) -> dict:
    """What the person needs to know at a glance (spec 020 FR-015): the balance, what the company was granted, when it resets and how close the limit is.
    level: ok, near (less than a fifth of what was granted is left: the same line as the notice of FR-013) or full (not enough for another turn).
    Every company is metered (spec 024 FR-005); a paid one resets when its period ends and `billing` says whether the upgrade leads to a real checkout."""
    with service_tx(settings) as conn:
        org = conn.execute("select plan, free_plan from public.organizations where id = %s", (org_id,)).fetchone()
        row = conn.execute("select coalesce(sum(amount - used), 0) as balance, coalesce(sum(amount), 0) as granted from public.credit_grants where org_id = %s and expires_at > now()", (org_id,)).fetchone()
        sub = conn.execute("select period_end from public.subscriptions where org_id = %s", (org_id,)).fetchone()
        renewal = sub["period_end"] if sub else conn.execute("select private.next_month_start() as at").fetchone()["at"]
    balance, granted = int(row["balance"]), int(row["granted"])
    level = "full" if balance < settings.turn_credits else "near" if balance * 5 < granted else "ok"
    return {"metered": True, "free_plan": org["free_plan"], "plan": org["plan"], "balance": balance, "granted": granted, "level": level,
            "next_renewal": renewal.isoformat(), "turn_cost": settings.turn_credits, "billing": bool(settings.billing_provider)}
