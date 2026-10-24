from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from specreview.models import parse_models

_ROLE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


@dataclass(frozen=True)
class Settings:
    database_url: str
    github_webhook_secret: str
    github_app_id: str = ""
    github_app_slug: str = ""
    github_private_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_url: str = ""
    public_url: str = ""
    state_secret: str = ""
    app_url: str = "http://localhost:5173"
    github_api: str = "https://api.github.com"
    service_role: str = "service_role"
    anthropic_api_key: str = ""
    cors_origins: tuple = ()
    model: str = "claude-sonnet-5-5"
    models: tuple = ()                  # what a conversation turn may pick (specreview.models); empty = no choice, every turn uses `model`
    credentials_key: str = ""
    portrait_credits: int = 10          # the largest a model-assisted portrait run may cost (spec 020: 300 KB of code is about 100 000 tokens)
    billing_provider: str = ""          # spec 024: "" = billing off (paid plans are not offered), "simulated" = nothing is charged for real
    turn_credits: int = 5               # the largest a conversation turn may cost: 40 000 tokens in, a short answer out
    bitbucket_api: str = "https://api.bitbucket.org/2.0"
    bitbucket_auth: str = "https://bitbucket.org/site/oauth2/access_token"
    state_ttl_seconds: int = 600
    inline_jobs: bool = False           # run queued jobs inside the request that queued them: a serverless host has no long-lived worker
    cron_secret: str = ""               # what /internal/tick expects as its bearer token; empty = the endpoint refuses every call
    extra: dict = field(default_factory=dict)

    @property
    def allowed_origins(self) -> list[str]:
        """Where the web app is served from: APP_URL plus any extra origins (comma separated in CORS_ORIGINS)."""
        from urllib.parse import urlsplit
        u = urlsplit(self.app_url)
        return [f"{u.scheme}://{u.netloc}", *self.cors_origins]

    def __post_init__(self) -> None:
        # the role name is interpolated into `SET ROLE`: only plain identifiers
        if not _ROLE.match(self.service_role):
            raise ValueError("invalid service role name")

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        e = env if env is not None else os.environ
        return cls(
            database_url=e["DATABASE_URL"],
            github_webhook_secret=e["GITHUB_WEBHOOK_SECRET"],
            github_app_id=e.get("GITHUB_APP_ID", ""),
            github_app_slug=e.get("GITHUB_APP_SLUG", ""),
            github_private_key=e.get("GITHUB_PRIVATE_KEY", "").replace("\\n", "\n"),
            supabase_jwt_secret=e.get("SUPABASE_JWT_SECRET", ""),
            supabase_url=e.get("SUPABASE_URL", "").rstrip("/"),
            public_url=e.get("PUBLIC_URL", "").rstrip("/"),
            state_secret=e.get("STATE_SECRET", e.get("GITHUB_WEBHOOK_SECRET", "")),
            app_url=e.get("APP_URL", "http://localhost:5173"),
            service_role=e.get("SERVICE_ROLE", "service_role"),
            anthropic_api_key=e.get("ANTHROPIC_API_KEY", ""),
            cors_origins=tuple(o.strip() for o in e.get("CORS_ORIGINS", "").split(",") if o.strip()),
            model=e.get("SPECO_MODEL", "claude-sonnet-5-5"),
            models=parse_models(e.get("SPECO_MODELS", "")),
            credentials_key=e.get("CREDENTIALS_KEY", ""),
            portrait_credits=int(e.get("SPECO_PORTRAIT_CREDITS", "10")),
            turn_credits=int(e.get("SPECO_TURN_CREDITS", "5")),
            billing_provider=e.get("SPECO_BILLING_PROVIDER", "").strip().lower(),
            inline_jobs=e.get("SPECO_INLINE_JOBS") == "1" or e.get("VERCEL") == "1",
            cron_secret=e.get("CRON_SECRET", ""),
        )
