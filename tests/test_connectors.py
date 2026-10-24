"""Phase 5: HTTP approval endpoints, Slack (digest, signature, button clicks) and Jira (sync + PRD006)."""
import hashlib
import hmac
import json
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlencode

import pytest

from specreview import approvals, jira, members, slack
from specreview.cli import main
from specreview.parser import load_feature
from specreview.product import check_product
from specreview.server import make_server


class Api:
    def __init__(self, root, **kw):
        self.srv = make_server(root, "127.0.0.1", 0, None, **kw)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def call(self, method, path, body=None, token=None, headers=None, raw=None):
        h = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        if token:
            h["Authorization"] = f"Bearer {token}"
        data = raw
        if body is not None:
            data, h["Content-Type"] = json.dumps(body).encode(), "application/json"
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def close(self):
        self.srv.shutdown()


@pytest.fixture
def api(make_repo):
    repo = make_repo({"001-good": "good", "002-bad": "blocker"})
    a = Api(repo, slack_signing_secret="s3cret")
    a.repo = repo
    yield a
    a.close()


# ---------- HTTP approvals ----------
def test_approval_endpoint_auth_and_flow(api):
    assert api.call("GET", "/api/me") == (200, {"authenticated": False, "member": None, "can_approve": False, "members_configured": False})
    code, body = api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"})
    assert code == 403 and body["code"] == "no_members"                                    # nobody configured: refuse, say how to fix
    m, token = members.add_member(api.repo, "Ana", "approver", "ana@x.com")
    assert api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"})[0] == 401
    assert api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token="sr_wrong")[0] == 401
    code, body = api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token=token)
    assert code == 201 and body["entry"]["by"]["via"] == "api" and body["status"]["state"] == "approved" and not body["status"]["stale"]
    code, me = api.call("GET", "/api/me", token=token)
    assert me["authenticated"] and me["can_approve"] and me["member"]["name"] == "Ana"
    code, got = api.call("GET", "/api/approvals?feature=001-good")
    assert got["status"]["state"] == "approved" and len(got["history"]) == 1
    code, allv = api.call("GET", "/api/approvals")
    assert allv["verify"]["ok"] and len(allv["history"]) == 1
    assert api.call("GET", "/api/approvals/verify")[1]["count"] == 1


def test_endpoint_policy_errors_map_to_http_codes(api):
    # verifies 010/FR-004, FR-005
    _, admin = members.add_member(api.repo, "Ana", "approver")
    _, viewer = members.add_member(api.repo, "Vic", "viewer")
    ok = lambda **kw: api.call("POST", "/api/approvals", {"feature": "002-bad", **kw}, token=kw.pop("t", admin))  # noqa: E731
    assert api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token=viewer)[0] == 403
    code, body = ok(decision="approved")
    assert code == 409 and body["code"] == "blocked"
    assert api.call("POST", "/api/approvals", {"feature": "002-bad", "decision": "approved", "override": True, "reason": "ok"}, token=admin)[0] == 201
    assert api.call("POST", "/api/approvals", {"feature": "002-bad", "decision": "rejected"}, token=admin)[0] == 400       # reason missing
    assert api.call("POST", "/api/approvals", {"feature": "nope", "decision": "approved"}, token=admin)[0] == 404
    assert api.call("POST", "/api/approvals", {"decision": "approved"}, token=admin)[0] == 400
    assert api.call("POST", "/api/approvals", raw=b"{}", token=admin, headers={"Content-Type": "text/plain"})[0] == 415


def test_endpoint_refuses_foreign_host_and_origin(api):
    _, token = members.add_member(api.repo, "Ana", "approver")
    assert api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token=token, headers={"Host": "evil.example"})[0] == 403
    assert api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token=token, headers={"Origin": "https://evil.example"})[0] == 403


def test_tampered_log_is_reported_by_the_endpoint(api):
    # verifies 010/FR-003
    _, token = members.add_member(api.repo, "Ana", "approver")
    api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token=token)
    log = api.repo / ".specreview" / "approvals.jsonl"
    log.write_text(log.read_text().replace("Ana", "Eve"))
    assert api.call("GET", "/api/approvals/verify")[1]["ok"] is False
    code, body = api.call("POST", "/api/approvals", {"feature": "001-good", "decision": "approved"}, token=token)
    assert code == 409 and body["code"] == "tampered"


# ---------- Slack ----------
def sign(secret, ts, body):
    return "v0=" + hmac.new(secret.encode(), f"v0:{ts}:".encode() + body, hashlib.sha256).hexdigest()


def test_signature_verification():
    body = b"payload=x"
    ts = str(int(time.time()))
    assert slack.verify_signature("k", ts, body, sign("k", ts, body))
    assert not slack.verify_signature("k", ts, body, sign("other", ts, body))
    assert not slack.verify_signature("k", ts, body + b"!", sign("k", ts, body))
    old = str(int(time.time()) - 3600)
    assert not slack.verify_signature("k", old, body, sign("k", old, body))                 # replay
    assert not slack.verify_signature("k", "abc", body, "v0=x") and not slack.verify_signature("k", ts, body, "")


