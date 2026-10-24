"""Phase 5: members, approvals (hash-chained audit log), staleness, policy."""
import json
from datetime import datetime, timezone

import pytest

from specreview import approvals, members
from specreview.analyzers import Context, run_all
from specreview.cli import main
from specreview.parser import load_feature
from specreview.report import build_report, to_dict

T0 = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)


def run(capsys, *argv):
    code = main([*map(str, argv)])
    cap = capsys.readouterr()
    return code, cap.out, cap.err


def review(d):
    f = load_feature(d)
    return to_dict(build_report(f, run_all(f, Context())))


@pytest.fixture
def repo(make_repo):
    return make_repo({"001-good": "good", "002-bad": "blocker"})


@pytest.fixture
def ana(repo):
    m, token = members.add_member(repo, "Ana", "approver", "ana@x.com", slack="U1")
    return m, token


def feat(repo, n):
    return repo / "specs" / n


# ---------- members ----------
def test_token_is_shown_once_and_only_its_hash_is_stored(repo):
    m, token = members.add_member(repo, "Ana", "approver", "ana@x.com")
    raw = (repo / ".specreview" / "members.json").read_text()
    assert token.startswith("sr_") and token not in raw and "token_sha256" in raw
    assert members.authenticate(repo, token).id == m.id
    assert members.authenticate(repo, token + "x") is None and members.authenticate(repo, None) is None


def test_revoked_member_cannot_authenticate_and_roles_are_validated(repo):
    m, token = members.add_member(repo, "Ana", "approver", "ana@x.com")
    members.revoke_member(repo, "ana@x.com")
    assert members.authenticate(repo, token) is None
    with pytest.raises(ValueError, match="rol"):
        members.add_member(repo, "Bob", "boss")
    members.add_member(repo, "A", "member", "dup@x.com")
    with pytest.raises(ValueError, match="email"):
        members.add_member(repo, "A2", "member", "dup@x.com")


# ---------- policy ----------
# verifies: 010/FR-005
def test_only_approvers_can_decide(repo):
    # verifies 010/FR-005
    viewer, _ = members.add_member(repo, "Vic", "viewer")
    with pytest.raises(approvals.PolicyError) as e:
        approvals.record(repo, "001-good", feat(repo, "001-good"), viewer, "approved", review(feat(repo, "001-good")))
    assert e.value.code == "forbidden"


def test_reason_and_conditions_are_required_where_they_matter(repo, ana):
    m, _ = ana
    d, r = feat(repo, "001-good"), review(feat(repo, "001-good"))
    approvals.record(repo, "001-good", d, m, "approved", r)                                   # plain approval needs no reason
    for kw in ({"decision": "rejected"}, {"decision": "approved_with_conditions", "reason": "x"},
               {"decision": "approved_with_conditions", "reason": "x", "conditions": [" "]}, {"decision": "nonsense"},
               {"decision": "delegated", "reason": "x", "delegate_to": "m_nope"}):
        with pytest.raises(approvals.PolicyError):
            approvals.record(repo, "001-good", d, m, review=r, **kw)


def test_delegation_must_target_another_approver(repo, ana):
    m, _ = ana
    other, _ = members.add_member(repo, "Ben", "approver")
    member, _ = members.add_member(repo, "Mo", "member")
    d, r = feat(repo, "001-good"), review(feat(repo, "001-good"))
    with pytest.raises(approvals.PolicyError, match="uno mismo"):
        approvals.record(repo, "001-good", d, m, "delegated", r, "x", delegate_to=m.id)
    with pytest.raises(approvals.PolicyError, match="approver"):
        approvals.record(repo, "001-good", d, m, "delegated", r, "x", delegate_to=member.id)
    e = approvals.record(repo, "001-good", d, m, "delegated", r, "me voy", delegate_to=other.id)
    assert e["delegate_to"] == other.id
    with pytest.raises(approvals.PolicyError, match="delegated"):
        approvals.record(repo, "001-good", d, m, "approved", r, delegate_to=other.id)


