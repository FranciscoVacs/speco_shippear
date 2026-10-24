"""The PR bot's GitHub App, kept as code: deploy/github-app/manifest.json is the source of truth (docs/32).

    python scripts/create_github_app.py                     # create it in one click, then open http://127.0.0.1:8790
    python scripts/create_github_app.py --check             # compare the live App with the manifest
    python scripts/create_github_app.py --sync-webhook      # set the live webhook URL to the manifest's
    python scripts/create_github_app.py --deliveries        # the last webhook deliveries and their status

Creating uses GitHub's manifest flow: GitHub returns a one-time code that this script exchanges for the App id, slug, private key and
webhook secret. They are written to ~/.speco/ and, unless --no-vercel, added to the Vercel project as sensitive variables.
GitHub has no API to apply a manifest to an existing App: only the webhook configuration can be changed from here. Permissions,
events, the setup URL and the name are changed on the App's settings page, and --check says which ones differ.
Creating needs only the standard library; the other commands need PyJWT (`pip install "pyjwt[crypto]"`). Nothing secret is printed."""
from __future__ import annotations

import argparse
import html
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 8790
ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "deploy" / "github-app" / "manifest.json"
API = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


def load_manifest(name: str | None, url: str | None, private: bool) -> dict:
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if url:
        old = m["url"]
        m["url"] = url
        m["hook_attributes"]["url"] = m["hook_attributes"]["url"].replace(old, url)
        m["setup_url"] = m["setup_url"].replace(old, url)
    if name:
        m["name"] = name
    if private:
        m["public"] = False
    return m


def _call(method: str, path: str, token: str | None = None, body: dict | None = None):
    headers = {**HEADERS, **({"Authorization": f"Bearer {token}"} if token else {})}
    data = json.dumps(body).encode() if body is not None else None
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def convert(code: str) -> dict:
    return _call("POST", f"/app-manifests/{urllib.parse.quote(code)}/conversions")


def creds_path(slug: str) -> Path:
    return Path.home() / ".speco" / f"github-app-{slug}.json"


def save(app: dict) -> Path:
    out = creds_path(app["slug"])
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({k: app[k] for k in ("id", "slug", "html_url", "pem", "webhook_secret")}, indent=1), encoding="utf-8")
    try:
        os.chmod(out, 0o600)
    except OSError:
        pass
    return out


def to_vercel(app: dict, project: str) -> None:
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        raise SystemExit("npx not found: add the variables by hand (docs/32 step 3)")
    values = {"GITHUB_APP_ID": str(app["id"]), "GITHUB_APP_SLUG": app["slug"], "GITHUB_WEBHOOK_SECRET": app["webhook_secret"],
              "GITHUB_PRIVATE_KEY": app["pem"], "SPECO_STATUS_TOKEN": secrets.token_hex(16)}
    for name, value in values.items():
        r = subprocess.run([npx, "-y", "vercel@latest", "env", "add", name, "-e", "production", "--force", "--sensitive", "--project", project],
                           input=value, text=True, capture_output=True)
        print(f"  {name}: {'ok' if r.returncode == 0 else 'FAILED'}")
        if r.returncode != 0:
            print(r.stderr.strip()[-500:], file=sys.stderr)
            raise SystemExit(1)


def create(m: dict, org: str | None, project: str, vercel: bool) -> None:
    state = secrets.token_urlsafe(16)
    target = f"https://github.com/organizations/{org}/settings/apps/new" if org else "https://github.com/settings/apps/new"
    body = json.dumps({**m, "redirect_url": f"http://127.0.0.1:{PORT}/callback"})
    done: dict = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, text: str, status: int = 200) -> None:
            data = text.encode("utf-8")
            try:
                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except ConnectionError:              # the browser dropped a prefetch: nothing to answer
                pass

        def do_GET(self):
            u = urllib.parse.urlsplit(self.path)
            if u.path == "/":
                self._send(f"""<!doctype html><meta charset="utf-8"><title>Speco · crear la GitHub App</title>
<body style="font:16px system-ui;max-width:560px;margin:48px auto;padding:0 16px">
<h1>Crear la GitHub App de Speco</h1><p>GitHub te va a mostrar el nombre <b>{html.escape(m['name'])}</b> con todos los campos ya completos.
Revisalo y tocá <b>Create GitHub App</b>.</p>
<form action="{html.escape(target)}?state={state}" method="post"><input type="hidden" name="manifest" value="{html.escape(body)}">
<button style="font-size:18px;padding:10px 18px">Continuar en GitHub</button></form></body>""")
                return
            if u.path == "/callback":
                q = urllib.parse.parse_qs(u.query)
                if q.get("state", [""])[0] != state or not q.get("code"):
                    self._send("Estado inválido: volvé a empezar desde el script.", 400)
                    return
                try:
                    done["app"] = convert(q["code"][0])
                except Exception as e:  # noqa: BLE001
                    done["error"] = repr(e)
                    self._send(f"No pude canjear el código: {html.escape(repr(e))}", 502)
                    return
                self._send(f"<p style='font:16px system-ui;margin:48px'>Listo: <b>{html.escape(done['app']['slug'])}</b> creada. Volvé a la terminal.</p>")
                return
            self._send("not found", 404)

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Abrí http://127.0.0.1:{PORT} en el navegador donde tenés GitHub abierto, y tocá «Continuar en GitHub».", flush=True)
    while "app" not in done and "error" not in done:
        server.handle_request()
    server.server_close()
    if "error" in done:
        raise SystemExit(done["error"])
    app = done["app"]
    path = save(app)
    print(f"App creada: {app['html_url']} (id {app['id']}, slug {app['slug']})")
    print(f"Credenciales guardadas en {path}. No las subas al repo.")
    if vercel:
        print(f"Cargando variables en Vercel ({project}, production):")
        to_vercel(app, project)
        print("Ahora: scripts/deploy_prbot.sh")


