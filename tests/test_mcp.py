"""Phase 2: the MCP server speaks JSON-RPC over stdio and reuses the CLI's engine."""
import io
import json
import subprocess
import sys

import pytest

from conftest import EXAMPLE
from specreview.cli import main
from specreview.mcp import Server, serve


def rpc(srv, method, params=None, mid=1):
    return srv.handle({"jsonrpc": "2.0", "id": mid, "method": method, "params": params or {}})


def call(srv, name, **args):
    r = rpc(srv, "tools/call", {"name": name, "arguments": args})["result"]
    return r, (r["structuredContent"] if not r["isError"] else None)


@pytest.fixture
def srv():
    return Server(EXAMPLE)


def test_initialize_negotiates_version_and_lists_capabilities(srv):
    r = rpc(srv, "initialize", {"protocolVersion": "2025-03-26"})["result"]
    assert r["protocolVersion"] == "2025-03-26" and {"tools", "resources", "prompts"} <= set(r["capabilities"])
    assert rpc(srv, "initialize", {"protocolVersion": "1999-01-01"})["result"]["protocolVersion"] == "2025-06-18"
    assert r["serverInfo"]["name"] == "specreview"


def test_notifications_get_no_reply(srv):
    assert srv.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None


def test_tools_list_has_schemas(srv):
    tools = {t["name"]: t for t in rpc(srv, "tools/list")["result"]["tools"]}
    assert {"list_features", "review_feature", "get_blockers", "explain_rule", "check_requirement", "product_overview", "approval_status",
            "what_it_does", "intent_ledger", "get_intent", "intent_history", "verify_intent", "draft_feature", "change_requirement", "suggest_values"} == set(tools)
    assert tools["explain_rule"]["inputSchema"]["required"] == ["rule"]


def test_get_blockers_on_the_known_bad_example(srv):
    # verifies 007/FR-001
    _, d = call(srv, "get_blockers")
    assert d["can_implement"] is False and d["blockers"] and "EN LA SPEC" in d["next_step"]
    assert all(f["severity"] == "blocker" for f in d["blockers"])


def test_review_feature_matches_the_cli_json(srv, capsys):
    main([str(EXAMPLE), "-f", "json", "--no-baseline", "--fail-on", "never"])
    cli = json.loads(capsys.readouterr().out)
    _, d = call(srv, "review_feature")
    assert d["findings"] == cli["findings"] and d["summary"] == cli["summary"]


def test_min_severity_and_feature_prefix(srv):
    _, d = call(srv, "review_feature", feature="003", min_severity="blocker")
    assert d["findings"] and {f["severity"] for f in d["findings"]} == {"blocker"}
    r, _ = call(srv, "review_feature", feature="999")
    assert r["isError"] and "no existe" in r["content"][0]["text"]
    r, _ = call(srv, "review_feature", min_severity="loud")
    assert r["isError"]


def test_list_features(srv):
    _, d = call(srv, "list_features")
    res = d["result"]
    assert res[0]["feature"] == "003-team-invitations" and res[0]["can_implement"] is False


def test_baseline_is_honoured_like_in_ci(make_repo, capsys):
    repo = make_repo({"001-a": "blocker"})
    s = Server(repo)
    assert call(s, "get_blockers")[1]["can_implement"] is False
    main(["baseline", str(repo)])
    capsys.readouterr()
    assert call(s, "get_blockers")[1]["can_implement"] is True
    assert call(s, "review_feature", ignore_baseline=True)[1]["findings"]


def test_explain_rule(srv):
    _, d = call(srv, "explain_rule", rule="cov001")
    assert d["id"] == "COV001" and "Qué detecta" in d["text"]
    assert call(srv, "explain_rule", rule="NOPE")[0]["isError"]


