"""Properties of three small modules whose rules are invariants: waivers and baselines (spec 006), member tokens, model choice.

Same idea as `test_approvals_properties.py`: the claim is «for every input», sampled with Hypothesis. A `verifies`
comment above a test ties it to the requirement it checks (`specreview verification`, docs/37-verified-intent.md).
"""
import string
import tempfile
from datetime import date, timedelta
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st

from specreview import members, suppress
from specreview.findings import Finding, Severity
from specreview.model import Loc
from specreview.models import CATALOG, EFFORTS, ChoiceError, choose
from specreview.report import Report

SETTINGS = settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
word = st.text(alphabet=st.characters(blacklist_categories=("Cs",)), min_size=1, max_size=12)
ident = st.text(alphabet=string.ascii_letters + string.digits + "-_./", min_size=1, max_size=12)   # what ids, files and features look like
RULES = ["COV001", "QUA001", "CON001", "PRD001"]


@st.composite
def findings(draw):
    return Finding(draw(st.sampled_from(RULES)), draw(st.sampled_from(list(Severity))), draw(st.lists(ident, min_size=1, max_size=3, unique=True)),
                   Loc(draw(ident), draw(st.integers(0, 999))), "m")


def report(fs, feature="001-x"):
    return Report(feature, "p", list(fs))


def cfg(disabled=()):
    return suppress.Config(disable_rules=set(disabled))


# ---------- spec 006 · FR-005: a finding is identified by feature, rule, ids and file — never by its line ----------
# verifies[property]: 006/FR-005
@SETTINGS
@given(f=findings(), feature=ident, line=st.integers(0, 9999))
def test_fingerprint_ignores_the_line_and_the_order_of_ids(f, feature, line):
    moved = Finding(f.rule, f.severity, list(reversed(f.ids)), Loc(f.loc.file, line), "another message")
    assert suppress.fingerprint(feature, f) == suppress.fingerprint(feature, moved)


# verifies[property]: 006/FR-005
@SETTINGS
@given(a=findings(), b=findings(), fa=ident, fb=ident)
def test_fingerprint_tells_findings_apart(a, b, fa, fb):
    same = (fa, a.rule, sorted(a.ids), a.loc.file) == (fb, b.rule, sorted(b.ids), b.loc.file)
    assert (suppress.fingerprint(fa, a) == suppress.fingerprint(fb, b)) == same


@pytest.mark.xfail(strict=True, reason="known gap: the key joins fields with «|» and «,» without escaping, so ids [\"a,b\"] and [\"a\",\"b\"] collide. "
                   "Real ids never contain them; fixing it changes every fingerprint and so every stored baseline and waiver")
def test_fingerprint_fields_cannot_run_into_each_other():
    a = Finding("COV001", Severity.BLOCKER, ["a,b"], Loc("f.md", 1), "m")
    b = Finding("COV001", Severity.BLOCKER, ["a", "b"], Loc("f.md", 1), "m")
    assert suppress.fingerprint("x", a) != suppress.fingerprint("x", b)


# ---------- spec 006 · FR-004: after recording the baseline, none of those findings is reported again ----------
# verifies[property]: 006/FR-004
@SETTINGS
@given(fs=st.lists(findings(), max_size=8), extra=findings())
def test_a_recorded_baseline_silences_exactly_what_it_recorded(fs, extra):
    fresh = Finding("CON001", Severity.BLOCKER, ["ZZ-999"], Loc("never-recorded.md", 1), "new")
    with tempfile.TemporaryDirectory() as t:
        root = Path(t)
        suppress.write_baseline(root, [report(fs)])
        out = suppress.apply(report([*fs, fresh]), cfg(), suppress.load_baseline(root), {})
        assert out.findings == [fresh]


# ---------- spec 006 · FR-006 / FR-007: a waiver needs a reason and stops working after its expiry date ----------
# verifies[property]: 006/FR-006
@SETTINGS
@given(blank=st.text(alphabet=" \t\n\r", max_size=5))
def test_a_waiver_without_a_reason_is_refused_and_nothing_is_written(blank):
    with tempfile.TemporaryDirectory() as t:
        with pytest.raises(ValueError):
            suppress.add_waiver(Path(t), "abc", blank, "ana")
        assert suppress.load_waivers(Path(t)) == {}


