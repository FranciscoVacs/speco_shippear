"""Spec 026 · the PR review: a fake GitHub serves two commits of examples/wire-transfers, and the bot comments once per PR."""
from __future__ import annotations

import hashlib
import hmac
import json
import sys
from pathlib import Path

import pytest

for mod in ("fastapi", "httpx", "jwt", "cryptography", "psycopg"):
    pytest.importorskip(mod)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "cloud"))

import httpx  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cluster_fixture import pg  # noqa: E402,F401  (session fixture)
from speco_cloud import pr_review, prbot  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402
from specreview.intent_diff import MARKER  # noqa: E402

WIRES = ROOT / "examples" / "wire-transfers"
SPEC = "specs/006-wire-transfer-limits/spec.md"
SECRET = "s3cret"


def wire_files() -> dict[str, str]:
    return {p.relative_to(WIRES).as_posix(): p.read_text(encoding="utf-8") for p in (WIRES / "specs").rglob("*.md")}


class FakeGitHub:
    def __init__(self):
        base = wire_files()
        moved = {**base, SPEC: base[SPEC].replace("When a wire is above 10,000 USD", "When a wire is above 15,000 USD")}
        self.commits = {"base": base, "head": moved, "docs-only": {**base}}
        self.noise = {"README.md": {"base": "# a", "head": "# a", "docs-only": "# b"}}
        self.comments: dict[int, dict] = {}
        self.requests: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        path, method = req.url.path, req.method
        self.requests.append(f"{method} {path}")
        if path.endswith("/access_tokens"):
            return httpx.Response(201, json={"token": "ghs_x"})
        if path == "/installation/repositories":
            return httpx.Response(200, json={"total_count": 1, "repositories": [{"full_name": "acme/bank"}]})
        if "/git/trees/" in path:
            sha = path.rsplit("/", 1)[1]
            files = {**self.commits[sha], **{p: v[sha] for p, v in self.noise.items()}}
            return httpx.Response(200, json={"tree": [{"path": p, "type": "blob", "size": len(t), "sha": hashlib.sha1(t.encode()).hexdigest()} for p, t in files.items()]})
        if "/contents/" in path:
            return httpx.Response(200, text=self.commits[req.url.params["ref"]][path.split("/contents/", 1)[1]])
        if path.endswith("/issues/7/comments") and method == "GET":
            return httpx.Response(200, json=list(self.comments.values()))
        if path.endswith("/issues/7/comments") and method == "POST":
            cid = 100 + len(self.comments)
            self.comments[cid] = {"id": cid, "body": json.loads(req.content)["body"], "performed_via_github_app": {"id": 42}}
            return httpx.Response(201, json=self.comments[cid])
        if "/issues/comments/" in path and method == "PATCH":
            cid = int(path.rsplit("/", 1)[1])
            self.comments[cid]["body"] = json.loads(req.content)["body"]
            return httpx.Response(200, json=self.comments[cid])
        return httpx.Response(404)


@pytest.fixture
def gh():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    fake = FakeGitHub()
    client = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    client.fake, client.pem = fake, pem
    return client


def test_a_pr_that_moves_a_threshold_gets_one_comment_edited_on_each_push(gh):
    # verifies 026/FR-009
    out = pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "head")
    assert out["outcome"] == "commented" and out["created"] and out["features"] == 1
    [c] = gh.fake.comments.values()
    assert c["body"].startswith(MARKER) and "10,000 USD → 15,000 USD" in c["body"] and "T004" in c["body"]
    again = pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "head")
    assert again["created"] is False and len(gh.fake.comments) == 1


def test_a_comment_that_copies_the_marker_is_never_edited(gh):
    gh.fake.comments[1] = {"id": 1, "body": MARKER + " spoofed", "performed_via_github_app": None}
    out = pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "head")
    assert out["created"] and gh.fake.comments[1]["body"] == MARKER + " spoofed"


def test_a_pr_that_touches_no_spec_is_left_alone_without_reading_files(gh):
    # verifies 026/FR-010
    assert pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "docs-only") == {"outcome": "no_spec_changes"}
    assert not gh.fake.comments
    assert not any("/contents/" in r for r in gh.fake.requests)


def _deliver(client, event: str, payload: dict, secret: str = SECRET):
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return client.post("/webhooks/github", content=body, headers={"x-github-event": event, "x-hub-signature-256": sig, "content-type": "application/json"})


def _pr(action: str) -> dict:
    return {"action": action, "installation": {"id": 1}, "repository": {"full_name": "acme/bank"},
            "pull_request": {"number": 7, "base": {"sha": "base"}, "head": {"sha": "head"}}}


@pytest.fixture
def bot(gh):
    settings = prbot.BotSettings("42", gh.pem, SECRET, "speco-test", status_token="op")
    return TestClient(prbot.create_app(settings, gh)), gh.fake


def test_the_bot_comments_on_an_opened_pr_and_lists_it_on_the_home_page(bot):
    # verifies 026/FR-006
    client, fake = bot
    r = _deliver(client, "pull_request", _pr("opened"))
    assert r.status_code == 202
    [c] = fake.comments.values()
    assert "15,000 USD" in c["body"]
    assert "apps/speco-test/installations/new" in c["body"]           # whoever tried it on a shared repo can take it home
    assert "apps/speco-test/installations/new" in client.get("/").text
    assert "acme/bank" not in client.get("/").text and "acme/bank" not in client.get("/", params={"token": "nope"}).text
    home = client.get("/", params={"token": "op"}).text
    assert "acme/bank#7" in home and "commented" in home