def test_check_requirement_good_and_bad(srv):
    # verifies 007/FR-003
    _, good = call(srv, "check_requirement", text="When a user fails login 5 times, the system MUST lock the account for 15 minutes")
    assert good["ok"] and good["ears_pattern"] == "event"
    _, bad = call(srv, "check_requirement", text="The system should be fast and easy to use")
    assert not bad["ok"] and {i["rule"] for i in bad["issues"]} & {"QUA001", "QUA002"}
    assert call(srv, "check_requirement", text="  ")[0]["isError"]


def test_resources_and_prompts(srv):
    uris = [r["uri"] for r in rpc(srv, "resources/list")["result"]["resources"]]
    assert uris == ["specreview://ledger", "specreview://feature/003-team-invitations/report"]
    assert json.loads(rpc(srv, "resources/read", {"uri": uris[0]})["result"]["contents"][0]["text"])["total"] > 0
    body = rpc(srv, "resources/read", {"uri": uris[1]})["result"]["contents"][0]
    assert json.loads(body["text"])["feature"] == "003-team-invitations"
    assert "get_blockers" in rpc(srv, "prompts/get", {"name": "review-spec", "arguments": {"feature": "003"}})["result"]["messages"][0]["content"]["text"]


def test_unknown_method_and_tool_are_errors_not_crashes(srv):
    assert rpc(srv, "nope")["error"]["code"] == -32601
    assert rpc(srv, "tools/call", {"name": "nope"})["error"]["code"] == -32602


def test_empty_repo_gives_a_tool_error(tmp_path):
    r, _ = call(Server(tmp_path), "list_features")
    assert r["isError"] and "Spec Kit" in r["content"][0]["text"]


def test_stdio_loop_survives_garbage():
    inp = io.StringIO('not json\n\n[1]\n{"jsonrpc":"2.0","id":7,"method":"ping"}\n')
    out = io.StringIO()
    serve(EXAMPLE, inp, out)
    lines = [json.loads(l) for l in out.getvalue().splitlines()]
    assert lines[0]["error"]["code"] == -32700 and lines[1]["error"]["code"] == -32700
    assert lines[2] == {"jsonrpc": "2.0", "id": 7, "result": {}}


def test_real_subprocess_handshake():
    # verifies 007/SC-001
    msgs = "\n".join(json.dumps(m) for m in [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_blockers", "arguments": {}}}]) + "\n"
    p = subprocess.run([sys.executable, "-m", "specreview.cli", "mcp", str(EXAMPLE)], input=msgs, capture_output=True, text=True, timeout=60)
    out = [json.loads(l) for l in p.stdout.splitlines()]
    assert [o["id"] for o in out] == [1, 2] and out[1]["result"]["structuredContent"]["can_implement"] is False


# ---------- gate (plugin hook) ----------
def test_gate_blocks_implement_when_blockers(make_repo, capsys):
    # verifies 007/FR-004
    repo = make_repo({"001-a": "blocker"})
    assert main(["gate", str(repo)]) == 2
    assert "bloqueante" in capsys.readouterr().err


def test_gate_is_silent_on_clean_or_non_speckit(make_repo, tmp_path, capsys):
    # verifies 007/FR-005
    assert main(["gate", str(make_repo({"001-a": "good"}))]) == 0
    assert main(["gate", str(tmp_path / "nowhere")]) == 0


def test_gate_hook_mode_only_reacts_to_implement(make_repo, monkeypatch, capsys):
    # verifies 007/FR-004
    repo = make_repo({"001-a": "blocker"})
    for prompt, code in [("explain this code", 0), ("/speckit.implement", 2)]:
        monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps({"prompt": prompt})))
        assert main(["gate", str(repo), "--hook"]) == code
    monkeypatch.setattr(sys, "stdin", io.StringIO("garbage"))
    assert main(["gate", str(repo), "--hook"]) == 0


def test_plugin_manifests_are_valid_json():
    from conftest import ROOT
    for p in (".claude-plugin/marketplace.json", "plugin/.claude-plugin/plugin.json", "plugin/.mcp.json", "plugin/hooks/hooks.json"):
        json.loads((ROOT / p).read_text())
    assert (ROOT / "plugin/commands/review-spec.md").read_text().startswith("---")
