"""Properties of the approvals log (spec 010), one per invariant requirement, generated with Hypothesis.

Each test names the requirement it checks (`FR-nnn`). They complement `test_approvals.py` (examples): here the claim is
«for every input», sampled, not «for this input». See `docs/37-verified-intent.md`.
"""
import json
import tempfile
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st

from specreview import approvals
from specreview.members import Member

APPROVER = Member("m_1", "Ana", "ana@x.com", "approver")
NOT_APPROVER = st.sampled_from(["member", "viewer"]).map(lambda r: Member("m_2", "Bob", "bob@x.com", r))
SETTINGS = settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])

text = st.text(alphabet=st.characters(blacklist_categories=("Cs",)), max_size=40)
spec_files = st.dictionaries(st.sampled_from(approvals.FILES), text, min_size=1)
# decisions that need no extra input (delegation needs a second approver in members.json)
SIMPLE = ("approved", "approved_with_conditions", "rejected")


def review(blockers: int = 0) -> dict:
    return {"decision": {"can_implement": blockers == 0, "verdict": "x", "waiting_on": {"decision": 0, "team": 0}},
            "summary": {"blocker": blockers}}


def workspace(files: dict[str, str]):
    """A temporary repo root with `specs/f/` holding `files`."""
    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name)
    feat = root / "specs" / "f"
    feat.mkdir(parents=True)
    for n, body in files.items():
        (feat / n).write_text(body, encoding="utf-8")
    return tmp, root, feat


@st.composite
def decision_args(draw, blockers: int = 0):
    d = draw(st.sampled_from(SIMPLE))
    reason = draw(text.filter(lambda s: s.strip()))
    return dict(decision=d, reason=reason, conditions=["c"] if d == "approved_with_conditions" else None,
                override=blockers > 0 and d.startswith("approved"))


def fill(root, feat, n, blockers=0, data=None):
    for _ in range(n):
        args = data.draw(decision_args(blockers))
        approvals.record(root, "f", feat, APPROVER, review=review(blockers), **args)


# ---------- FR-003: an edit or a deletion is detected ----------
@SETTINGS
@given(n=st.integers(1, 6), data=st.data())
# verifies[property]: 010/FR-003
def test_fr003_untouched_chain_verifies(n, data):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        fill(root, feat, n, data=data)
        assert approvals.verify(root) == {"ok": True, "count": n, "broken_at": None, "reason": ""}


@SETTINGS
@given(n=st.integers(1, 6), data=st.data())
# verifies[property]: 010/FR-003
def test_fr003_editing_any_field_of_any_entry_is_detected_at_that_entry(n, data):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        fill(root, feat, n, data=data)
        log = approvals.read_log(root)
        i = data.draw(st.integers(0, n - 1))
        field = data.draw(st.sampled_from([k for k in log[i] if k not in ("hash", "prev")]))
        log[i][field] = {"tampered": True}
        (root / ".specreview" / approvals.LOG_FILE).write_text("\n".join(json.dumps(e) for e in log) + "\n", encoding="utf-8")
        v = approvals.verify(root)
        assert not v["ok"] and v["broken_at"] == log[i]["id"]


@SETTINGS
@given(n=st.integers(2, 6), data=st.data())
# verifies[property]: 010/FR-003
def test_fr003_deleting_an_entry_before_the_last_is_detected(n, data):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        fill(root, feat, n, data=data)
        log = approvals.read_log(root)
        del log[data.draw(st.integers(0, n - 2))]
        (root / ".specreview" / approvals.LOG_FILE).write_text("\n".join(json.dumps(e) for e in log) + "\n", encoding="utf-8")
        assert not approvals.verify(root)["ok"]


@pytest.mark.xfail(strict=True, reason="known gap: a bare hash chain cannot see the tail removed; needs an external anchor (head hash or count)")
@SETTINGS
@given(n=st.integers(2, 6), data=st.data())
def test_fr003_dropping_the_last_entries_is_detected(n, data):
    """«A deletion is detected» — including the tail. A bare hash chain cannot do it: this one documents the gap."""
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        fill(root, feat, n, data=data)
        log = approvals.read_log(root)
        keep = data.draw(st.integers(0, n - 1))
        (root / ".specreview" / approvals.LOG_FILE).write_text("\n".join(json.dumps(e) for e in log[:keep]) + ("\n" if keep else ""), encoding="utf-8")
        assert not approvals.verify(root)["ok"]