# verifies: 010/FR-004
def test_blocked_feature_needs_override_with_a_reason(repo, ana):
    # verifies 010/FR-004
    m, _ = ana
    d, r = feat(repo, "002-bad"), review(feat(repo, "002-bad"))
    assert r["decision"]["can_implement"] is False
    with pytest.raises(approvals.PolicyError) as e:
        approvals.record(repo, "002-bad", d, m, "approved", r)
    assert e.value.code == "blocked"
    with pytest.raises(approvals.PolicyError, match="motivo"):
        approvals.record(repo, "002-bad", d, m, "approved", r, override=True)
    e = approvals.record(repo, "002-bad", d, m, "approved", r, "riesgo aceptado hasta el viernes", override=True)
    assert e["override"] is True and e["open"]["blockers"] > 0
    approvals.record(repo, "002-bad", d, m, "rejected", r, "no")                               # rejecting a blocked spec is always fine


# ---------- audit log ----------
# verifies: 010/FR-001, FR-003
def test_entries_record_who_what_version_and_chain(repo, ana):
    # verifies 010/FR-001, FR-003
    m, _ = ana
    d, r = feat(repo, "001-good"), review(feat(repo, "001-good"))
    a = approvals.record(repo, "001-good", d, m, "approved", r, now=T0)
    b = approvals.record(repo, "001-good", d, m, "approved_with_conditions", r, "ok si hay tests", ["agregar tests"], now=T0)
    assert a["by"] == {**m.public(), "via": "api"} and a["at"] == "2026-10-14T12:00:00Z" and a["verdict"] == r["decision"]["verdict"]
    assert a["prev"] == "genesis" and b["prev"] == a["hash"] and a["id"] == "a_000001" and b["id"] == "a_000002"
    assert set(a["files"]) == {"spec.md", "plan.md", "tasks.md"} and a["spec_hash"] == approvals.spec_hash(a["files"])
    assert approvals.verify(repo) == {"ok": True, "count": 2, "broken_at": None, "reason": ""}
    assert [e["id"] for e in approvals.history(repo)] == ["a_000002", "a_000001"]


# verifies: 010/FR-003
def test_editing_an_entry_breaks_the_chain(repo, ana):
    # verifies 010/FR-003, SC-001
    m, _ = ana
    d, r = feat(repo, "001-good"), review(feat(repo, "001-good"))
    for _ in range(3):
        approvals.record(repo, "001-good", d, m, "approved", r)
    log = repo / ".specreview" / "approvals.jsonl"
    lines = log.read_text().splitlines()
    e = json.loads(lines[1])
    e["by"]["name"] = "Mallory"
    lines[1] = json.dumps(e)
    log.write_text("\n".join(lines) + "\n")
    v = approvals.verify(repo)
    assert not v["ok"] and v["broken_at"] == "a_000002" and "hash" in v["reason"]


# verifies: 010/FR-003
def test_deleting_an_entry_breaks_the_chain_and_blocks_new_ones(repo, ana):
    # verifies 010/FR-003, SC-001
    m, _ = ana
    d, r = feat(repo, "001-good"), review(feat(repo, "001-good"))
    for _ in range(3):
        approvals.record(repo, "001-good", d, m, "approved", r)
    log = repo / ".specreview" / "approvals.jsonl"
    lines = log.read_text().splitlines()
    log.write_text("\n".join([lines[0], lines[2]]) + "\n")                                        # drop the middle entry
    assert approvals.verify(repo)["broken_at"] == "a_000003"
    with pytest.raises(approvals.PolicyError) as e:
        approvals.record(repo, "001-good", d, m, "approved", r)
    assert e.value.code == "tampered"


