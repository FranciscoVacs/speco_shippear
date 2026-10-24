"""Spec 024 · billing and plan upgrades (D-017). Money is asked of a payment provider FIRST; the plan changes only if the charge was accepted, in one
database function (`start_plan`) that also writes the invoice and grants the credits of the period. The only provider is a simulated one: it accepts or
declines and never sees a card. A real provider is a later class with the same two members."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from .config import Settings
from .db import service_tx


class BillingError(Exception):
    """The change cannot be made. `code` is for the app, `status` for HTTP, `message` for the person."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


@dataclass(frozen=True)
class Charge:
    ok: bool
    ref: str | None = None
    failure: str | None = None


class PaymentProvider(Protocol):
    name: str
    simulated: bool

    def charge(self, org_id: str, amount_cents: int, currency: str, key: str, description: str, outcome: str | None = None) -> Charge:
        """Takes `amount_cents` once for `key` (asking again with the same key must not charge again). `outcome` is only meaningful to a simulated provider."""


class SimulatedProvider:
    """Nothing is charged. It accepts every charge unless the request asks to see a declined one, or the company is in `decline_orgs` (tests of a renewal)."""
    name = "simulated"
    simulated = True

    def __init__(self, decline_orgs: set[str] | None = None):
        self.decline_orgs = decline_orgs if decline_orgs is not None else set()

    def charge(self, org_id: str, amount_cents: int, currency: str, key: str, description: str, outcome: str | None = None) -> Charge:
        if outcome == "decline" or org_id in self.decline_orgs:
            return Charge(False, failure="card_declined")
        return Charge(True, ref="sim_" + hashlib.sha256(key.encode()).hexdigest()[:20])


def provider_from_settings(settings: Settings) -> PaymentProvider | None:
    """None = billing is off. An unknown name stops the service from starting: a typo must not silently turn billing off or on."""
    if not settings.billing_provider:
        return None
    if settings.billing_provider == "simulated":
        return SimulatedProvider()
    raise ValueError(f"unknown SPECO_BILLING_PROVIDER {settings.billing_provider!r} (only 'simulated' exists)")


def _iso(v: datetime | None) -> str | None:
    return v.isoformat() if v else None


def plans(settings: Settings, provider: PaymentProvider | None) -> dict:
    """The price list (FR-001). Without a provider nothing is for sale."""
    with service_tx(settings) as conn:
        rows = conn.execute("select plan, rank, price_cents, currency, period_credits, daily_cap from public.plan_catalog order by rank").fetchall()
        free = conn.execute("select private.setting('daily_cap') as cap").fetchone()["cap"]
    return {"enabled": provider is not None, "simulated": bool(provider and provider.simulated),
            "plans": [{**r, "daily_cap": r["daily_cap"] or free} for r in rows]}


def overview(settings: Settings, provider: PaymentProvider | None, org_id: str, now: datetime | None = None) -> dict:
    """The plan, the renewal, what is scheduled and the invoices of a company (FR-009), and what each higher plan would charge today (`quotes`)."""
    now = now or datetime.now(timezone.utc)
    with service_tx(settings) as conn:
        org = conn.execute("select plan from public.organizations where id = %s", (org_id,)).fetchone()
        cats = {r["plan"]: r for r in conn.execute("select plan, rank, price_cents from public.plan_catalog").fetchall()}
        sub = conn.execute("select plan, status, provider, period_start, period_end, scheduled_plan from public.subscriptions where org_id = %s", (org_id,)).fetchone()
        invoices = conn.execute("select id, number, kind, plan, amount_cents, currency, status, failure, simulated, period_start, period_end, created_at "
                                "from public.invoices where org_id = %s order by created_at desc, number desc limit 24", (org_id,)).fetchall()
    mine = cats[org["plan"]]
    quotes = {p: (prorated_charge(c["price_cents"], mine["price_cents"], sub["period_start"], sub["period_end"], now) if sub else c["price_cents"])
              for p, c in cats.items() if c["rank"] > mine["rank"]}
    return {"enabled": provider is not None, "simulated": bool(provider and provider.simulated), "plan": org["plan"], "quotes": quotes,
            "subscription": None if sub is None else {**sub, "period_start": _iso(sub["period_start"]), "period_end": _iso(sub["period_end"])},
            "invoices": [{**i, "id": str(i["id"]), "period_start": _iso(i["period_start"]), "period_end": _iso(i["period_end"]), "created_at": _iso(i["created_at"])} for i in invoices]}


def prorated_charge(price_cents: int, current_price_cents: int, period_start: datetime, period_end: datetime, now: datetime) -> int:
    """The price of the new plan minus the unused part of the current period, by seconds, never below zero (FR-004)."""
    span = (period_end - period_start).total_seconds()
    unused = max((period_end - max(now, period_start)).total_seconds(), 0) / span if span > 0 else 0
    return max(price_cents - round(current_price_cents * unused), 0)