@SETTINGS
@given(data=st.data())
# verifies[property]: 010/FR-003
def test_fr003_never_appends_to_a_broken_log(data):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        fill(root, feat, 2, data=data)
        log = approvals.read_log(root)
        log[0]["reason"] = "x" + str(log[0]["reason"])
        p = root / ".specreview" / approvals.LOG_FILE
        p.write_text("\n".join(json.dumps(e) for e in log) + "\n", encoding="utf-8")
        before = p.read_text(encoding="utf-8")
        with pytest.raises(approvals.PolicyError) as e:
            approvals.record(root, "f", feat, APPROVER, "approved", review())
        assert e.value.code == "tampered" and p.read_text(encoding="utf-8") == before


@SETTINGS
@given(reason=text.filter(lambda s: s.strip()))
# verifies[property]: 010/FR-001
def test_fr001_any_reason_text_leaves_a_readable_log(reason):
    """Found by this suite: a reason with U+0085 or U+2028 used to make the log unreadable and block every later decision."""
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        approvals.record(root, "f", feat, APPROVER, "rejected", review(), reason=reason)
        approvals.record(root, "f", feat, APPROVER, "approved", review())
        assert approvals.verify(root)["ok"] and approvals.read_log(root)[0]["reason"] == reason.strip()


# ---------- FR-002: stale exactly when a spec file differs from what was decided ----------
@SETTINGS
@given(before=spec_files, after=spec_files)
# verifies[property]: 010/FR-002
def test_fr002_stale_iff_some_file_differs_and_names_exactly_those(before, after):
    tmp, root, feat = workspace(before)
    with tmp:
        approvals.record(root, "f", feat, APPROVER, "approved", review())
        for n in approvals.FILES:
            (feat / n).unlink(missing_ok=True)
        for n, body in after.items():
            (feat / n).write_text(body, encoding="utf-8")
        expected = sorted(n for n in approvals.FILES if before.get(n) != after.get(n))
        st_ = approvals.status(root, "f", feat)
        assert st_.stale == bool(expected) and st_.changed_files == expected


# ---------- FR-005: only an approver decides ----------
@SETTINGS
@given(by=NOT_APPROVER, decision=st.sampled_from(approvals.DECISIONS), reason=text, files=spec_files)
# verifies[property]: 010/FR-005
def test_fr005_a_non_approver_never_writes_to_the_log(by, decision, reason, files):
    tmp, root, feat = workspace(files)
    with tmp:
        with pytest.raises(approvals.PolicyError) as e:
            approvals.record(root, "f", feat, by, decision, review(), reason=reason, conditions=["c"], delegate_to="x")
        assert e.value.code == "forbidden" and approvals.read_log(root) == []


# ---------- FR-004: blockers need an override with a reason, for every kind of approval ----------
@SETTINGS
@given(decision=st.sampled_from(["approved", "approved_with_conditions"]), blockers=st.integers(1, 5),
       reason=text.filter(lambda s: s.strip()))
# verifies[property]: 010/FR-004
def test_fr004_blockers_block_every_approval_without_override(decision, blockers, reason):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        with pytest.raises(approvals.PolicyError) as e:
            approvals.record(root, "f", feat, APPROVER, decision, review(blockers), reason=reason, conditions=["c"])
        assert e.value.code == "blocked" and approvals.read_log(root) == []


# ---------- decisions that need a reason never get through with a blank one ----------
@SETTINGS
@given(decision=st.sampled_from(["approved_with_conditions", "rejected"]),
       blank=st.text(alphabet=" \t\n\r", max_size=6))
def test_a_blank_reason_never_counts_as_a_reason(decision, blank):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        with pytest.raises(approvals.PolicyError):
            approvals.record(root, "f", feat, APPROVER, decision, review(), reason=blank, conditions=["c"])
        assert approvals.read_log(root) == []