def rows():
    mk = lambda n, v, d, t: {"feature": n, "decision": {"verdict": v, "waiting_on": {"decision": d, "team": t}}, "summary": {}}  # noqa: E731
    return [mk("003-x", "needs_decision", 2, 3), mk("004-y", "ready", 0, 0), mk("005-z", "blocked", 0, 4)]


def test_digest_only_lists_what_waits_for_a_decision():
    p = slack.build_digest(rows(), "https://app.example.com", interactive=True)
    assert p["text"] == "1 spec espera tu decisión"
    assert slack.build_digest([rows()[0], {**rows()[0], "feature": "006-w"}], "")["text"] == "2 specs esperan tu decisión"
    text = json.dumps(p, ensure_ascii=False)
    assert "003-x" in text and "004-y" not in text and "https://app.example.com/reviews/003-x" in text
    actions = [b for b in p["blocks"] if b["type"] == "actions"][0]["elements"]
    assert [a["action_id"] for a in actions] == ["sr_approve", "sr_reject"] and actions[0]["value"] == "003-x" and "confirm" in actions[0]
    assert slack.build_digest([rows()[1]], "") is None                                       # nothing to say: say nothing
    assert "005-z" in json.dumps(slack.build_digest(rows(), "", only_pending=False))
    assert "actions" not in {b["type"] for b in slack.build_digest(rows(), "", interactive=False)["blocks"]}


def test_notify_dry_run_and_missing_webhook(make_repo, capsys, monkeypatch):
    repo = make_repo({"001-good": "good", "002-bad": "blocker"})
    code = main(["notify", "slack", str(repo), "--dry-run", "--base-url", "https://app.example.com"])
    out = capsys.readouterr().out
    assert code == 0 and "002-bad" in out and "001-good" not in out and "https://app.example.com/reviews/002-bad" in out
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    assert main(["notify", "slack", str(repo)]) == 2 and "SLACK_WEBHOOK_URL" in capsys.readouterr().err
    with pytest.raises(ValueError, match="https"):
        slack.post_webhook("http://insecure.example/x", {})
    only_good = repo / "specs" / "002-bad"
    import shutil
    shutil.rmtree(only_good)
    assert main(["notify", "slack", str(repo), "--dry-run"]) == 0 and "Nada espera" in capsys.readouterr().out


def click(api, secret, user, action, feature, ts=None, tamper=False):
    payload = {"user": {"id": user}, "actions": [{"action_id": action, "value": feature}]}
    body = urlencode({"payload": json.dumps(payload)}).encode()
    ts = ts or str(int(time.time()))
    sig = sign(secret, ts, body + (b"x" if tamper else b""))
    return api.call("POST", "/api/slack/interact", raw=body, headers={"X-Slack-Request-Timestamp": ts, "X-Slack-Signature": sig,
                                                                       "Content-Type": "application/x-www-form-urlencoded"})


def test_slack_click_records_an_approval_for_the_linked_member(api):
    # verifies 010/FR-006
    members.add_member(api.repo, "Ana", "approver", slack="U1")
    members.add_member(api.repo, "Mo", "member", slack="U2")
    code, body = click(api, "s3cret", "U1", "sr_approve", "001-good")
    assert code == 200 and "aprobaste" in body["text"]
    e = approvals.history(api.repo)[0]
    assert e["by"]["via"] == "slack" and e["by"]["name"] == "Ana" and e["decision"] == "approved"
    assert "rechazaste" in click(api, "s3cret", "U1", "sr_reject", "001-good")[1]["text"]
    assert "No se registró" in click(api, "s3cret", "U2", "sr_approve", "001-good")[1]["text"]            # member role: refused by policy
    assert "no está vinculado" in click(api, "s3cret", "U9", "sr_approve", "001-good")[1]["text"]
    assert "desconocida" in click(api, "s3cret", "U1", "sr_approve", "no-such")[1]["text"]
    assert len(approvals.history(api.repo)) == 2


def test_slack_click_rejects_bad_signature_replay_and_unconfigured(api):
    # verifies 010/FR-006
    members.add_member(api.repo, "Ana", "approver", slack="U1")
    assert click(api, "s3cret", "U1", "sr_approve", "001-good", tamper=True)[0] == 401
    assert click(api, "s3cret", "U1", "sr_approve", "001-good", ts=str(int(time.time()) - 4000))[0] == 401
    assert click(api, "wrong", "U1", "sr_approve", "001-good")[0] == 401
    assert approvals.history(api.repo) == []
    bare = Api(api.repo)
    try:
        assert bare.call("POST", "/api/slack/interact", raw=b"payload=%7B%7D")[0] == 503
    finally:
        bare.close()