def change_plan(settings: Settings, provider: PaymentProvider, org_id: str, target: str, outcome: str | None = None, now: datetime | None = None) -> dict:
    """Moves a company to `target`. Higher: charge, then change now. Lower or free: scheduled for the end of the period. The plan it already has: undoes a schedule."""
    now = now or datetime.now(timezone.utc)
    if outcome not in (None, "decline") or (outcome and not provider.simulated):
        raise BillingError("bad_request", "That outcome only exists for the simulated payment.", 400)
    with service_tx(settings) as conn:
        cats = {r["plan"]: r for r in conn.execute("select plan, rank, price_cents, currency from public.plan_catalog").fetchall()}
        org = conn.execute("select plan from public.organizations where id = %s for share", (org_id,)).fetchone()
        sub = conn.execute("select plan, status, period_start, period_end, scheduled_plan from public.subscriptions where org_id = %s", (org_id,)).fetchone()
        last = conn.execute("select id from public.invoices where org_id = %s and status = 'paid' order by created_at desc, number desc limit 1", (org_id,)).fetchone()
    if target not in cats:
        raise BillingError("unknown_plan", "That plan does not exist.", 422)
    current = org["plan"]
    if target == current:
        if sub and sub["scheduled_plan"]:
            with service_tx(settings) as conn:
                conn.execute("select public.schedule_plan(%s, null)", (org_id,))
            return {"result": "resumed", "plan": current}
        raise BillingError("same_plan", "The company is already on that plan.", 409)
    if cats[target]["rank"] < cats[current]["rank"]:
        with service_tx(settings) as conn:
            conn.execute("select public.schedule_plan(%s, %s)", (org_id, target))
        return {"result": "scheduled", "plan": target, "at": _iso(sub["period_end"])}
    amount = prorated_charge(cats[target]["price_cents"], cats[current]["price_cents"], sub["period_start"], sub["period_end"], now) if sub else cats[target]["price_cents"]
    key = f"upgrade:{current}>{target}:{last['id'] if last else 'none'}"            # a new paid invoice changes it, so a later upgrade is never mistaken for this one (FR-014)
    charge = Charge(True) if amount == 0 else provider.charge(org_id, amount, cats[target]["currency"], key, f"Speco {target}", outcome)
    end = now + timedelta(days=31)
    if not charge.ok:
        with service_tx(settings) as conn:
            conn.execute("select public.record_failed_payment(%s, %s, 'upgrade', %s, %s, %s, %s, %s, %s, %s)", (org_id, target, amount, provider.name, provider.simulated, charge.failure, now, end, now))
        raise BillingError("payment_declined", "The payment was declined. Nothing changed.", 402)
    # if this fails after an accepted charge, asking again repeats the same key: the provider does not charge twice and the plan is applied
    with service_tx(settings) as conn:
        conn.execute("select public.start_plan(%s, %s, 'upgrade', %s, %s, %s, %s, %s, %s)", (org_id, target, amount, provider.name, charge.ref, provider.simulated, key, now))
    return {"result": "upgraded", "plan": target, "amount_cents": amount}


def renew_due(settings: Settings, provider: PaymentProvider | None, now: datetime | None = None) -> dict:
    """Run by the worker every hour. Renews what is due (once), applies what was scheduled, retries a declined renewal once a day and, after the grace
    days, sends the company back to the free plan (FR-006, FR-007, FR-008). Running it again changes nothing that was already done."""
    now = now or datetime.now(timezone.utc)
    out = {"renewed": 0, "declined": 0, "ended": 0, "waiting": 0}
    with service_tx(settings) as conn:
        due = conn.execute("select org_id, plan, status, provider, period_start, period_end, scheduled_plan, last_attempt_at from public.subscriptions where period_end <= %s order by period_end", (now,)).fetchall()
        cats = {r["plan"]: r for r in conn.execute("select plan, price_cents, currency from public.plan_catalog").fetchall()}
        grace = timedelta(days=conn.execute("select private.setting('billing_grace_days') as d").fetchone()["d"])
    for sub in due:
        org, target = str(sub["org_id"]), sub["scheduled_plan"] or sub["plan"]
        if target == "hobby":
            with service_tx(settings) as conn:
                conn.execute("select public.end_subscription(%s, 'canceled')", (org,))
            out["ended"] += 1
            continue
        if sub["status"] == "past_due":
            if now >= sub["period_end"] + grace:
                with service_tx(settings) as conn:
                    conn.execute("select public.end_subscription(%s, 'payment_failed')", (org,))
                out["ended"] += 1
                continue
            if sub["last_attempt_at"] and now - sub["last_attempt_at"] < timedelta(days=1):
                out["waiting"] += 1
                continue
        comped = sub["provider"] == "manual"                                    # a plan the operator gave: it renews without a charge
        if provider is None and not comped:
            out["waiting"] += 1                                                # billing was turned off: nothing is charged and nothing is ended
            continue
        cat = cats[target]
        start = sub["period_end"] if now - sub["period_end"] < timedelta(days=1) else now
        key = f"renewal:{sub['period_end'].isoformat()}:{_iso(sub['last_attempt_at'])}"
        name, simulated = ("manual", False) if comped else (provider.name, provider.simulated)
        amount = 0 if comped else cat["price_cents"]
        charge = Charge(True) if comped else provider.charge(org, amount, cat["currency"], key, f"Speco {target}")
        with service_tx(settings) as conn:
            if charge.ok:
                conn.execute("select public.start_plan(%s, %s, 'renewal', %s, %s, %s, %s, %s, %s)", (org, target, amount, name, charge.ref, simulated, key, start))
                out["renewed"] += 1
            else:
                conn.execute("select public.record_failed_payment(%s, %s, 'renewal', %s, %s, %s, %s, %s, %s, %s)", (org, target, amount, name, simulated, charge.failure, start, start + timedelta(days=31), now))
                out["declined"] += 1
    return out
