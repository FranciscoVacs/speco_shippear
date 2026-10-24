"""HTTP surface of the service. Thin on purpose: who may see what is decided by the database (RLS), not by checks in here."""
from __future__ import annotations

import hashlib
import hmac
from typing import Literal
import json
import logging
import re
import secrets
import uuid

import httpx
import jwt
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response, StreamingResponse
from datetime import date
from pydantic import BaseModel, Field
from psycopg import errors as pgerr
from psycopg.types.json import Jsonb
from contextlib import contextmanager

from . import assistant, billing, bridge, credits, decisions, ideas, mcp_server, pr_review, prbot, webhooks, worker
from .auth import agent_claims, current_user
from .config import Settings
from .credentials import Cipher
from .db import service_tx, user_tx
from .github_app import GitHubApp
from .portrait.extractors import AnthropicClient
from specreview.assistant import sanitize_messages
from specreview.models import ChoiceError, choose, offered
from .providers.bitbucket import BitbucketCloud, ProviderBusy, ProviderError, writable_scopes
from .state import StateError, make_state, read_state

ADMIN_ROLES = ("owner", "admin")
log = logging.getLogger("speco.cloud")


class NewOrg(BaseModel):
    name: str
    slug: str


class InstallRequest(BaseModel):
    org_id: str
    target_id: int | None = None        # the GitHub account to install on: GitHub skips its account picker


class GitHubToken(BaseModel):
    github_token: str = Field(min_length=1, max_length=255)


class LinkClaim(BaseModel):
    claim: str = Field(min_length=1, max_length=2000)


class BitbucketConnect(BaseModel):
    workspace: str
    client_key: str
    client_secret: str


class RepoSelection(BaseModel):
    repo_ids: list[str]
    selected: bool


WORKSPACE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$")


class RuleDecision(BaseModel):
    action: str
    statement: str | None = None
    note: str = ""


class Freeze(BaseModel):
    name: str
    note: str = ""


class Note(BaseModel):
    note: str


class Consent(BaseModel):
    on: bool


class NewIdea(BaseModel):
    need: str = Field(min_length=1, max_length=2000)
    lang: Literal["es", "en"] = "es"


class IdeaAnswer(BaseModel):
    question: str
    text: str = Field("", max_length=ideas.MAX_ANSWER + 200)
    unknown: bool = False


class Decide(BaseModel):
    """A decision on one version of one feature. `files` are the sha-256 of each spec file as the person saw it: if the spec moved, nothing is recorded."""
    feature: str
    files: dict[str, str]
    decision: Literal["approved", "approved_with_conditions", "rejected", "delegated"]
    reason: str = Field("", max_length=2000)
    conditions: list[str] = Field(default_factory=list, max_length=20)
    delegate_to: str | None = None
    override: bool = False


class ReferralClaim(BaseModel):
    code: str


class UpgradeInterest(BaseModel):
    source: Literal["pill", "chat_warning", "chat_limit", "usage"]


class PlanChange(BaseModel):
    plan: Literal["hobby", "pro", "team"]
    simulate: Literal["decline"] | None = None      # only the simulated payment understands it: to see what a declined card looks like


class Acquisition(BaseModel):
    channel: str = Field(pattern=r"^[a-z0-9][a-z0-9_:.\-]{0,59}$")
    door: Literal["code", "idea"] | None = None


class PmfAnswer(BaseModel):
    disappointed: Literal["very", "somewhat", "not", "na"]
    main_benefit: str = Field(default="", max_length=1000)
    alternative: str = Field(default="", max_length=1000)


class FindingOutcome(BaseModel):
    feature_id: str
    answer: Literal["yes", "probably", "no"]       # "would this have reached code without Speco?" (spec 025)


class Turn(BaseModel):
    messages: list
    feature: str | None = None
    focus: dict | None = None
    model: str | None = None            # the composer's choice (specreview.models); validated against what this service offers
    effort: str | None = None


def pmf_round() -> str:
    """The Sean Ellis question is asked once per person per quarter (spec 022 FR-006)."""
    now = date.today()
    return f"{now.year}-Q{(now.month - 1) // 3 + 1}"


@contextmanager
def pg_errors():
    """The database decides who may do what; here its refusals become HTTP statuses."""
    try:
        yield
    except pgerr.InsufficientPrivilege as e:
        raise HTTPException(403, str(e).splitlines()[0]) from None
    except (pgerr.CheckViolation, pgerr.InvalidParameterValue, pgerr.StringDataRightTruncation) as e:
        raise HTTPException(422, str(e).splitlines()[0]) from None
    except pgerr.UniqueViolation:
        raise HTTPException(409, "that already exists") from None