# ---------- Jira ----------
class FakeJira(BaseHTTPRequestHandler):
    calls: list = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        FakeJira.calls.append((self.path, self.headers.get("Authorization")))
        if self.headers.get("Authorization") is None or "bad" in self.path:
            self.send_response(401); self.end_headers(); return                                # noqa: E702
        first = "nextPageToken" not in self.path
        issue = lambda k, st, cat: {"key": k, "fields": {"summary": f"Epic {k}", "status": {"name": st, "statusCategory": {"key": cat}},  # noqa: E731
                                                          "issuetype": {"name": "Epic"}, "parent": {"key": "PROJ-1"} if k == "PROJ-7" else None}}
        body = ({"issues": [issue("PROJ-7", "In Progress", "indeterminate"), issue("PROJ-8", "Done", "done")], "nextPageToken": "p2", "isLast": False}
                if first else {"issues": [issue("PROJ-9", "To Do", "new")], "isLast": True})
        out = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(out)    # noqa: E702


@pytest.fixture
def fake_jira():
    FakeJira.calls = []
    srv = HTTPServer(("127.0.0.1", 0), FakeJira)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_jira_sync_paginates_and_normalizes(fake_jira, tmp_path):
    p, n = jira.sync(fake_jira, "me@x.com", "tok", "PROJ", tmp_path / "product")
    data = json.loads(p.read_text())
    assert n == 3 and [i["key"] for i in data["issues"]] == ["PROJ-7", "PROJ-8", "PROJ-9"]
    assert data["issues"][1]["status_category"] == "done" and data["issues"][0]["parent"] == "PROJ-1"
    assert any("nextPageToken=p2" in c[0] for c in FakeJira.calls) and all("/rest/api/3/search/jql" in c[0] for c in FakeJira.calls)
    assert FakeJira.calls[0][1].startswith("Basic ")


def test_jira_errors_are_clear_and_https_is_required(fake_jira, tmp_path):
    with pytest.raises(ValueError, match="401"):
        jira.sync(fake_jira, "me@x.com", "tok", "PROJ", tmp_path, jql="project = bad")
    with pytest.raises(ValueError, match="https"):
        jira.sync("http://jira.example.com", "a", "b", "PROJ", tmp_path)
    with pytest.raises(ValueError, match="no pude llegar"):
        jira.sync("http://127.0.0.1:1", "a", "b", "PROJ", tmp_path, timeout=1)


def test_cli_jira_sync_reads_env(fake_jira, make_repo, capsys, monkeypatch):
    repo = make_repo({"001-a": "good"})
    assert main(["jira", "sync", "--project", "PROJ", "--path", str(repo)]) == 2
    assert "JIRA_BASE_URL" in capsys.readouterr().err
    for k, v in {"JIRA_BASE_URL": fake_jira, "JIRA_EMAIL": "me@x.com", "JIRA_API_TOKEN": "t"}.items():
        monkeypatch.setenv(k, v)
    assert main(["jira", "sync", "--project", "PROJ", "--path", str(repo)]) == 0
    assert (repo / "product" / "jira.json").is_file() and "3 issues" in capsys.readouterr().out


def test_prd006_unknown_and_closed_issues(make_repo):
    repo = make_repo({"001-a": "good"})
    spec = repo / "specs" / "001-a" / "spec.md"
    spec.write_text(spec.read_text().replace("\n## Requirements", "\n**Jira**: PROJ-7, PROJ-8, PROJ-99\n\n## Requirements", 1))
    (repo / "product").mkdir()
    (repo / "product" / "goals.md").write_text("- **G-1**: g\n")
    assert [f for f in check_product(load_feature(repo / "specs" / "001-a")) if f.rule == "PRD006"] == []          # no cache: opt-in
    (repo / "product" / "jira.json").write_text(json.dumps({"synced_at": "2026-10-01", "issues": [
        {"key": "PROJ-7", "summary": "Live", "status": "In Progress", "status_category": "indeterminate"},
        {"key": "PROJ-8", "summary": "Shipped last month", "status": "Done", "status_category": "done"}]}))
    f = {x.ids[0]: x for x in check_product(load_feature(repo / "specs" / "001-a")) if x.rule == "PRD006"}
    assert set(f) == {"PROJ-8", "PROJ-99"} and "Done" in f["PROJ-8"].message and "caché" in f["PROJ-99"].message


def test_digest_summarizes_waiting_ready_and_recorded():
    # verifies 012/FR-012
    p = slack.build_digest(rows(), "", only_pending=False, recorded=3)
    ctx = [b for b in p["blocks"] if b["type"] == "context"][0]["elements"][0]["text"]
    assert ctx == "1 esperan tu decisión · 1 listas para construir · 3 decisiones registradas"
    assert "decisiones registradas" not in json.dumps(slack.build_digest(rows(), ""), ensure_ascii=False)     # unknown count: do not invent it