# verifies[property]: 006/FR-006
@SETTINGS
@given(reason=word.filter(lambda s: s.strip()), author=word, day=st.dates())
def test_a_waiver_stores_its_reason_author_and_date(reason, author, day):
    with tempfile.TemporaryDirectory() as t:
        suppress.add_waiver(Path(t), "fp", reason, author, today=day)
        w = suppress.load_waivers(Path(t))["fp"]
        assert (w["reason"], w["author"], w["date"]) == (reason.strip(), author, day.isoformat())


# verifies[property]: 006/FR-007
@SETTINGS
@given(f=findings(), today=st.dates(min_value=date(2000, 1, 1), max_value=date(2100, 1, 1)), delta=st.integers(-400, 400))
def test_a_waiver_works_through_its_expiry_day_and_not_after(f, today, delta):
    expires = (today + timedelta(days=delta)).isoformat()
    waivers = {suppress.fingerprint("001-x", f): {"expires": expires}}
    out = suppress.apply(report([f]), cfg(), {}, waivers, today=today)
    assert (out.findings == []) == (delta >= 0)


# the partition: what is dropped plus what is kept is everything, and a disabled rule never survives
# verifies[property]: 006/FR-004, FR-006, FR-007
@SETTINGS
@given(fs=st.lists(findings(), max_size=10), off=st.sets(st.sampled_from(RULES)), data=st.data())
def test_suppression_neither_loses_nor_invents_findings(fs, off, data):
    baseline = {suppress.fingerprint("001-x", f): {} for f in fs if data.draw(st.booleans())}
    waivers = {suppress.fingerprint("001-x", f): {} for f in fs if data.draw(st.booleans())}
    out = suppress.apply(report(fs), cfg(off), baseline, waivers)
    assert len(out.findings) + sum(out.suppressed.values()) == len(fs)
    assert all(f in fs and f.rule not in off for f in out.findings)


# ---------- member tokens: only the hash is stored; a token identifies one live member ----------
@SETTINGS
@given(names=st.lists(word.filter(lambda n: n.strip()), min_size=1, max_size=4, unique=True), other=st.text(max_size=60))
def test_tokens_are_stored_only_as_hashes_and_identify_their_owner(names, other):
    with tempfile.TemporaryDirectory() as t:
        root = Path(t)
        issued = {n: members.add_member(root, n, "approver", f"{i}@x.com") for i, n in enumerate(names)}
        raw = (root / ".specreview" / "members.json").read_text(encoding="utf-8")
        for m, token in issued.values():
            assert token not in raw and members.authenticate(root, token).id == m.id
        if other not in {tok for _, tok in issued.values()}:
            assert members.authenticate(root, other) is None
        first, tok = next(iter(issued.values()))
        members.revoke_member(root, first.id)
        assert members.authenticate(root, tok) is None


@SETTINGS
@given(role=st.text(max_size=12).filter(lambda r: r not in members.ROLES))
def test_an_unknown_role_never_creates_a_member(role):
    with tempfile.TemporaryDirectory() as t, pytest.raises(ValueError):
        members.add_member(Path(t), "Ana", role)


# ---------- the composer can only select what the operator turned on ----------
@SETTINGS
@given(allowed=st.sets(st.sampled_from(list(CATALOG))).map(tuple), default=st.sampled_from([None, *CATALOG, "custom"]),
       model=st.one_of(st.none(), st.sampled_from([*CATALOG, "claude-opus-9", ""])), effort=st.one_of(st.none(), st.sampled_from([*EFFORTS, "max", ""])))
def test_a_choice_is_never_a_model_the_operator_did_not_offer(allowed, default, model, effort):
    try:
        c = choose(allowed, default, model, effort)
    except ChoiceError:
        return
    if c is not None:
        assert c.model in set(allowed) | ({default} if default else set())
        assert effort is None or effort in EFFORTS
