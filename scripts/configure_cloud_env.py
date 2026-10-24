"""Loads the variables of the cloud deployment (docs/35) into Vercel without printing any value.

    python scripts/configure_cloud_env.py            # only what is missing
    python scripts/configure_cloud_env.py --force    # also rewrites what exists (new STATE_SECRET/CRON_SECRET; CREDENTIALS_KEY is never rotated)

- `speco-api`: the database and Supabase come from the Supabase integration already connected to it; the GitHub App from
  ~/.speco/github-app-<slug>.json (scripts/create_github_app.py); the random secrets are generated here.
- The web projects get the three public addresses that turn on cloud mode (docs/19). Variables only apply to new deployments."""
from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

API, WEBS = "speco-api", ("speco-app", "speco.ia")
API_URL, APP_URL = "https://speco-api.vercel.app", "https://speco-app.vercel.app"
NEVER_ROTATE = {"CREDENTIALS_KEY"}       # rotating it makes every stored connection credential unreadable


def vercel(cwd: Path, *args: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["npx", "-y", "vercel@latest", *args], cwd=cwd, input=stdin, text=True, capture_output=True, shell=os.name == "nt")


def linked(project: str) -> Path:
    d = Path(tempfile.mkdtemp(prefix=f"speco-env-{project}-"))
    r = vercel(d, "link", "--yes", "--project", project)
    if r.returncode:
        sys.exit(f"cannot link {project}: {r.stderr[-300:]}")
    return d


def existing(d: Path) -> set[str]:
    out = vercel(d, "env", "ls", "production").stdout
    return {line.split()[0] for line in out.splitlines() if line.strip() and line.split()[0].isupper()}


def pulled(d: Path) -> dict[str, str]:
    f = d / ".env.pulled"
    vercel(d, "env", "pull", str(f), "--environment", "production", "--yes")
    try:
        return {k: v.strip('"') for k, v in (l.rstrip("\n").split("=", 1) for l in f.read_text().splitlines() if "=" in l and not l.startswith("#"))}
    finally:
        f.unlink(missing_ok=True)


def put(d: Path, have: set[str], values: dict[str, str], force: bool, sensitive: bool = True) -> None:
    for name, value in values.items():
        if name in have and (not force or name in NEVER_ROTATE):
            print(f"  {name}: kept")
            continue
        r = vercel(d, "env", "add", name, "-e", "production", "--force", "--yes", "--sensitive" if sensitive else "--no-sensitive", stdin=value)
        print(f"  {name}: {'set' if r.returncode == 0 else 'FAILED ' + (r.stderr or r.stdout)[-200:].replace(value, '<value>')}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--app", default="speco-pr-review", help="slug of the GitHub App in ~/.speco")
    a = ap.parse_args()
    creds = json.loads((Path.home() / ".speco" / f"github-app-{a.app}.json").read_text())

    api = linked(API)
    env = pulled(api)
    if "POSTGRES_URL" not in env or "SUPABASE_URL" not in env:
        sys.exit(f"{API} has no Supabase integration connected (vercel integration add supabase)")
    u = urlsplit(env["POSTGRES_URL"])                  # the transaction pooler; libpq rejects the `supa` parameter Supabase adds
    dsn = urlunsplit(u._replace(query=urlencode([(k, v) for k, v in parse_qsl(u.query) if k != "supa"])))
    from cryptography.fernet import Fernet
    print(API)
    put(api, existing(api), {
        "DATABASE_URL": dsn,
        "GITHUB_APP_ID": str(creds["id"]), "GITHUB_APP_SLUG": creds["slug"],
        "GITHUB_WEBHOOK_SECRET": creds["webhook_secret"], "GITHUB_PRIVATE_KEY": creds["pem"],
        "STATE_SECRET": secrets.token_hex(32), "CRON_SECRET": secrets.token_hex(32), "CREDENTIALS_KEY": Fernet.generate_key().decode(),
        "APP_URL": APP_URL, "CORS_ORIGINS": ",".join(f"https://{h}" for h in ("specoia.vercel.app",)), "PUBLIC_URL": API_URL,
    }, a.force)

    public = {"VITE_CLOUD_URL": API_URL, "VITE_SUPABASE_URL": env["SUPABASE_URL"], "VITE_SUPABASE_ANON_KEY": env["SUPABASE_ANON_KEY"]}
    for web in WEBS:
        print(web)
        d = linked(web)
        put(d, existing(d), public, True, sensitive=False)      # public values: always the current ones


if __name__ == "__main__":
    main()