def test_the_bot_rejects_bad_signatures_and_ignores_what_it_does_not_review(bot):
    # verifies 026/FR-011
    client, fake = bot
    assert _deliver(client, "pull_request", _pr("opened"), secret="wrong").status_code == 401
    assert _deliver(client, "ping", {"zen": "hi"}).json() == {"status": "pong"}
    assert _deliver(client, "pull_request", _pr("closed")).json() == {"status": "ignored"}
    assert _deliver(client, "push", {}).json() == {"status": "ignored"}
    assert not fake.comments


def test_the_setup_page_gives_the_next_step_and_reads_nothing_from_the_query(bot):
    # verifies 026/FR-007
    client, fake = bot
    page = client.get("/github/setup", params={"installation_id": 1}).text
    assert "specs/" in page and "acme/bank" not in page
    assert not fake.requests


def test_settings_name_what_is_missing():
    with pytest.raises(ValueError, match="GITHUB_APP_ID"):
        prbot.BotSettings.from_env({"GITHUB_WEBHOOK_SECRET": "x", "GITHUB_PRIVATE_KEY": "k"})


def test_on_vercel_the_review_finishes_before_the_answer(gh):
    s = prbot.BotSettings.from_env({"GITHUB_APP_ID": "42", "GITHUB_WEBHOOK_SECRET": SECRET, "GITHUB_PRIVATE_KEY": gh.pem, "VERCEL": "1"})
    assert s.inline
    client = TestClient(prbot.create_app(s, gh))
    assert _deliver(client, "pull_request", _pr("opened")).json() == {"status": "reviewed"}
    assert len(gh.fake.comments) == 1
    assert not prbot.BotSettings.from_env({"GITHUB_APP_ID": "42", "GITHUB_WEBHOOK_SECRET": SECRET, "GITHUB_PRIVATE_KEY": gh.pem}).inline


def test_the_full_service_comments_too_so_one_app_serves_both(gh, pg):
    """The App has one webhook URL: once it points at the service, PRs must keep getting their comment, linked to a company or not."""
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret=SECRET, github_app_slug="speco-test")
    client = TestClient(create_app(settings, gh))
    body = json.dumps(_pr("opened")).encode()
    sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    r = client.post("/webhooks/github", content=body, headers={"x-github-event": "pull_request", "x-github-delivery": "pr-1", "x-hub-signature-256": sig})
    assert r.json() == {"status": "commented"}
    [c] = gh.fake.comments.values()
    assert "15,000 USD" in c["body"] and "apps/speco-test/installations/new" in c["body"]
    assert client.post("/webhooks/github", content=body, headers={"x-github-event": "pull_request", "x-github-delivery": "pr-1", "x-hub-signature-256": sig}).json() == {"status": "duplicate"}


# ------------------------------------------------------------------ spec 029: a PR that only moves a decided number in the code
def test_a_pr_that_moves_a_decided_number_in_the_code_gets_a_comment(gh):
    # verifies 029/FR-002
    toml = '[values]\n"006/FR-004" = { file = "app/limits.py", match = "SECOND_APPROVAL = (\\\\d+)" }\n'
    code = {"base": "SECOND_APPROVAL = 10000\n", "head": "SECOND_APPROVAL = 25000\n", "docs-only": "SECOND_APPROVAL = 10000\n"}
    base = gh.fake.commits["base"]
    fr1 = next(l for l in base[SPEC].splitlines() if "**FR-004**" in l)
    assert "10,000" in fr1                                              # the rule the binding points at states the number
    for sha in ("base", "head", "docs-only"):
        gh.fake.commits[sha] = {**base, "specreview.toml": toml, "app/limits.py": code[sha]}
    out = pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "head")
    assert out["outcome"] == "commented" and out["moved_values"] == 1
    body = next(iter(gh.fake.comments.values()))["body"]
    assert "mueve un número que decidió producto" in body
    assert "`app/limits.py:1` pasa a **25000** (antes 10000)" in body
    assert pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "docs-only")["outcome"] == "no_spec_changes"


S = "/"   # the fixture's citations are built at run time, so this file does not cite the rules of this repository


def _with_test(gh, toml: str | None):
    rule = f"006{S}FR-004"
    test = {"base": f"def test_second_approval():\n    # verifies {rule}\n    assert approve(15000) == 'second'\n",
            "head": f"def test_second_approval():\n    # verifies {rule}\n    assert True\n"}
    test["docs-only"] = test["base"]
    for sha in ("base", "head", "docs-only"):
        extra = {"tests/test_limits.py": test[sha], **({"specreview.toml": toml} if toml else {})}
        spec = gh.fake.commits[sha]                       # keeps the head's moved threshold, so the PR also changes a spec
        gh.fake.commits[sha] = {**spec, **extra}


def test_a_repository_that_opts_in_gets_its_edited_tests_in_the_comment(gh):
    """032/FR-011"""
    _with_test(gh, "[pr]\nreview_tests = true\n")
    out = pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "head")
    assert out["outcome"] == "commented" and out["edited_tests"] == 1
    body = next(iter(gh.fake.comments.values()))["body"]
    assert "toca el test de una regla" in body and f"006-wire-transfer-limits{S}FR-004" in body and "`tests/test_limits.py:2`" in body


def test_without_the_opt_in_no_test_file_is_read(gh):
    """032/FR-012"""
    _with_test(gh, None)
    out = pr_review.review_pull_request(gh, 1, "acme/bank", 7, "base", "head")
    assert out["edited_tests"] == 0
    assert not any("tests/test_limits.py" in r for r in gh.fake.requests)
    assert "toca el test" not in next(iter(gh.fake.comments.values()))["body"]
