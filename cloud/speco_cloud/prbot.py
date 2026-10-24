"""The PR bot (spec 026): the GitHub App alone, without database, sign-in or workers. Install it on a repository and every pull request
that changes a spec gets a comment saying what changes in the business.

    GITHUB_APP_ID=... GITHUB_APP_SLUG=... GITHUB_WEBHOOK_SECRET=... GITHUB_PRIVATE_KEY_PATH=app.pem \\
        uvicorn --factory speco_cloud.prbot:create --port 8787

The full service (`speco_cloud.main`) does the same review from its job queue; this one is for trying it in minutes. Guide: docs/32."""
from __future__ import annotations

import hmac
import html
import json
import logging
import os
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from . import pr_review
from .github_app import GitHubApp
from .webhooks import verify_signature

log = logging.getLogger("speco.prbot")


@dataclass(frozen=True)
class BotSettings:
    app_id: str
    private_key: str
    webhook_secret: str
    app_slug: str = ""
    github_api: str = "https://api.github.com"
    status_token: str = ""              # shows recent reviews on /?token=…; empty = never shown (the tunnel makes / public)
    inline: bool = False                # review before answering: a serverless host may freeze the process once the response is sent

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "BotSettings":
        e = env if env is not None else os.environ
        key = e.get("GITHUB_PRIVATE_KEY", "").replace("\\n", "\n")
        if not key and e.get("GITHUB_PRIVATE_KEY_PATH"):
            key = Path(e["GITHUB_PRIVATE_KEY_PATH"]).read_text(encoding="utf-8")
        missing = [n for n, v in (("GITHUB_APP_ID", e.get("GITHUB_APP_ID")), ("GITHUB_WEBHOOK_SECRET", e.get("GITHUB_WEBHOOK_SECRET")),
                                  ("GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH", key)) if not v]
        if missing:
            raise ValueError("missing: " + ", ".join(missing))
        return cls(e["GITHUB_APP_ID"], key, e["GITHUB_WEBHOOK_SECRET"], e.get("GITHUB_APP_SLUG", ""), e.get("GITHUB_API", "https://api.github.com"),
                   e.get("SPECO_STATUS_TOKEN", ""), e.get("SPECO_REVIEW_INLINE") == "1" or e.get("VERCEL") == "1")


PAGE = """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Speco</title><style>
:root{{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--card:#fff;--line:#e7e5e4;--accent:#2563eb}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--card:#1c1917;--line:#292524;--accent:#60a5fa}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}}
main{{max-width:640px;margin:0 auto;padding:48px 16px}}h1{{font-size:28px;margin:0 0 8px}}p{{color:var(--muted)}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:20px 0}}
a.btn{{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600}}
li{{margin:4px 0}}code{{font-size:14px}}</style></head><body><main>{body}</main></body></html>"""


def _page(body: str) -> HTMLResponse:
    return HTMLResponse(PAGE.format(body=body))


def installed_page(app_url: str = "") -> HTMLResponse:
    """Where GitHub sends the person after installing the App (the App's Setup URL). The installation id in the query string is not
    proof of anything, so nothing is read with it: GitHub already showed the person which repositories they chose."""
    more = (f'<p>Para ver el retrato de tu negocio y decidir sobre cada cambio, <a class="btn" href="{html.escape(app_url)}">entrá a Speco</a></p>'
            if app_url else "")
    return _page("<h1>Listo: Speco está conectado</h1><p>Speco ya mira los repositorios que elegiste en GitHub.</p>"
                 "<div class='card'><b>Siguiente paso:</b> abrí una PR que cambie un archivo de <code>specs/</code>. "
                 "En segundos vas a ver el comentario de Speco en la PR.</div>" + more)


def create_app(settings: BotSettings, gh: GitHubApp | None = None) -> FastAPI:
    gh = gh or GitHubApp(settings.app_id, settings.private_key, settings.github_api)
    recent: deque = deque(maxlen=20)
    cta = (f"**¿Lo querés en tus repositorios?** [Instalá Speco](https://github.com/apps/{settings.app_slug}/installations/new) "
           "y cada PR que cambie una spec recibe esta revisión." if settings.app_slug else "")
    app = FastAPI(title="Speco PR bot")

    def review(args: dict) -> None:
        started = time.time()
        try:
            out = pr_review.review_pull_request(gh, **args, cta=cta)
        except Exception as e:                    # noqa: BLE001 - a failed review is logged and shown on /, GitHub keeps the delivery
            log.exception("review failed for %s#%s", args["full_name"], args["number"])
            out = {"outcome": "error", "error": repr(e)[:300]}
        out.update(repo=args["full_name"], pr=args["number"], seconds=round(time.time() - started, 1))
        recent.appendleft(out)
        log.info("%s", json.dumps(out))

    @app.get("/", response_class=HTMLResponse)
    def home(token: str = "") -> HTMLResponse:
        install = (f'<a class="btn" href="https://github.com/apps/{html.escape(settings.app_slug)}/installations/new">Conectar un repositorio de GitHub</a>'
                   if settings.app_slug else "<p>Definí <code>GITHUB_APP_SLUG</code> para mostrar el botón de instalación.</p>")
        operator = bool(settings.status_token) and hmac.compare_digest(token, settings.status_token)
        rows = "".join(f"<li><code>{html.escape(r['repo'])}#{r['pr']}</code> · {html.escape(r['outcome'])}"
                       + (f" · {r.get('new_blockers', 0)} bloqueantes" if r["outcome"] == "commented" else "")
                       + (f" · {html.escape(r['error'])}" if r.get("error") else "")
                       + f" · {r['seconds']} s</li>" for r in recent) if operator else ""
        return _page("<h1>Speco revisa la intención de cada PR</h1>"
                     "<p>Conectá un repositorio. Cada PR que cambie una spec recibe un comentario con lo que cambia en el negocio, "
                     "qué tareas afecta y qué bloqueantes trae.</p>" + f'<div class="card">{install}</div>'
                     + (f"<h2>Últimas revisiones</h2><ul>{rows or '<li>Todavía ninguna.</li>'}</ul>" if operator else ""))

    @app.get("/github/setup", response_class=HTMLResponse)
    def setup() -> HTMLResponse:
        return installed_page()

    @app.post("/webhooks/github")
    async def webhook(request: Request, tasks: BackgroundTasks) -> JSONResponse:
        body = await request.body()
        if not verify_signature(settings.webhook_secret, body, request.headers.get("x-hub-signature-256")):
            raise HTTPException(401, "bad signature")
        event = request.headers.get("x-github-event")
        if event == "ping":
            return JSONResponse({"status": "pong"})
        if event != "pull_request":
            return JSONResponse({"status": "ignored"})
        args = pr_review.from_webhook(json.loads(body))
        if args is None:
            return JSONResponse({"status": "ignored"})
        if settings.inline:                       # a review takes a few seconds; past GitHub's 10 s the delivery shows a timeout but the comment still lands
            review(args)
            return JSONResponse({"status": "reviewed"})
        tasks.add_task(review, args)              # GitHub gives a webhook 10 seconds: answer first, review after
        return JSONResponse({"status": "queued"}, status_code=202)

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    return app


def create() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    return create_app(BotSettings.from_env())
