#!/usr/bin/env python3
"""The real cloud service on a real (throwaway) Postgres with a FAKE GitHub and the review worker running, for the browser check
(web/scripts/verify-cloud.mjs). Prints `READY {json}` when it is serving; stops with Ctrl+C / SIGTERM.
    python scripts/cloud_e2e_server.py --port 48799 --app-url http://127.0.0.1:45173
Nothing here is for production: the JWT secret is made up and GitHub is a canned transport."""
from __future__ import annotations

import argparse
import base64
import json
import secrets
import signal
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "cloud"), str(ROOT / "tests" / "cloud")]

import httpx  # noqa: E402
import uvicorn  # noqa: E402
from cluster_fixture import start_cluster  # noqa: E402
from cryptography.fernet import Fernet  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

from speco_cloud import worker  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.credentials import Cipher  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402
from speco_cloud.providers import Providers  # noqa: E402
from speco_cloud.providers.bitbucket import BitbucketCloud  # noqa: E402

SPEC = """# Feature Specification: Team invitations

**Status**: Implemented

## Requirements

- **FR-001**: The system MUST allow only owners and admins to invite members
- **FR-002**: When a member is invited, the system MUST email the invitee within 60 seconds
- **FR-003**: The system MUST refund the full amount if an annual plan is cancelled within 14 days
"""
FILES = {"specs/001-invites/spec.md": SPEC, "README.md": "# Acme"}
REPOS = [{"id": 501, "full_name": "acme/app", "default_branch": "main"}]
OWNER_GITHUB_ID = 9001


def fake_github(req: httpx.Request) -> httpx.Response:
    p = req.url.path
    if p.endswith("/access_tokens"):
        return httpx.Response(201, json={"token": "ghs_fake"})
    if p == "/installation/repositories":
        return httpx.Response(200, json={"total_count": len(REPOS), "repositories": REPOS})
    if p.startswith("/app/installations/"):
        # the owner's own account: the service links it only for whoever signed in with that GitHub account (OWNER_GITHUB_ID)
        return httpx.Response(200, json={"id": 1, "account": {"login": "acme", "type": "User", "id": OWNER_GITHUB_ID}, "repository_selection": "selected"})
    if "/commits/" in p:
        return httpx.Response(200, json={"sha": "head-1"})
    if "/git/trees/" in p:
        return httpx.Response(200, json={"tree": [{"path": f, "type": "blob", "size": len(t)} for f, t in FILES.items()]})
    if "/contents/" in p:
        rel = p.split("/contents/", 1)[1]
        return httpx.Response(200, text=FILES[rel]) if rel in FILES else httpx.Response(404)
    return httpx.Response(404)


BB_API, BB_AUTH = "https://api.bitbucket.test/2.0", "https://bb.test/site/oauth2/access_token"
BB_FILES = {"specs/001-api/spec.md": SPEC, "README.md": "# Pilot"}
BB_REPOS = [{"uuid": "{r-api}", "full_name": "pilot/api", "mainbranch": {"name": "main"}}, {"uuid": "{r-web}", "full_name": "pilot/web", "mainbranch": {"name": "main"}},
            {"uuid": "{r-legacy}", "full_name": "pilot/legacy", "mainbranch": {"name": "master"}}]


def fake_bitbucket(req: httpx.Request) -> httpx.Response:
    """Bitbucket Cloud as the e2e check needs it: key `nope` is refused, key `writer` can write, workspace `ghost` does not exist."""
    url, p = str(req.url), req.url.path.removeprefix("/2.0")
    if url.startswith(BB_AUTH):
        user = base64.b64decode(req.headers["authorization"].removeprefix("Basic ")).decode().split(":", 1)[0]
        if user == "nope":
            return httpx.Response(401)
        return httpx.Response(200, json={"access_token": "bb-token", "expires_in": 7200, "scopes": "repository repository:write webhook" if user == "writer" else "repository webhook"})
    if p == "/workspaces/pilotco":
        return httpx.Response(200, json={"uuid": "{ws-pilot}", "slug": "pilotco"})
    if p == "/repositories/pilotco":
        return httpx.Response(200, json={"values": BB_REPOS})
    if p == "/workspaces/pilotco/hooks" and req.method == "POST":
        return httpx.Response(201, json={"uuid": "{hook-1}"})
    if p.startswith("/workspaces/pilotco/hooks/"):
        return httpx.Response(204)
    if "/refs/branches/" in p:
        return httpx.Response(200, json={"target": {"hash": "bb-head-1"}})
    if "/src/" in p:
        rest = p.split("/src/", 1)[1].split("/", 1)[1]
        if rest == "":
            return httpx.Response(200, json={"values": [{"path": f, "type": "commit_file", "size": len(t)} for f, t in BB_FILES.items()]})
        return httpx.Response(200, text=BB_FILES[rest]) if rest in BB_FILES else httpx.Response(404)
    return httpx.Response(404)