def _jsonable(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        out.append({k: (None if v is None else str(v) if k.endswith("id") or k in ("decided_by", "frozen_by", "by_user") else v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()})
    return out


def create_app(settings: Settings, github: GitHubApp | None = None, bitbucket: BitbucketCloud | None = None, chat_model=None, payments=None) -> FastAPI:
    app = FastAPI(title="Speco cloud", docs_url=None, redoc_url=None)
    app.state.settings = settings
    # the web app lives on another origin: only that origin may call the API from a browser. The token (not cookies) is the credential,
    # so there is no ambient authority for a malicious page to borrow.
    app.add_middleware(CORSMiddleware, allow_origins=[o for o in settings.allowed_origins if o], allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"], max_age=600)
    # newer Supabase projects sign with an asymmetric key published as JWKS; keys are cached by the client
    app.state.jwks = jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600) if settings.supabase_url else None
    app.state.github = github or GitHubApp(settings.github_app_id, settings.github_private_key, settings.github_api)
    app.state.bitbucket = bitbucket or BitbucketCloud(settings.bitbucket_api, settings.bitbucket_auth)
    chat_model = chat_model or (AnthropicClient(settings.anthropic_api_key, settings.model) if settings.anthropic_api_key else None)      # optional (D-003)
    payments = payments or billing.provider_from_settings(settings)                             # None = billing is off (spec 024 FR-011)
    cipher = Cipher(settings.credentials_key) if settings.credentials_key else None           # without it no credential can be stored or read

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    # ------------------------------------------------------------------------------------------ jobs without a long-lived worker (Vercel)
    def run_queued(budget_seconds: float = 30) -> list[dict]:
        if not settings.inline_jobs:
            return []
        return worker.drain(settings, worker.providers_from_settings(settings), worker.model_from_settings(settings), budget_seconds)

    @app.get("/internal/tick")
    def tick(request: Request) -> dict:
        """The cron's entry point: monthly credits, renewals and the jobs whose retry came due since the last webhook."""
        if not settings.cron_secret or not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {settings.cron_secret}"):
            raise HTTPException(401, "unauthorized")
        worker.periodic(settings, payments)
        return {"jobs": len(worker.drain(settings, worker.providers_from_settings(settings), worker.model_from_settings(settings), 240))}

    # ------------------------------------------------------------------------------------------ AI agents -> us (spec 018)
    def base_url(request: Request) -> str:
        return settings.public_url or str(request.base_url).rstrip("/")

    @app.get("/.well-known/oauth-protected-resource")
    @app.get("/.well-known/oauth-protected-resource/mcp")
    def protected_resource(request: Request) -> dict:
        """RFC 9728: tells an MCP client which authorization server issues the accesses this endpoint takes (Supabase Auth, as an OAuth 2.1 server)."""
        return {"resource": f"{base_url(request)}/mcp", "authorization_servers": [f"{settings.supabase_url}/auth/v1"] if settings.supabase_url else [],
                "bearer_methods_supported": ["header"], "resource_name": "Speco", "scopes_supported": ["openid", "email", "profile", "phone"]}

    @app.post("/mcp")
    async def mcp(request: Request) -> Response:
        authz = request.headers.get("authorization")
        try:
            claims = agent_claims(request, authz)
        except HTTPException as e:
            if e.status_code != 401:
                raise
            return JSONResponse({"error": "unauthorized", "detail": e.detail}, status_code=401,
                                headers={"WWW-Authenticate": f'Bearer resource_metadata="{base_url(request)}/.well-known/oauth-protected-resource/mcp"'})
        try:
            msg = await request.json()
        except ValueError:
            return JSONResponse(mcp_server._err(None, -32700, "parse error"), status_code=400)
        if isinstance(msg, list):                              # batches are allowed by older protocol versions
            out = [r for r in (mcp_server.handle(settings, claims, m) for m in msg) if r is not None]
            return JSONResponse(out) if out else Response(status_code=202)
        reply = mcp_server.handle(settings, claims, msg)
        return Response(status_code=202) if reply is None else JSONResponse(reply)

    @app.get("/mcp")
    def mcp_stream() -> Response:
        return Response(status_code=405, headers={"Allow": "POST"})         # no server-initiated stream: every answer comes with its request

    # ------------------------------------------------------------------------------------------ GitHub -> us
    @app.post("/webhooks/github")
    async def github_webhook(request: Request) -> JSONResponse:
        body = await request.body()
        if not webhooks.verify_signature(settings.github_webhook_secret, body, request.headers.get("x-hub-signature-256")):
            raise HTTPException(401, "bad signature")
        delivery, event = request.headers.get("x-github-delivery"), request.headers.get("x-github-event")
        if not delivery or not event:
            raise HTTPException(400, "missing delivery headers")
        try:
            payload = json.loads(body)
        except ValueError:
            raise HTTPException(400, "payload is not JSON") from None
        with service_tx(settings) as conn:
            event_id, done = webhooks.record(conn, delivery, event, payload)
        if done:
            return JSONResponse({"status": "duplicate"})
        try:
            with service_tx(settings) as conn:
                outcome = webhooks.process(conn, event_id, event, payload)
        except Exception as e:                          # noqa: BLE001 - recorded, then GitHub retries (the delivery is not marked processed)
            with service_tx(settings) as conn:
                webhooks.mark_failed(conn, event_id, repr(e))
            raise HTTPException(500, "processing failed") from None
        if event == "pull_request" and (args := pr_review.from_webhook(payload)):
            outcome = review_pull_request(args)
        run_queued()
        return JSONResponse({"status": outcome})

    def review_pull_request(args: dict) -> str:
        """Spec 026: any installation gets the comment, linked to a company or not. A failure is logged; GitHub keeps the delivery."""
        cta = (f"**¿Lo querés en tus repositorios?** [Instalá Speco](https://github.com/apps/{settings.github_app_slug}/installations/new) "
               "y cada PR que cambie una spec recibe esta revisión." if settings.github_app_slug else "")
        try:
            out = pr_review.review_pull_request(app.state.github, **args, cta=cta, settings=settings)
        except Exception:                               # noqa: BLE001
            log.exception("review failed for %s#%s", args["full_name"], args["number"])
            return "review_failed"
        log.info("%s", json.dumps({**out, "repo": args["full_name"], "pr": args["number"]}))
        return out["outcome"]

    # ------------------------------------------------------------------------------------------ people -> us (RLS decides)
    @app.get("/api/orgs")
    def list_orgs(user: str = Depends(current_user)) -> list[dict]:
        with user_tx(settings, user) as conn:
            return [{**r, "id": str(r["id"]), "created_at": r["created_at"].isoformat()} for r in conn.execute("select o.id, o.name, o.slug, o.plan, o.created_at, m.role from public.organizations o join public.memberships m on m.org_id = o.id and m.user_id = auth.uid() order by o.created_at").fetchall()]

    @app.post("/api/orgs", status_code=201)
    def create_org(body: NewOrg, user: str = Depends(current_user)) -> dict:
        try:
            with user_tx(settings, user) as conn:
                row = conn.execute("select public.create_organization(%s, %s) as id", (body.name, body.slug)).fetchone()
        except (pgerr.CheckViolation, pgerr.UniqueViolation) as e:
            raise HTTPException(422, "invalid or taken name/slug") from e
        return {"id": str(row["id"])}

    # ------------------------------------------------------------------------------------------ credits and notices (spec 020)
    @app.get("/api/orgs/{org_id}/credits")
    def org_credits(org_id: str, user: str = Depends(current_user)) -> dict:
        """Balance, next renewal and recent uses. Only owners and admins see the ledger (the database policy says so too)."""
        try:
            uuid.UUID(org_id)
        except ValueError:
            raise HTTPException(404, "not found") from None
        with user_tx(settings, user) as conn:
            org = conn.execute("select o.plan, o.free_plan, m.role from public.organizations o join public.memberships m on m.org_id = o.id and m.user_id = auth.uid() where o.id = %s", (org_id,)).fetchone()
            if not org:
                raise HTTPException(404, "not found")
            if org["role"] not in ADMIN_ROLES:
                raise HTTPException(403, "only owners and admins see the credits")
            grants = conn.execute("select source, amount, used, expires_at from public.credit_grants where org_id = %s and expires_at > now() and used < amount order by expires_at", (org_id,)).fetchall()
            recent = conn.execute("select kind, reserved, charged, status, created_at from public.credit_reservations where org_id = %s and status <> 'released' order by created_at desc limit 20", (org_id,)).fetchall()
        summary = credits.status(settings, org_id)
        return {"plan": org["plan"], "free_plan": org["free_plan"], "metered": True, "billing": summary["billing"],
                "balance": sum(g["amount"] - g["used"] for g in grants), "next_renewal": summary["next_renewal"], **{k: summary[k] for k in ("granted", "level")},
                "grants": [{"source": g["source"], "left": g["amount"] - g["used"], "expires_at": g["expires_at"].isoformat()} for g in grants],
                "recent": [{"kind": r["kind"], "credits": r["charged"] if r["charged"] is not None else r["reserved"], "status": r["status"], "at": r["created_at"].isoformat()} for r in recent]}

    # ------------------------------------------------------------------------------------------ the assistant (spec 020: charged as a 'turn')
    @app.get("/api/assistant")
    def assistant_info(user: str = Depends(current_user)) -> dict:
        choices = offered(settings.models, settings.model) if chat_model else []
        return {"available": chat_model is not None, "provider": "anthropic" if chat_model else None, "model": settings.model if chat_model else None, "demo": False,
                **({"models": choices} if choices else {})}

    @app.post("/api/orgs/{org_id}/assistant")
    def assistant_turn(org_id: str, body: Turn, user: str = Depends(current_user)):
        """One conversation turn as server-sent events ({delta}, then {done} or {error}). Credits are reserved BEFORE the model is called:
        with none left the answer is 402 and nothing is sent to the model; afterwards the turn is charged to the tokens it really used."""
        try:
            uuid.UUID(org_id)
        except ValueError:
            raise HTTPException(404, "not found") from None
        try:
            messages = sanitize_messages(body.messages)
        except ValueError as e:
            return JSONResponse({"error": str(e), "code": "bad_request"}, status_code=400)
        if chat_model is None:
            return JSONResponse({"error": "The assistant is not configured on this server.", "code": "assistant_unavailable"}, status_code=503)
        try:
            choice = choose(settings.models, settings.model, body.model, body.effort)
        except ChoiceError as e:
            return JSONResponse({"error": str(e), "code": "bad_request"}, status_code=400)
        with user_tx(settings, user) as conn:
            org = conn.execute("select m.role from public.organizations o join public.memberships m on m.org_id = o.id and m.user_id = auth.uid() where o.id = %s", (org_id,)).fetchone()
            if not org:
                raise HTTPException(404, "not found")
            if org["role"] == "viewer":
                raise HTTPException(403, "viewers cannot ask the assistant")
            if body.feature:
                row = conn.execute(
                    """select rv.report, s.files from public.reviews rv join public.spec_snapshots s on s.id = rv.snapshot_id join public.features f on f.id = s.feature_id
                        where f.org_id = %s and f.key = %s order by rv.created_at desc limit 1""", (org_id, body.feature)).fetchone()
                if not row:
                    return JSONResponse({"error": "unknown feature", "code": "not_found"}, status_code=404)
                system = assistant.spec_prompt(row["report"], row["files"], body.focus)
            else:
                system = assistant.company_prompt(mcp_server.t_pending_decisions(conn, {"org": org_id}))
        system, messages = assistant.fit_turn(system, messages)
        try:
            reservation = credits.reserve(settings, org_id, "turn", credits.turn_cost(choice))
        except credits.CreditsRefused as e:
            return JSONResponse({"error": e.message, "code": e.code}, status_code=402)
        usage = {"input": 0, "output": 0}

        def events():
            settled = False

            def settle() -> None:
                nonlocal settled
                if not settled:
                    settled = True
                    reservation.settle(credits.credits_for(usage["input"], usage["output"], choice.weight if choice else 1.0))
            try:
                for chunk in chat_model.chat(system, messages, usage, **(choice.kwargs() if choice else {})):
                    yield b"data: " + json.dumps({"delta": chunk}, ensure_ascii=False).encode() + b"\n\n"
                settle()                                                           # charged BEFORE the person is told how much is left
                yield b"data: " + json.dumps({"credits": {**credits.status(settings, org_id), "can_upgrade": org["role"] in ADMIN_ROLES}}).encode() + b"\n\n"
                yield b'data: {"done": true}\n\n'
            except GeneratorExit:
                raise                                                              # the person left: they pay for what was already produced
            except Exception:                                                      # noqa: BLE001 - never leak internals or keys to the browser
                yield b'data: {"error": "El proveedor del modelo fall\xc3\xb3."}\n\n'
            finally:
                settle()
        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    def member_role(org_id: str, user: str) -> str:
        """The person's role in the company, 404 when they are not a member (that looks the same as not existing)."""
        try:
            uuid.UUID(org_id)
        except ValueError:
            raise HTTPException(404, "not found") from None
        with user_tx(settings, user) as conn:
            row = conn.execute("select role from public.memberships where org_id = %s and user_id = auth.uid()", (org_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        return row["role"]

    @app.get("/api/orgs/{org_id}/credits/status")
    def credits_status(org_id: str, user: str = Depends(current_user)) -> dict:
        """The summary for the indicator: anyone who can ask the assistant sees how many credits are left and when they reset; the detail stays with owners and admins."""
        role = member_role(org_id, user)
        if role == "viewer":
            raise HTTPException(403, "viewers do not use credits")
        return {**credits.status(settings, org_id), "can_upgrade": role in ADMIN_ROLES}

    @app.post("/api/orgs/{org_id}/upgrade-interest", status_code=201)
    def upgrade_interest(org_id: str, body: UpgradeInterest, user: str = Depends(current_user)) -> dict:
        """Records that an owner or admin asked to upgrade (there is no payment yet), once per place and day."""
        if member_role(org_id, user) not in ADMIN_ROLES:
            raise HTTPException(403, "only owners and admins upgrade the plan")
        with service_tx(settings) as conn:
            conn.execute("insert into public.upgrade_interest (org_id, user_id, source) values (%s, %s, %s) on conflict do nothing", (org_id, user, body.source))
        return {"recorded": True}

    # ------------------------------------------------------------------------------------------ billing (spec 024)
    @app.get("/api/billing/plans")
    def billing_plans(user: str = Depends(current_user)) -> dict:
        """The price list: what each plan costs and gives. `enabled` is false until the operator turns billing on."""
        return billing.plans(settings, payments)

    @app.get("/api/orgs/{org_id}/billing")
    def org_billing(org_id: str, user: str = Depends(current_user)) -> dict:
        """The plan, the renewal, what is scheduled and the invoices. Only owners and admins (the database policy says so too)."""
        if member_role(org_id, user) not in ADMIN_ROLES:
            raise HTTPException(403, "only owners and admins see the billing")
        return billing.overview(settings, payments, org_id)

    @app.post("/api/orgs/{org_id}/billing/plan")
    def change_plan(org_id: str, body: PlanChange, user: str = Depends(current_user)):
        """Higher plan: charged first, changed only if accepted. Lower plan or `hobby`: scheduled for the end of the period. The plan it has: undoes a schedule."""
        if member_role(org_id, user) not in ADMIN_ROLES:
            raise HTTPException(403, "only owners and admins change the plan")
        if payments is None:
            return JSONResponse({"error": "Paid plans are not open yet.", "code": "billing_disabled"}, status_code=404)
        try:
            return billing.change_plan(settings, payments, org_id, body.plan, body.simulate)
        except billing.BillingError as e:
            return JSONResponse({"error": e.message, "code": e.code}, status_code=e.status)

    # ------------------------------------------------------------------------------------------ metrics capture (spec 022)
    @app.post("/api/acquisition", status_code=201)
    def acquisition(body: Acquisition, user: str = Depends(current_user)) -> dict:
        """Where this person came from. The first touch wins: telling it again changes nothing."""
        with service_tx(settings) as conn:
            row = conn.execute("insert into public.acquisition (user_id, channel, door) values (%s, %s, %s) on conflict do nothing returning user_id", (user, body.channel, body.door)).fetchone()
        return {"recorded": row is not None}

    @app.get("/api/orgs/{org_id}/pmf-survey/due")
    def pmf_survey_due(org_id: str, user: str = Depends(current_user)) -> dict:
        """Whether to ask this person now. Only someone who has had a result a week ago and come back on another day: asking earlier measures
        politeness, not value. Never twice in a quarter, and never a viewer (they do not use the product's credits or decisions)."""
        if member_role(org_id, user) == "viewer":
            return {"due": False}
        with service_tx(settings) as conn:
            row = conn.execute(
                """select f.first_result_at <= now() - interval '7 days'
                          and (select count(*) from metrics.activity a where a.org_id = f.org_id) >= 2
                          and not exists (select 1 from public.pmf_responses r where r.user_id = %s and r.round = %s) as due
                     from metrics.org_facts f where f.org_id = %s""", (user, pmf_round(), org_id)).fetchone()
        return {"due": bool(row and row["due"])}

    @app.post("/api/orgs/{org_id}/pmf-survey", status_code=201)
    def pmf_survey(org_id: str, body: PmfAnswer, user: str = Depends(current_user)) -> dict:
        """The Sean Ellis question. One answer per person per quarter; a second one in the same quarter replaces nothing."""
        member_role(org_id, user)
        rnd = pmf_round()
        with service_tx(settings) as conn:
            row = conn.execute("insert into public.pmf_responses (org_id, user_id, round, disappointed, main_benefit, alternative) values (%s, %s, %s, %s, %s, %s) "
                               "on conflict do nothing returning id", (org_id, user, rnd, body.disappointed, body.main_benefit.strip(), body.alternative.strip())).fetchone()
        return {"recorded": row is not None, "round": rnd}

    # ------------------------------------------------------------------------------------------ value delivered (spec 025)
    @app.get("/api/orgs/{org_id}/resolved-findings/pending")
    def resolved_findings_pending(org_id: str, user: str = Depends(current_user)) -> list[dict]:
        """Blockers and warnings that were fixed in the spec and have not yet been asked about: the person who fixed them says whether they
        would have reached code. Newest first, a few at a time, never for a viewer."""
        if member_role(org_id, user) == "viewer":
            return []
        with service_tx(settings) as conn:
            rows = conn.execute(
                """select feature_id, fingerprint, rule, severity, message, resolved_at from metrics.finding_lifecycle
                    where org_id = %s and resolved_at is not null and answer is null and severity in ('blocker', 'warning')
                    order by resolved_at desc limit 5""", (org_id,)).fetchall()
        return _jsonable(rows)

    @app.post("/api/orgs/{org_id}/resolved-findings/{fingerprint}/outcome", status_code=201)
    def resolved_finding_outcome(org_id: str, fingerprint: str, body: FindingOutcome, user: str = Depends(current_user)) -> dict:
        """Would this problem have reached code without Speco? Only for a finding that really was resolved; the first answer wins."""
        if member_role(org_id, user) == "viewer":
            raise HTTPException(403, "viewers cannot answer")
        try:
            uuid.UUID(body.feature_id)
        except ValueError:
            raise HTTPException(404, "not found") from None
        with service_tx(settings) as conn, pg_errors():
            found = conn.execute("select 1 from metrics.finding_lifecycle where org_id = %s and feature_id = %s and fingerprint = %s and resolved_at is not null",
                                 (org_id, body.feature_id, fingerprint)).fetchone()
            if not found:
                raise HTTPException(404, "not found")
            row = conn.execute("insert into public.finding_outcomes (org_id, feature_id, fingerprint, user_id, answer) values (%s, %s, %s, %s, %s) "
                               "on conflict do nothing returning fingerprint", (org_id, body.feature_id, fingerprint, user, body.answer)).fetchone()
        return {"recorded": row is not None}

    @app.get("/api/notices")
    def notices(user: str = Depends(current_user)) -> list[dict]:
        with user_tx(settings, user) as conn:
            return _jsonable(conn.execute("select id, org_id, kind, body, created_at, read_at from public.notices order by created_at desc limit 20").fetchall())

    # ------------------------------------------------------------------------------------------ referrals (spec 021)
    @app.get("/api/referrals/me")
    def my_referrals(user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            return conn.execute("select public.referral_summary() as s").fetchone()["s"]

    @app.post("/api/referrals/claim")
    def claim_referral(body: ReferralClaim, user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            return {"recorded": bool(conn.execute("select public.claim_referral(%s) as ok", (body.code[:40],)).fetchone()["ok"])}

    @app.get("/api/referrals/check/{code}")
    def check_referral(code: str) -> dict:
        """The public page of a link asks only whether the code is real. It never says whose it is (FR-002)."""
        with service_tx(settings) as conn:
            return {"valid": conn.execute("select 1 from public.referral_codes where code = %s", (code[:40],)).fetchone() is not None}

    @app.get("/api/orgs/{org_id}/repositories")
    def list_repositories(org_id: str, status: str = "active", user: str = Depends(current_user)) -> list[dict]:
        if status not in ("active", "available", "all"):
            raise HTTPException(422, "unknown status")
        with user_tx(settings, user) as conn:
            if not conn.execute("select 1 from public.organizations where id = %s", (org_id,)).fetchone():
                raise HTTPException(404, "not found")            # not a member looks the same as not existing
            rows = conn.execute(
                """select r.id, r.full_name, r.default_branch, r.status, r.last_sha, r.last_synced_at, r.code_consent_at is not null as code_consent,
                          c.provider, c.account_login as account
                     from public.repositories r join public.connections c on c.id = r.connection_id
                    where r.org_id = %s and (r.status = %s or (%s = 'all' and r.status in ('active', 'available'))) order by r.full_name""",
                (org_id, status, status),
            ).fetchall()
        return _jsonable(rows)

    @app.post("/api/github/install-url")
    def install_url(body: InstallRequest, user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            row = conn.execute("select role from public.memberships where org_id = %s and user_id = %s", (body.org_id, user)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        if row["role"] not in ADMIN_ROLES:
            raise HTTPException(403, "only owners and admins connect GitHub")
        state = make_state(settings.state_secret, body.org_id, user, settings.state_ttl_seconds)
        if body.target_id:
            return {"url": f"https://github.com/apps/{settings.github_app_slug}/installations/new/permissions?" + urlencode({"target_id": body.target_id, "state": state})}
        return {"url": f"https://github.com/apps/{settings.github_app_slug}/installations/new?" + urlencode({"state": state})}

    @app.post("/api/github/installations")
    def github_installations(body: GitHubToken, user: str = Depends(current_user)) -> list[dict]:
        """The installations of this App that the signed-in person can see on GitHub, with the token GitHub gave at sign-in (used once,
        never stored). One on the person's own account comes with a `claim`: proof for /github/link that skips the trip to GitHub.
        One on an organization does not: any member sees it here, and only an admin may choose its repositories on GitHub."""
        try:
            me, found = app.state.github.user_installations(body.github_token)
        except httpx.HTTPStatusError as e:
            raise HTTPException(401 if e.response.status_code == 401 else 502, "GitHub did not accept that token") from None
        with service_tx(settings) as conn:
            linked = {r["external_id"]: str(r["org_id"]) for r in conn.execute(
                "select external_id, org_id from public.connections where provider = 'github' and external_id = any(%s)", ([str(i["id"]) for i in found],)).fetchall()}
        out = []
        for i in found:
            own = i["account"]["type"] == "User" and i["account"]["id"] == me["id"]
            entry = {"installation_id": i["id"], "account": i["account"]["login"], "account_id": i["account"]["id"], "account_type": i["account"]["type"],
                     "linked_org": linked.get(str(i["id"])), "claim": None, "repositories": None}
            if own and not entry["linked_org"]:
                entry["claim"] = make_state(settings.state_secret, "", user, settings.state_ttl_seconds, extra={"inst": i["id"]})
                entry["repositories"] = app.state.github.count_user_installation_repositories(body.github_token, i["id"])
            out.append(entry)
        return out

    @app.post("/api/orgs/{org_id}/github/link")
    def github_link(org_id: str, body: LinkClaim, user: str = Depends(current_user)) -> dict:
        require_admin(org_id, user)
        try:
            claim = read_state(settings.state_secret, body.claim)
        except StateError as e:
            raise HTTPException(400, f"invalid claim: {e}") from None
        if claim.get("user") != user or not isinstance(claim.get("inst"), int):
            raise HTTPException(400, "invalid claim: not yours")
        n = link_installation(org_id, claim["inst"])
        run_queued(20)
        return {"repositories": n}

    @app.get("/github/setup")
    def github_setup(installation_id: int, state: str = "") -> Response:
        """GitHub sends the browser here after the install. `state` is what proves which company and which person started it.
        An install started on github.com (the QR, docs/33) has none: PRs already get their comment, and linking it to a company
        happens from the app, whose install link GitHub answers with the same installation and a state."""
        if not state:
            return prbot.installed_page(f"{settings.app_url}/connect")
        try:
            st = read_state(settings.state_secret, state)
        except StateError as e:
            raise HTTPException(400, f"invalid state: {e}") from None
        if "inst" in st:                                # a link claim is not an install state
            raise HTTPException(400, "invalid state: not an install state")
        with service_tx(settings) as conn:
            row = conn.execute("select role from public.memberships where org_id = %s and user_id = %s", (st["org"], st["user"])).fetchone()
            gh_id = conn.execute("select public.github_account_id(%s) as id", (st["user"],)).fetchone()["id"]
        if not row or row["role"] not in ADMIN_ROLES:
            raise HTTPException(403, "that person can no longer connect GitHub for this company")
        # the installation id comes from the address bar: anyone can put someone else's there. Only who installed it may link it.
        if gh_id is None:
            return RedirectResponse(f"{settings.app_url}/connect?github=sign-in", status_code=303)
        if not installed_by(installation_id, gh_id):
            return RedirectResponse(f"{settings.app_url}/connect?github=unverified", status_code=303)
        n = link_installation(st["org"], installation_id)
        run_queued(20)                                  # the first reading of each repository, so /connect shows it read
        return RedirectResponse(f"{settings.app_url}/connect?installed={n}", status_code=303)

    def installed_by(installation_id: int, gh_id: int, wait_seconds: float = 6) -> bool:
        """Did this GitHub account install (or configure) this installation? On a personal account, the account is the proof.
        On an organization, GitHub's own webhook says who did it (`sender`); only the organization's admins can. That webhook may
        land a moment after the browser comes back, so it is waited for briefly."""
        import time

        account = app.state.github.get_installation(installation_id)["account"]
        if account["type"] == "User":
            return account["id"] == gh_id
        deadline = time.monotonic() + wait_seconds
        while True:
            with service_tx(settings) as conn:
                seen = conn.execute(
                    """select 1 from public.webhook_events
                        where event in ('installation', 'installation_repositories') and received_at > now() - interval '30 minutes'
                          and payload -> 'installation' ->> 'id' = %s and payload -> 'sender' ->> 'id' = %s limit 1""",
                    (str(installation_id), str(gh_id)),
                ).fetchone()
            if seen or time.monotonic() >= deadline:
                return bool(seen)
            time.sleep(1)

    def link_installation(org_id: str, installation_id: int) -> int:
        """Ties an installation and its repositories to a company -> how many repositories. 409 if another company has it."""
        info = app.state.github.get_installation(installation_id)       # network calls happen outside any DB transaction
        repos = app.state.github.list_repositories(installation_id)
        with service_tx(settings) as conn:
            inst = conn.execute(
                """insert into public.connections (org_id, provider, external_id, account_login, account_type, repository_selection)
                   values (%s, 'github', %s, %s, %s, %s)
                   on conflict (provider, external_id) do update
                     set status = 'active', account_login = excluded.account_login, repository_selection = excluded.repository_selection
                     where public.connections.org_id = excluded.org_id
                   returning id, org_id""",
                (org_id, str(installation_id), info["account"]["login"], info["account"]["type"], info.get("repository_selection", "selected")),
            ).fetchone()
            if not inst:
                raise HTTPException(409, "that installation belongs to another company")
            for r in repos:
                webhooks.upsert_repository(conn, inst, r)
        return len(repos)

    # ------------------------------------------------------------------------------------------ code providers (spec 019)
    def require_admin(org_id: str, user: str) -> None:
        try:
            uuid.UUID(org_id)
        except ValueError:
            raise HTTPException(404, "not found") from None
        with user_tx(settings, user) as conn:
            row = conn.execute("select role from public.memberships where org_id = %s and user_id = %s", (org_id, user)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        if row["role"] not in ADMIN_ROLES:
            raise HTTPException(403, "only owners and admins manage the connections")

    def provider_errors(e: Exception) -> HTTPException:
        if isinstance(e, ProviderBusy):
            return HTTPException(503, "Bitbucket asked to slow down: try again in a minute")
        if isinstance(e, ProviderError):
            return HTTPException(422, str(e))
        if isinstance(e, httpx.HTTPStatusError):
            code = e.response.status_code
            return HTTPException(422, "Bitbucket does not know that workspace, or the credential cannot see it" if code in (403, 404) else f"Bitbucket answered {code}")
        return HTTPException(502, "could not reach Bitbucket")

    def upsert_available(conn, org_id, connection_id, repos: list[dict]) -> None:
        for r in repos:
            conn.execute(
                """insert into public.repositories (org_id, connection_id, external_id, full_name, default_branch, status) values (%s, %s, %s, %s, %s, 'available')
                   on conflict (org_id, connection_id, external_id) do update
                     set full_name = excluded.full_name, default_branch = excluded.default_branch,
                         status = case when public.repositories.status = 'removed' then 'available' else public.repositories.status end""",
                (org_id, connection_id, r["external_id"], r["full_name"], r["default_branch"]),
            )

    @app.get("/api/orgs/{org_id}/connections")
    def list_connections(org_id: str, user: str = Depends(current_user)) -> list[dict]:
        with user_tx(settings, user) as conn:
            if not conn.execute("select 1 from public.organizations where id = %s", (org_id,)).fetchone():
                raise HTTPException(404, "not found")
            rows = conn.execute(
                """select c.id, c.provider, c.account_login as account, c.status, c.details - 'webhook_uuid' as details,
                          count(r.*) filter (where r.status = 'active') as active, count(r.*) filter (where r.status = 'available') as available
                     from public.connections c left join public.repositories r on r.connection_id = c.id
                    where c.org_id = %s and c.status <> 'deleted' group by c.id order by c.created_at""",
                (org_id,),
            ).fetchall()
        return _jsonable(rows)

    @app.post("/api/orgs/{org_id}/connections/bitbucket", status_code=201)
    def connect_bitbucket(org_id: str, body: BitbucketConnect, user: str = Depends(current_user)) -> dict:
        require_admin(org_id, user)
        if cipher is None or not settings.public_url:
            raise HTTPException(503, "Bitbucket is not set up on this server")
        if not WORKSPACE.match(body.workspace) or not (0 < len(body.client_key) <= 200) or not (0 < len(body.client_secret) <= 400):
            raise HTTPException(422, "workspace, key and secret are required")
        creds, bb = {"key": body.client_key.strip(), "secret": body.client_secret.strip()}, app.state.bitbucket
        try:                                                              # network calls happen outside any DB transaction
            token, scopes = bb.access(creds)
            bad = writable_scopes(scopes)
            if bad:                                                       # FR-002: we only read; a credential that can write is not stored
                raise HTTPException(422, f"that credential can write ({', '.join(bad)}): create one with read access only")
            ws = bb.workspace(token, body.workspace)
            repos = bb.list_repositories(token, body.workspace)
        except (ProviderError, httpx.HTTPError) as e:
            raise provider_errors(e) from None
        hook_secret = secrets.token_urlsafe(32)
        with service_tx(settings) as conn:
            c = conn.execute(
                """insert into public.connections (org_id, provider, external_id, account_login, account_type, repository_selection)
                   values (%s, 'bitbucket', %s, %s, 'Workspace', 'selected')
                   on conflict (provider, external_id) do update set status = 'active', account_login = excluded.account_login
                     where public.connections.org_id = excluded.org_id
                   returning id, details""",
                (org_id, ws["uuid"], ws.get("slug") or body.workspace),
            ).fetchone()
            if not c:
                raise HTTPException(409, "that workspace belongs to another company")
            conn.execute(
                """insert into public.connection_secrets (connection_id, org_id, credentials, webhook_secret) values (%s, %s, %s, %s)
                   on conflict (connection_id) do update set credentials = excluded.credentials, webhook_secret = excluded.webhook_secret""",
                (c["id"], org_id, cipher.encrypt_json(creds), cipher.encrypt(hook_secret)),
            )
            upsert_available(conn, org_id, c["id"], repos)
        slug, old_hook = ws.get("slug") or body.workspace, (c["details"] or {}).get("webhook_uuid")
        details: dict = {"webhook": False}
        try:
            if old_hook:
                try:
                    bb.delete_webhook(token, slug, old_hook)             # reconnecting rotates the secret: the old hook would no longer verify
                except (ProviderError, httpx.HTTPError):
                    pass
            details = {"webhook": True, "webhook_uuid": bb.create_webhook(token, slug, f"{settings.public_url}/webhooks/bitbucket/{c['id']}", hook_secret)}
        except (ProviderError, httpx.HTTPError) as e:                    # the connection still works; changes are caught up by a refresh
            details["webhook_error"] = str(provider_errors(e).detail)[:200]
        with service_tx(settings) as conn:
            conn.execute("update public.connections set details = %s where id = %s", (Jsonb(details), c["id"]))
        return {"id": str(c["id"]), "account": slug, "repositories": len(repos), "webhook": details["webhook"]}

    def load_connection(org_id: str, connection_id: str) -> dict:
        try:
            uuid.UUID(connection_id)
        except ValueError:
            raise HTTPException(404, "not found") from None
        with service_tx(settings) as conn:
            row = conn.execute(
                """select c.id, c.org_id, c.provider, c.account_login, c.details, s.credentials from public.connections c
                     left join public.connection_secrets s on s.connection_id = c.id where c.id = %s and c.org_id = %s and c.status <> 'deleted'""",
                (connection_id, org_id),
            ).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        return row

    @app.post("/api/orgs/{org_id}/connections/{connection_id}/disconnect")
    def disconnect(org_id: str, connection_id: str, user: str = Depends(current_user)) -> dict:
        require_admin(org_id, user)
        c = load_connection(org_id, connection_id)
        if c["provider"] == "bitbucket" and cipher and c["credentials"] and (c["details"] or {}).get("webhook_uuid"):
            try:                                                          # FR-009: our webhook goes away with the connection (best effort)
                bb = app.state.bitbucket
                bb.delete_webhook(bb.token(cipher.decrypt_json(c["credentials"])), c["account_login"], c["details"]["webhook_uuid"])
            except Exception:                                             # noqa: BLE001 - the credential is deleted below either way
                pass
        with service_tx(settings) as conn:
            conn.execute("delete from public.connection_secrets where connection_id = %s", (c["id"],))
            conn.execute("update public.connections set status = 'deleted' where id = %s", (c["id"],))
            conn.execute("update public.repositories set status = 'removed' where connection_id = %s", (c["id"],))
        return {"status": "disconnected"}

    @app.post("/api/orgs/{org_id}/connections/{connection_id}/refresh")
    def refresh(org_id: str, connection_id: str, user: str = Depends(current_user)) -> dict:
        """New repositories show up as available; chosen ones whose main branch moved while no webhook arrived are queued (FR-010)."""
        require_admin(org_id, user)
        c = load_connection(org_id, connection_id)
        if c["provider"] != "bitbucket" or cipher is None or not c["credentials"]:
            raise HTTPException(422, "only Bitbucket connections are refreshed by hand: GitHub tells us by itself")
        bb = app.state.bitbucket
        try:
            token = bb.token(cipher.decrypt_json(c["credentials"]))
            repos = bb.list_repositories(token, c["account_login"])
            with service_tx(settings) as conn:
                active = {r["external_id"]: r for r in conn.execute("select id, external_id, full_name, default_branch, last_sha from public.repositories where connection_id = %s and status = 'active'", (c["id"],)).fetchall()}
            heads = {}
            for r in repos:
                if r["external_id"] in active:
                    try:
                        heads[r["external_id"]] = bb.resolve_ref(token, r["full_name"], r["default_branch"])
                    except httpx.HTTPStatusError as e:
                        if e.response.status_code != 404:                  # an empty repository has no branch yet
                            raise
        except (ProviderError, httpx.HTTPError) as e:
            raise provider_errors(e) from None
        seen, queued = {r["external_id"] for r in repos}, 0
        with service_tx(settings) as conn:
            before = conn.execute("select count(*) as n from public.repositories where connection_id = %s", (c["id"],)).fetchone()["n"]
            upsert_available(conn, org_id, c["id"], repos)
            after = conn.execute("select count(*) as n from public.repositories where connection_id = %s", (c["id"],)).fetchone()["n"]
            gone = conn.execute("update public.repositories set status = 'removed' where connection_id = %s and status in ('active', 'available') and not (external_id = any(%s)) returning id", (c["id"], list(seen))).rowcount
            for ext, sha in heads.items():
                r = active[ext]
                if sha != r["last_sha"]:
                    conn.execute("update public.repositories set last_sha = %s where id = %s", (sha, r["id"]))
                    webhooks.enqueue(conn, org_id, r["id"], "sync_repo", {"sha": sha})
                    queued += 1
        return {"added": after - before, "removed": gone, "queued": queued}

    @app.post("/api/orgs/{org_id}/repositories/select")
    def select_repositories(org_id: str, body: RepoSelection, user: str = Depends(current_user)) -> dict:
        """Choose which repositories Speco reads (or stop reading some). Nothing is read before this (FR-004, SC-004)."""
        require_admin(org_id, user)
        if len(body.repo_ids) > 500:
            raise HTTPException(422, "too many repositories at once")
        try:
            ids = [str(uuid.UUID(i)) for i in body.repo_ids]
        except ValueError:
            raise HTTPException(422, "invalid repository id") from None
        with service_tx(settings) as conn:
            if body.selected:
                rows = conn.execute(
                    """update public.repositories r set status = 'active' from public.connections c
                        where r.org_id = %s and r.id = any(%s::uuid[]) and r.status = 'available' and c.id = r.connection_id and c.status = 'active' returning r.id""",
                    (org_id, ids),
                ).fetchall()
                for r in rows:
                    webhooks.enqueue_first_sync(conn, org_id, r["id"])
            else:
                rows = conn.execute("update public.repositories set status = 'available' where org_id = %s and id = any(%s::uuid[]) and status = 'active' returning id", (org_id, ids)).fetchall()
        return {"changed": len(rows)}

    @app.post("/webhooks/bitbucket/{connection_id}")
    async def bitbucket_webhook(connection_id: str, request: Request) -> JSONResponse:
        bad = HTTPException(401, "bad signature")                         # the same answer whatever is wrong: nothing is revealed about connections
        try:
            uuid.UUID(connection_id)
        except ValueError:
            raise bad from None
        body = await request.body()
        with service_tx(settings) as conn:
            c = conn.execute("select c.id, c.org_id, c.status, s.webhook_secret from public.connections c join public.connection_secrets s on s.connection_id = c.id where c.id = %s and c.provider = 'bitbucket'", (connection_id,)).fetchone()
        if not c or c["status"] != "active" or cipher is None or not c["webhook_secret"]:
            raise bad
        if not webhooks.verify_signature(cipher.decrypt(c["webhook_secret"]), body, request.headers.get("x-hub-signature")):
            raise bad
        event = request.headers.get("x-event-key")
        if not event:
            raise HTTPException(400, "missing event key")
        delivery = "bitbucket:" + (request.headers.get("x-request-uuid") or hashlib.sha256(body).hexdigest())
        try:
            payload = json.loads(body)
        except ValueError:
            raise HTTPException(400, "payload is not JSON") from None
        with service_tx(settings) as conn:
            event_id, done = webhooks.record(conn, delivery, event, payload)
        if done:
            return JSONResponse({"status": "duplicate"})
        try:
            with service_tx(settings) as conn:
                outcome = webhooks.process_bitbucket(conn, event_id, event, payload, c)
        except Exception as e:                          # noqa: BLE001 - recorded; Bitbucket retries a failed delivery
            with service_tx(settings) as conn:
                webhooks.mark_failed(conn, event_id, repr(e))
            raise HTTPException(500, "processing failed") from None
        run_queued()
        return JSONResponse({"status": outcome})

    # ------------------------------------------------------------------------------------------ initial portrait (spec 014)
    def visible_org(conn, org_id: str) -> None:
        if not conn.execute("select 1 from public.organizations where id = %s", (org_id,)).fetchone():
            raise HTTPException(404, "not found")                    # not a member looks the same as not existing

    # ------------------------------------------------------------------------------------------ the decision loop (spec 027)
    @app.exception_handler(decisions.Refused)
    async def refused(request: Request, exc: decisions.Refused) -> JSONResponse:
        return JSONResponse({"detail": str(exc), "code": exc.code}, status_code=exc.status)

    # ------------------------------------------------------------------------------------------ the second door (spec 016)
    @app.get("/api/orgs/{org_id}/ideas")
    def list_ideas(org_id: str, user: str = Depends(current_user)) -> list[dict]:
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            return ideas.list_all(conn, org_id)

    @app.post("/api/orgs/{org_id}/ideas", status_code=201)
    def create_idea(org_id: str, body: NewIdea, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            return ideas.create(conn, org_id, user, body.need, body.lang)

    @app.get("/api/orgs/{org_id}/ideas/{idea_id}")
    def get_idea(org_id: str, idea_id: str, user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            return ideas.get(conn, org_id, idea_id)

    @app.post("/api/orgs/{org_id}/ideas/{idea_id}/answers")
    def answer_idea(org_id: str, idea_id: str, body: IdeaAnswer, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            return ideas.answer(conn, org_id, idea_id, body.question, body.text, body.unknown)

    @app.get("/api/orgs/{org_id}/features")
    def org_features(org_id: str, user: str = Depends(current_user)) -> list[dict]:
        """What the company's repositories hold, one row per feature with the verdict of its latest version."""
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            return decisions.list_features(conn, org_id)

    @app.get("/api/orgs/{org_id}/features/{ref}/review")
    def org_review(org_id: str, ref: str, user: str = Depends(current_user)) -> dict:
        """The review and the files it was made from. `ref` is a feature, or `<feature>~<version>` for one version (a pull request's)."""
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            out = decisions.get_review(conn, org_id, ref)
        if not out:
            raise HTTPException(404, "not found")
        return out

    @app.get("/api/orgs/{org_id}/approvals")
    def org_approvals(org_id: str, feature: str | None = None, user: str = Depends(current_user)) -> dict:
        """The log of decisions (newest first) and who is asking, so the app knows whether to offer the buttons."""
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            who = decisions.people(conn, org_id)
            entries = decisions.history(conn, org_id, decisions.split_ref(feature)[0] if feature else None)
        me = next((p for p in who if p["id"] == user), None)
        return {"history": entries, "members": who, "me": me, "can_approve": bool(me and me["role"] in ("owner", "admin", "approver"))}

    @app.post("/api/orgs/{org_id}/approvals", status_code=201)
    def decide_feature(org_id: str, body: Decide, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            entry = decisions.record(conn, org_id, user, body.feature, body.files, body.decision, body.reason, body.conditions, body.delegate_to, body.override)
        try:                                            # the decision is recorded: telling GitHub is best effort and never undoes it
            bridge.refresh(settings, app.state.github, org_id, entry["snapshot_id"])
        except Exception:                               # noqa: BLE001
            log.exception("could not refresh the pull requests of %s", entry["snapshot_id"])
        return {"entry": entry}

    @app.get("/api/orgs/{org_id}/approvals/verify")
    def verify_approvals(org_id: str, user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            return decisions.verify(conn, org_id)

    @app.get("/api/orgs/{org_id}/inventory")
    def inventory(org_id: str, user: str = Depends(current_user)) -> list[dict]:
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            rows = conn.execute("select r.full_name, i.commit_sha, i.counts, i.total_files, i.updated_at from public.repo_inventory i join public.repositories r on r.id = i.repo_id where i.org_id = %s order by r.full_name", (org_id,)).fetchall()
        return _jsonable(rows)

    @app.get("/api/orgs/{org_id}/rules")
    def list_rules(org_id: str, status: str = "proposed", user: str = Depends(current_user)) -> list[dict]:
        if status not in ("proposed", "confirmed", "rejected"):
            raise HTTPException(422, "unknown status")
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            rows = conn.execute(
                """select r.id, r.code, r.statement, r.category, r.risk, r.origin, r.confidence, r.status, r.proposed_by, r.decided_by, r.decided_at, f.full_name as repo,
                          coalesce((select jsonb_agg(jsonb_build_object('path', e.path, 'start_line', e.start_line, 'end_line', e.end_line, 'excerpt', e.excerpt) order by e.path, e.start_line)
                                      from public.rule_evidence e where e.rule_id = r.id), '[]'::jsonb) as evidence
                     from public.business_rules r join public.repositories f on f.id = r.repo_id
                    where r.org_id = %s and r.status = %s
                    order by case r.risk when 'high' then 0 when 'medium' then 1 else 2 end, r.seq""",
                (org_id, status),
            ).fetchall()
        return _jsonable(rows)

    @app.post("/api/rules/{rule_id}/decision")
    def decide_rule(rule_id: str, body: RuleDecision, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            if not conn.execute("select 1 from public.business_rules where id = %s", (rule_id,)).fetchone():
                raise HTTPException(404, "not found")
            conn.execute("select public.decide_rule(%s, %s, %s, %s)", (rule_id, body.action, body.statement, body.note))
            row = conn.execute("select code, status, statement from public.business_rules where id = %s", (rule_id,)).fetchone()
        return row

    @app.post("/api/orgs/{org_id}/baselines", status_code=201)
    def freeze(org_id: str, body: Freeze, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            bid = conn.execute("select public.freeze_baseline(%s, %s, %s) as id", (org_id, body.name, body.note)).fetchone()["id"]
            row = conn.execute("select hash, rules_count from public.baselines where id = %s", (bid,)).fetchone()
        return {"id": str(bid), **row}

    @app.get("/api/orgs/{org_id}/baselines")
    def list_baselines(org_id: str, user: str = Depends(current_user)) -> list[dict]:
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            rows = conn.execute("select id, name, note, frozen_by, frozen_at, rules_count, hash from public.baselines where org_id = %s order by frozen_at desc", (org_id,)).fetchall()
        return _jsonable(rows)

    @app.get("/api/baselines/{baseline_id}")
    def get_baseline(baseline_id: str, user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            row = conn.execute("select id, name, note, frozen_by, frozen_at, rules_count, hash, rules from public.baselines where id = %s", (baseline_id,)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        return _jsonable([row])[0]

    @app.get("/api/orgs/{org_id}/drift")
    def list_drift(org_id: str, status: str = "open", user: str = Depends(current_user)) -> list[dict]:
        if status not in ("open", "acknowledged"):
            raise HTTPException(422, "unknown status")
        with user_tx(settings, user) as conn:
            visible_org(conn, org_id)
            rows = conn.execute(
                """select d.id, d.rule_id, r.code, r.statement, d.kind, d.detail, d.commit_sha, d.status, d.created_at, d.acknowledge_note
                     from public.drift_findings d join public.business_rules r on r.id = d.rule_id where d.org_id = %s and d.status = %s order by d.created_at desc""",
                (org_id, status),
            ).fetchall()
        return _jsonable(rows)

    @app.post("/api/drift/{finding_id}/acknowledge")
    def acknowledge(finding_id: str, body: Note, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            if not conn.execute("select 1 from public.drift_findings where id = %s", (finding_id,)).fetchone():
                raise HTTPException(404, "not found")
            conn.execute("select public.acknowledge_drift(%s, %s)", (finding_id, body.note))
        return {"status": "acknowledged"}

    @app.post("/api/repos/{repo_id}/consent")
    def code_consent(repo_id: str, body: Consent, user: str = Depends(current_user)) -> dict:
        with pg_errors(), user_tx(settings, user) as conn:
            if not conn.execute("select 1 from public.repositories where id = %s", (repo_id,)).fetchone():
                raise HTTPException(404, "not found")
            conn.execute("select public.set_code_consent(%s, %s)", (repo_id, body.on))
        return {"code_analysis": body.on}

    @app.post("/api/repos/{repo_id}/portrait", status_code=202)
    def request_portrait(repo_id: str, user: str = Depends(current_user)) -> dict:
        with user_tx(settings, user) as conn:
            row = conn.execute("select r.org_id, m.role from public.repositories r join public.memberships m on m.org_id = r.org_id and m.user_id = %s where r.id = %s", (user, repo_id)).fetchone()
        if not row:
            raise HTTPException(404, "not found")
        if row["role"] not in ADMIN_ROLES + ("approver",):
            raise HTTPException(403, "only owners, admins and approvers ask for a portrait")
        with service_tx(settings) as conn:
            webhooks.enqueue(conn, row["org_id"], repo_id, "portrait")
        return {"queued": True}

    return app