# ---------- every refusal carries a stable code and a message a person can read (the API and the CLI branch on the code) ----------
def refused(**kw):
    tmp, root, feat = workspace({"spec.md": "a"})
    with tmp:
        args = dict(by=APPROVER, decision="approved", review=review(), reason="", conditions=None, delegate_to=None, override=False)
        args.update(kw)
        with pytest.raises(approvals.PolicyError) as e:
            approvals.record(root, "f", feat, args.pop("by"), args.pop("decision"), args.pop("review"), **args)
        assert approvals.read_log(root) == []
        return e.value


@SETTINGS
@given(bad=st.text(max_size=20).filter(lambda s: s not in approvals.DECISIONS))
def test_refusal_codes_unknown_decision(bad):
    e = refused(decision=bad)
    assert e.code == "bad_request" and all(d in str(e) for d in approvals.DECISIONS)


@SETTINGS
@given(decision=st.sampled_from(sorted(approvals.NEEDS_REASON)), reason=st.text(alphabet=" \t", max_size=3))
def test_refusal_codes_missing_reason_or_condition_or_delegate(decision, reason):
    e = refused(decision=decision, reason=reason, conditions=["c"], delegate_to="nobody")
    assert e.code == "bad_request" and str(e) not in ("", "bad_request")
    if decision == "approved_with_conditions":
        e = refused(decision=decision, reason="why", conditions=[" ", ""])
        assert e.code == "bad_request" and "condici" in str(e)
    if decision == "delegated":
        e = refused(decision=decision, reason="why", delegate_to="nobody")
        assert e.code == "bad_request" and "approver" in str(e)


@SETTINGS
@given(delegate_to=st.text(min_size=1, max_size=10), decision=st.sampled_from(["approved", "rejected", "approved_with_conditions"]))
def test_refusal_codes_delegate_to_only_with_delegation(delegate_to, decision):
    e = refused(decision=decision, reason="why", conditions=["c"], delegate_to=delegate_to)
    assert e.code == "bad_request" and "delegated" in str(e)


@SETTINGS
@given(by=NOT_APPROVER, blockers=st.integers(0, 3))
def test_refusal_codes_forbidden_names_the_person_and_the_role(by, blockers):
    e = refused(by=by, review=review(blockers))
    assert e.code == "forbidden" and by.name in str(e) and by.role in str(e)


@SETTINGS
@given(blockers=st.integers(1, 4), decision=st.sampled_from(["approved", "approved_with_conditions"]))
def test_override_refusals_say_which_rule_was_broken(blockers, decision):
    e = refused(decision=decision, reason="why", conditions=["c"], review=review(blockers))
    assert e.code == "blocked" and "override" in str(e)
    e = refused(decision="approved", reason="", review=review(blockers), override=True)
    assert e.code == "bad_request" and "motivo" in str(e)


# ---------- what an entry stores: the shape other tools (verify, the CLI, the web demo, Slack) read back ----------
@SETTINGS
@given(steps=st.lists(st.tuples(st.sampled_from(SIMPLE), st.booleans(), st.integers(0, 2), st.sampled_from(["api", "cli", "slack"])), min_size=1, max_size=5))
def test_entries_have_a_stable_shape_and_flag_an_override_only_when_one_was_used(steps):
    tmp, root, feat = workspace({"spec.md": "a", "plan.md": "b"})
    with tmp:
        for i, (decision, override, blockers, via) in enumerate(steps, 1):
            override = override or (blockers > 0 and decision.startswith("approved"))      # without it the approval would be refused (FR-004)
            e = approvals.record(root, "f", feat, APPROVER, decision, review(blockers), reason="because", conditions=["c"],
                                 override=override, via=via)
            assert e["v"] == 1 and e["id"] == f"a_{i:06d}" and e["by"]["via"] == via and e["by"]["role"] == "approver"
            assert e["override"] == (override and decision.startswith("approved") and blockers > 0)
            assert e["spec_hash"] == approvals.spec_hash(approvals.spec_hashes(feat)) and set(e["files"]) == {"spec.md", "plan.md"}
            assert e["open"]["blockers"] == blockers and e["prev"] == ("genesis" if i == 1 else approvals.read_log(root)[i - 2]["hash"])
            assert len(e["hash"]) == 64 and e["at"].endswith("Z") and len(e["at"]) == 20
        assert approvals.verify(root)["count"] == len(steps)