class CannedChat:
    """A model that always answers the same thing and reports 2 000 tokens in and 500 out (one credit)."""

    def chat(self, system: str, messages: list[dict], usage: dict):
        yield "Respuesta del asistente de la empresa."
        heavy = "gasta" in messages[-1]["content"]                     # a question that uses everything a turn may cost (5 credits)
        usage["input"], usage["output"] = (50_000, 500) if heavy else (2000, 500)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=48799)
    ap.add_argument("--app-url", default="http://127.0.0.1:45173")
    a = ap.parse_args()

    cluster, stop = start_cluster()
    users = {n: secrets.token_hex(2) for n in ("owner", "viewer", "newbie", "approver", "invitee")}
    ids = {"owner": "50000000-0000-0000-0000-000000000001", "viewer": "50000000-0000-0000-0000-000000000002",
           "newbie": "50000000-0000-0000-0000-000000000003", "approver": "50000000-0000-0000-0000-000000000004",
           "invitee": "50000000-0000-0000-0000-000000000005"}
    cluster.psql("".join(f"insert into auth.users (id, email) values ('{i}', '{n}@example.com');" for n, i in ids.items()))
    cluster.psql(f"insert into auth.identities (user_id, provider, provider_id) values ('{ids['owner']}', 'github', '{OWNER_GITHUB_ID}');")
    cluster.psql("update public.plan_settings set value = 1000 where key = 'daily_cap';")      # the browser check spends a company's credits in one go
    org = cluster.rows("select public.create_organization('Acme Cloud', 'acme-cloud');", ids["owner"])[0]
    cluster.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{ids['viewer']}', 'viewer'), ('{org}', '{ids['approver']}', 'approver');", ids["owner"])

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    jwt_secret = secrets.token_urlsafe(48)
    settings = Settings(database_url=f"host={cluster.sock} dbname=speco user=postgres", github_webhook_secret="x" * 16, github_app_id="42", github_app_slug="speco-e2e",
                        github_private_key=pem, supabase_jwt_secret=jwt_secret, state_secret=secrets.token_urlsafe(32), app_url=a.app_url,
                        supabase_url="http://localhost:9999", public_url=f"http://127.0.0.1:{a.port}",
                        credentials_key=Fernet.generate_key().decode(), bitbucket_api=BB_API, bitbucket_auth=BB_AUTH,
                        billing_provider="simulated")           # spec 024: paid plans on, nothing charged for real
    github = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake_github)))
    bitbucket = BitbucketCloud(BB_API, BB_AUTH, httpx.Client(transport=httpx.MockTransport(fake_bitbucket)))
    app = create_app(settings, github, bitbucket, chat_model=CannedChat())
    code = Providers(github=github, bitbucket=bitbucket, cipher=Cipher(settings.credentials_key))

    stopping = threading.Event()

    def work() -> None:
        while not stopping.is_set():
            try:
                if worker.run_once(settings, code) is None:
                    time.sleep(0.3)
            except Exception as e:                                   # noqa: BLE001
                print("worker error:", repr(e), file=sys.stderr, flush=True)
                time.sleep(1)

    threading.Thread(target=work, daemon=True).start()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=a.port, log_level="warning"))

    def shutdown(*_) -> None:
        stopping.set()
        server.should_exit = True

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    threading.Thread(target=lambda: (time.sleep(1.0), print("READY " + json.dumps({"jwtSecret": jwt_secret, "org": org, "users": ids}), flush=True)), daemon=True).start()
    try:
        server.run()
    finally:
        stopping.set()
        stop()


if __name__ == "__main__":
    main()