# ---------------------------------------------------------------------------------------------- the live App, as the App itself
def app_token(slug: str) -> str:
    try:
        import jwt
    except ImportError:
        raise SystemExit('this command needs PyJWT: pip install "pyjwt[crypto]"') from None
    path = creds_path(slug)
    if not path.is_file():
        raise SystemExit(f"no credentials at {path}: they are written when the App is created with this script")
    c = json.loads(path.read_text(encoding="utf-8"))
    t = int(time.time())
    return jwt.encode({"iat": t - 60, "exp": t + 540, "iss": str(c["id"])}, c["pem"], algorithm="RS256")


def _slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")


def check(m: dict, slug: str) -> int:
    """Prints what differs between the live App and the manifest. -> number of differences."""
    token = app_token(slug)
    app, hook = _call("GET", "/app", token), _call("GET", "/app/hook/config", token)
    diffs = []
    if app.get("name") != m["name"]:
        diffs.append(("name", app.get("name"), m["name"], "settings page → Display information"))
    if (app.get("description") or "") != m.get("description", ""):
        diffs.append(("description", app.get("description"), m.get("description"), "settings page → Display information"))
    if (app.get("external_url") or "").rstrip("/") != m["url"].rstrip("/"):
        diffs.append(("homepage URL", app.get("external_url"), m["url"], "settings page → Homepage URL"))
    if hook.get("url") != m["hook_attributes"]["url"]:
        diffs.append(("webhook URL", hook.get("url"), m["hook_attributes"]["url"], "--sync-webhook"))
    if str(hook.get("insecure_ssl", "0")) != "0":
        diffs.append(("SSL verification", "disabled", "enabled", "--sync-webhook"))
    if app.get("permissions", {}) != m["default_permissions"]:
        diffs.append(("permissions", app.get("permissions"), m["default_permissions"], "Permissions & events; installations must accept"))
    if sorted(app.get("events", [])) != sorted(m["default_events"]):
        diffs.append(("events", app.get("events"), m["default_events"], "Permissions & events"))
    print(f"{app['html_url']} (id {app['id']})")
    if not diffs:
        print("Coincide con deploy/github-app/manifest.json. (La Setup URL y la visibilidad no se pueden leer por API: revisalas en la página.)")
        return 0
    for what, live, want, where in diffs:
        print(f"- {what}: GitHub tiene {live!r}, el manifiesto dice {want!r} → {where}")
    return len(diffs)


def sync_webhook(m: dict, slug: str) -> None:
    _call("PATCH", "/app/hook/config", app_token(slug), {"url": m["hook_attributes"]["url"], "content_type": "json", "insecure_ssl": "0"})
    print(f"Webhook URL: {m['hook_attributes']['url']}")


def deliveries(slug: str, n: int = 10) -> None:
    for d in _call("GET", f"/app/hook/deliveries?per_page={n}", app_token(slug)):
        print(f"{d['delivered_at']}  {d['event']:<14} {d.get('action') or '':<12} {d['status_code']}  {d['status']}  {d['duration']:.1f}s")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")              # the messages have arrows and accents; a Windows console defaults to cp1252
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", help="override the manifest's name (unique on GitHub, up to 34 characters)")
    ap.add_argument("--url", help="override where the bot runs (default: the manifest's)")
    ap.add_argument("--org", help="create it under this organization instead of your account")
    ap.add_argument("--private", action="store_true", help="installable only on the owner's account")
    ap.add_argument("--project", default="speco-api", help="Vercel project that receives the variables")
    ap.add_argument("--no-vercel", action="store_true", help="only save the credentials to ~/.speco/")
    ap.add_argument("--slug", help="which App the commands below act on (default: from the manifest's name)")
    ap.add_argument("--check", action="store_true", help="compare the live App with the manifest; exit 1 when they differ")
    ap.add_argument("--sync-webhook", action="store_true", help="set the live webhook URL and SSL verification to the manifest's")
    ap.add_argument("--deliveries", action="store_true", help="list the last webhook deliveries")
    a = ap.parse_args()
    m = load_manifest(a.name, a.url, a.private)
    slug = a.slug or _slug(m["name"])
    if a.sync_webhook:
        sync_webhook(m, slug)
    if a.deliveries:
        deliveries(slug)
    if a.check:
        raise SystemExit(1 if check(m, slug) else 0)
    if not (a.sync_webhook or a.deliveries):
        create(m, a.org, a.project, not a.no_vercel)


if __name__ == "__main__":
    main()