def test_garbage_in_the_log_is_a_clear_error(repo):
    (repo / ".specreview").mkdir()
    (repo / ".specreview" / "approvals.jsonl").write_text("{not json}\n")
    with pytest.raises(ValueError, match="approvals.jsonl:1"):
        approvals.verify(repo)


# ---------- staleness ----------
# verifies: 010/FR-002
def test_approval_goes_stale_when_the_spec_changes(repo, ana):
    # verifies 010/FR-002
    m, _ = ana
    d = feat(repo, "001-good")
    assert approvals.status(repo, "001-good", d).state == "none"
    approvals.record(repo, "001-good", d, m, "approved", review(d))
    st = approvals.status(repo, "001-good", d)
    assert st.state == "approved" and not st.stale and st.changed_files == []
    (d / "spec.md").write_text((d / "spec.md").read_text() + "- **FR-002**: System MUST log out\n")
    st = approvals.status(repo, "001-good", d)
    assert st.stale and st.changed_files == ["spec.md"] and st.state == "approved"
    (d / "data-model.md").write_text("# new file\n")
    assert approvals.status(repo, "001-good", d).changed_files == ["data-model.md", "spec.md"]


def test_status_is_per_feature(repo, ana):
    m, _ = ana
    approvals.record(repo, "001-good", feat(repo, "001-good"), m, "approved", review(feat(repo, "001-good")))
    assert approvals.status(repo, "002-bad", feat(repo, "002-bad")).state == "none"


# ---------- CLI ----------
def test_cli_member_and_approval_flow(repo, capsys, monkeypatch):
    code, out, _ = run(capsys, "member", "add", "Ana", "--role", "approver", "--path", repo)
    token = out.split("\n  ")[1].split("\n")[0].strip()
    assert code == 0 and token.startswith("sr_")
    assert "Ana" in run(capsys, "member", "list", "--path", repo)[1]
    code, _, err = run(capsys, "approvals", "record", "001-good", "--decision", "approved", "--path", repo)
    assert code == 2 and "SPECREVIEW_TOKEN" in err
    monkeypatch.setenv("SPECREVIEW_TOKEN", token)
    code, out, _ = run(capsys, "approvals", "record", "001-good", "--decision", "approved", "--path", repo)
    assert code == 0 and "a_000001" in out
    code, _, err = run(capsys, "approvals", "record", "002-bad", "--decision", "approved", "--path", repo)
    assert code == 2 and "bloqueantes" in err
    assert "001-good" in run(capsys, "approvals", "list", "--path", repo)[1]
    assert json.loads(run(capsys, "approvals", "list", "-f", "json", "--path", repo)[1])[0]["by"]["via"] == "cli"
    assert run(capsys, "approvals", "verify", "--path", repo)[0] == 0
    log = repo / ".specreview" / "approvals.jsonl"
    log.write_text(log.read_text().replace('"approved"', '"rejected"'))
    code, out, _ = run(capsys, "approvals", "verify", "--path", repo)
    assert code == 1 and "ROTO" in out
    assert run(capsys, "member", "revoke", "Ana", "--path", repo)[0] == 2                          # revoke by id/email, not name


def test_mcp_approval_status_is_read_only_and_reports_staleness(repo, ana):
    # verifies 010/FR-002
    from specreview.mcp import Server
    m, _ = ana
    d = feat(repo, "001-good")
    approvals.record(repo, "001-good", d, m, "approved", review(d))
    s = Server(repo)
    call = lambda: s.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "approval_status", "arguments": {"feature": "001"}}})["result"]["structuredContent"]  # noqa: E731
    assert call()["approved_current_version"] is True and call()["latest"]["by"]["name"] == "Ana"
    (d / "plan.md").write_text((d / "plan.md").read_text() + "\nmore\n")
    assert call()["approved_current_version"] is False and call()["changed_files"] == ["plan.md"]
    tools = {t["name"] for t in s.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"]}
    assert not any("approve" == t or t.startswith("record") for t in tools)
