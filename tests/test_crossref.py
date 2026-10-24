import pytest

from groundtruth import check
from specreview.crossref import coverage_findings, crossref
from specreview.parser import load_feature

SPEC = """# Feature Specification: Demo
## Requirements
### Functional Requirements
- **FR-001**: System MUST export reports as PDF
- **FR-002**: System MUST encrypt stored passwords with bcrypt
- **FR-003**: System MUST send weekly digest emails
"""


def run(make_feature, **kw):
    f = load_feature(make_feature(spec=SPEC, **kw))
    xr = crossref(f)
    return f, xr, coverage_findings(f, xr)


def by_rule(fs, rule):
    return sorted(i for f in fs if f.rule == rule for i in f.ids)


# ---------- ground truth ----------
def test_example_matches_known_truth(example):
    f = load_feature(example)
    missing, forbidden = check(coverage_findings(f, crossref(f)), ["COV"])
    assert not missing, f"no detectados: {missing}"
    assert not forbidden, f"falsos positivos: {forbidden}"


# ---------- requirement -> plan/tasks ----------
def _sev(fs, rid):
    return next(f.severity.label for f in fs if f.rule == "COV001" and f.ids == [rid])


def test_text_only_gap_is_a_warning_not_a_blocker(make_feature):
    """D19: similarity alone must not block; a false blocker costs more trust than a missed one."""
    # verifies 001/FR-004
    _, _, fs = run(make_feature, plan="# P\n## Summary\nExport reports as PDF files.\n",
                   tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n")
    assert by_rule(fs, "COV001") == ["FR-002", "FR-003"]
    assert {_sev(fs, "FR-002"), _sev(fs, "FR-003")} == {"advertencia"}
    assert "similitud de texto" in next(f.message for f in fs if f.rule == "COV001")


def test_gap_is_a_blocker_when_the_team_uses_explicit_traceability(make_feature):
    # verifies 001/FR-003
    _, xr, fs = run(make_feature, plan="# P\n",
                    tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Export reports as PDF (FR-001) in src/pdf.py\n")
    assert xr.traceable and by_rule(fs, "COV001") == ["FR-002", "FR-003"]
    assert {_sev(fs, "FR-002"), _sev(fs, "FR-003")} == {"bloqueante"}


def test_gap_confirmed_by_model_is_a_blocker(make_feature):
    from specreview.parser import load_feature as lf
    f = lf(make_feature(spec=SPEC, plan="# P\n", tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n"))
    class No:
        def complete(self, system, user): return "[]"
    fs = coverage_findings(f, crossref(f, llm=No()))
    assert _sev(fs, "FR-002") == "bloqueante"


def test_explicit_reference_beats_lexical_mismatch(make_feature):
    _, xr, fs = run(make_feature, plan="# P\n",
                    tasks="## Phase 3: User Story 1 - X (Priority: P1)\n"
                          "- [ ] T001 [US1] Hash credentials using adaptive KDF (FR-002) in src/auth.py\n")
    assert [l.evidence for l in xr.for_req("FR-002")] == ["explicit"]
    assert "FR-002" not in by_rule(fs, "COV001")


def test_covered_in_plan_but_no_task_is_warning(make_feature):
    _, _, fs = run(make_feature, plan="# P\n## Summary\nSend weekly digest emails to subscribers.\n",
                   tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n")
    assert "FR-003" in by_rule(fs, "COV004")
    assert "FR-003" not in by_rule(fs, "COV001")


def test_gap_finding_explains_closest_candidate(make_feature):
    # verifies 001/FR-003
    _, _, fs = run(make_feature, plan="# P\n",
                   tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n")
    f = next(f for f in fs if f.rule == "COV001" and f.ids == ["FR-002"])
    assert f.loc.file == "spec.md" and f.loc.line > 0


# ---------- plan/tasks -> requirement ----------
def test_task_introducing_new_concept_is_scope_creep(make_feature):
    # verifies 001/FR-005
    _, _, fs = run(make_feature, plan="# P\n",
                   tasks="## Phase 3: User Story 1 - X (Priority: P1)\n"
                         "- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n"
                         "- [ ] T002 [US1] Add Redis cache layer in src/cache.py\n")
    assert by_rule(fs, "COV002") == ["T002"]


def test_plumbing_task_without_new_concepts_is_not_flagged(make_feature):
    _, _, fs = run(make_feature, plan="# P\n",
                   tasks="## Phase 3: User Story 1 - X (Priority: P1)\n"
                         "- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n"
                         "- [ ] T002 [US1] Add endpoint for reports in src/api.py\n")
    assert by_rule(fs, "COV002") == []


@pytest.mark.parametrize("phase", ["Setup", "Foundational", "Polish"])
def test_shared_phases_are_never_scope_creep(make_feature, phase):
    _, _, fs = run(make_feature, plan="# P\n",
                   tasks=f"## Phase 1: {phase}\n- [ ] T001 Configure kubernetes terraform pipeline\n")
    assert by_rule(fs, "COV002") == []


def test_unknown_explicit_reference_is_reported(make_feature):
    _, _, fs = run(make_feature, plan="# P\n",
                   tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Do thing (FR-099) in src/a.py\n")
    assert by_rule(fs, "COV005") == ["FR-099", "T001"]


def test_plan_item_without_requirement(make_feature):
    # verifies 001/FR-005
    _, _, fs = run(make_feature, plan="# P\n## Summary\nExport reports as PDF. We will also add blockchain anchoring.\n", tasks="")
    assert len(by_rule(fs, "COV003")) == 1


# ---------- degenerate inputs ----------
def test_no_plan_and_no_tasks_is_single_blocker(make_feature):
    f = load_feature(make_feature(spec=SPEC))
    fs = coverage_findings(f, crossref(f))
    assert [x.rule for x in fs] == ["COV000"]


def test_threshold_governs_cosine_but_recall_can_still_link(make_feature):
    f = load_feature(make_feature(spec=SPEC, plan="# P\n",
        tasks="## Phase 3: User Story 1 - X (Priority: P1)\n- [ ] T001 [US1] Export PDF in src/pdf.py\n"))
    strict = crossref(f, threshold=0.99)
    # cosine no longer links, but all of FR-001's weighted terms are in T001 (recall)
    assert [(l.evidence, l.target_id) for l in strict.for_req("FR-001")] == [("lexical", "T001")]
    assert strict.for_req("FR-002") == []


# ---------- three coverage states ----------
TASKS_US1 = "## Phase 3: User Story 1 - X (Priority: P1)\n"


def test_confident_gap_vs_uncertain(make_feature, monkeypatch):
    import specreview.crossref as cr
    f = load_feature(make_feature(spec=SPEC2, plan="# P\n", tasks=TASKS2))
    assert crossref(f).state == {"FR-001": "covered", "FR-002": "gap"}        # nothing spread over other tasks
    monkeypatch.setattr(cr, "GAP_UNION", 0.1)                                 # its terms DO appear across the tasks
    xr = crossref(f)
    assert xr.state["FR-002"] == "uncertain"
    fs = coverage_findings(f, xr)
    uncertain = [x for x in fs if x.rule == "COV006"]
    assert [x.ids for x in uncertain] == [["FR-002"]] and uncertain[0].severity.label == "sugerencia"
    assert not [x for x in fs if x.rule == "COV001"]


# ---------- severity of scope creep depends on how new the words are ----------
def test_creep_severity_depends_on_novelty_cutoff(make_feature, monkeypatch):
    import specreview.crossref as cr
    spec = "# F\n## Requirements\n### Functional Requirements\n- **FR-001**: System MUST export reports as PDF\n"
    tasks = (TASKS_US1 + "- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n"
             "- [ ] T002 [US1] Integrate Salesforce webhook blockchain ledger in src/x.py\n")
    f = load_feature(make_feature(spec=spec, plan="# P\n", tasks=tasks))
    sev = lambda: {x.ids[0]: x.severity.label for x in coverage_findings(f, crossref(f)) if x.rule == "COV002"}  # noqa: E731
    assert sev() == {"T002": "advertencia"}          # almost every word is new to the spec
    monkeypatch.setattr(cr, "CREEP_STRONG", 1.01)    # same evidence, stricter bar => only a hint
    assert sev() == {"T002": "sugerencia"}


# ---------- optional model judge ----------
class Judge:
    """Fake model: says T002 implements FR-002, justifies nothing else, and tries to invent an id."""
    def __init__(self, cover, justify): self.cover, self.justify, self.calls = cover, justify, 0
    def complete(self, system, user):
        self.calls += 1
        return self.cover if "trace" in system else self.justify


SPEC2 = ("# F\n## Requirements\n### Functional Requirements\n"
         "- **FR-001**: System MUST export reports as PDF\n"
         "- **FR-002**: System MUST notify the account owner by SMS after every refund\n")
TASKS2 = TASKS_US1 + "- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n- [ ] T002 [US1] Issue refund endpoint in src/refund.py\n"


def test_llm_resolves_a_non_covered_requirement(make_feature):
    f = load_feature(make_feature(spec=SPEC2, plan="# P\n", tasks=TASKS2))
    xr = crossref(f, llm=Judge('["T002"]', '["FR-002"]'))
    assert xr.state["FR-002"] == "covered" and [l.evidence for l in xr.for_req("FR-002")] == ["llm"]


def test_llm_can_confirm_a_gap(make_feature):
    f = load_feature(make_feature(spec=SPEC2, plan="# P\n", tasks=TASKS2))
    xr = crossref(f, llm=Judge("[]", '["FR-002"]'))
    assert xr.state["FR-002"] == "gap"
    assert any(x.rule == "COV001" and x.ids == ["FR-002"] for x in coverage_findings(f, xr))


def test_llm_invented_ids_are_ignored(make_feature):
    f = load_feature(make_feature(spec=SPEC2, plan="# P\n", tasks=TASKS2))
    xr = crossref(f, llm=Judge('["T999", "FR-777"]', "[]"))
    assert xr.for_req("FR-002") == [] and xr.state["FR-002"] == "gap"


def test_llm_clears_scope_creep_when_it_finds_a_requirement(make_feature):
    spec = "# F\n## Requirements\n### Functional Requirements\n- **FR-001**: System MUST export reports as PDF\n"
    tasks = TASKS_US1 + "- [ ] T001 [US1] Export reports as PDF in src/pdf.py\n- [ ] T002 [US1] Integrate Salesforce webhook in src/x.py\n"
    f = load_feature(make_feature(spec=spec, plan="# P\n", tasks=tasks))
    assert "T002" in crossref(f).unmapped_tasks
    assert "T002" not in crossref(f, llm=Judge("[]", '["FR-001"]')).unmapped_tasks


def test_llm_call_budget_is_respected(make_feature):
    f = load_feature(make_feature(spec=SPEC2, plan="# P\n", tasks=TASKS2))
    j = Judge("[]", "[]")
    crossref(f, llm=j, max_llm_calls=1)
    assert j.calls == 1


def test_without_llm_nothing_is_called(make_feature):
    f = load_feature(make_feature(spec=SPEC2, plan="# P\n", tasks=TASKS2))
    assert crossref(f).llm_calls == 0


# ---------- found by dogfooding: a spec with no plan/tasks ----------
def test_no_plan_no_tasks_reports_unknown_coverage_not_100_percent(make_feature):
    from specreview.report import build_report
    f = load_feature(make_feature(spec=SPEC))
    rep = build_report(f, coverage_findings(f, crossref(f)))
    assert rep.metrics["requirements_with_plan_or_tasks_pct"] is None
    assert "cobertura" not in __import__("specreview.report", fromlist=["x"]).render_text(rep)


def test_cov000_points_at_the_spec_file(make_feature):
    f = load_feature(make_feature(spec=SPEC))
    (x,) = coverage_findings(f, crossref(f))
    assert x.loc.file == "spec.md"
