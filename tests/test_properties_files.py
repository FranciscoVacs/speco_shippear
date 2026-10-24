"""The files a team commits and reviews in a pull request — the baseline and the waivers — keep a stable, diffable shape (spec 006).

An exception that changes the bytes of the file for no reason, or a reason that comes back as `\\u00e9`, is noise in every review.
"""
import json
import tempfile
from datetime import date
from pathlib import Path

from hypothesis import HealthCheck, given, settings, strategies as st

from specreview import suppress
from specreview.findings import Finding, Severity
from specreview.model import Loc
from specreview.report import Report

SETTINGS = settings(max_examples=50, deadline=None, suppress_health_check=[HealthCheck.too_slow])
ident = st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_./", min_size=1, max_size=10)
free = st.text(alphabet=st.characters(blacklist_categories=("Cs", "Cc")), min_size=1, max_size=20).filter(lambda s: s.strip())


@st.composite
def finding(draw):
    return Finding(draw(st.sampled_from(["COV001", "QUA001", "CON001"])), Severity.WARNING, draw(st.lists(ident, min_size=1, max_size=3, unique=True)),
                   Loc(draw(ident), draw(st.integers(0, 99))), "m")


def reports(fs, feature="001-x"):
    return [Report(feature, "p", list(fs))]


# verifies[property]: 006/FR-004
@SETTINGS
@given(fs=st.lists(finding(), max_size=8), seed=st.randoms())
def test_the_baseline_file_is_the_same_bytes_whatever_the_order_findings_arrive_in(fs, seed):
    shuffled = list(fs)
    seed.shuffle(shuffled)
    with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
        suppress.write_baseline(Path(a), reports(fs))
        suppress.write_baseline(Path(b), reports(shuffled))
        raw = (Path(a) / ".specreview" / "baseline.json").read_bytes()
        assert raw == (Path(b) / ".specreview" / "baseline.json").read_bytes() and raw.endswith(b"\n")


# verifies[property]: 006/FR-004
@SETTINGS
@given(fs=st.lists(finding(), min_size=1, max_size=6))
def test_the_baseline_file_has_a_documented_shape_and_one_entry_per_finding(fs):
    with tempfile.TemporaryDirectory() as t:
        path, n = suppress.write_baseline(Path(t), reports(fs))
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        assert n == len(fs) == len(data["findings"]) and data["version"] == 1 and raw.count("\n") > len(fs)     # indented: one field per line, diffable
        for e, f in zip(sorted(data["findings"], key=lambda e: e["fingerprint"]), sorted(fs, key=lambda f: suppress.fingerprint("001-x", f))):
            assert set(e) == {"fingerprint", "feature", "rule", "ids", "file"} and e["ids"] == sorted(f.ids) and e["file"] == f.loc.file
        assert suppress.write_baseline(Path(t), reports(fs))[1] == n          # writing again over the same folder is fine


# verifies[property]: 006/FR-006
@SETTINGS
@given(entries=st.lists(st.tuples(ident, free, free), min_size=1, max_size=6, unique_by=lambda e: e[0]), seed=st.randoms())
def test_waivers_are_kept_sorted_keep_each_other_and_store_text_as_written(entries, seed):
    order = list(entries)
    seed.shuffle(order)
    with tempfile.TemporaryDirectory() as t:
        root = Path(t)
        for fp, reason, author in order:
            suppress.add_waiver(root, fp, reason, author, today=date(2026, 10, 24), expires="2027-01-01")
        raw = (root / ".specreview" / "waivers.json").read_text(encoding="utf-8")
        data = json.loads(raw)
        assert data["version"] == 1 and [w["fingerprint"] for w in data["waivers"]] == sorted(fp for fp, _, _ in entries)
        assert raw.endswith("\n") and "\\u" not in raw and raw.count("\n") > len(entries)
        by = {w["fingerprint"]: w for w in data["waivers"]}
        for fp, reason, author in entries:
            assert (by[fp]["reason"], by[fp]["author"], by[fp]["expires"]) == (reason.strip(), author, "2027-01-01")
