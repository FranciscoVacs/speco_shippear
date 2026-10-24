import pytest

from groundtruth import check
from specreview import ears
from specreview.analyzers import run_all
from specreview.contradictions import check_contradictions, quantities
from specreview.llm import llm_contradictions
from specreview.parser import load_feature
from specreview.quality import check_acceptance, check_requirements


def feat(make_feature, reqs, stories=""):
    body = "# Feature Specification: X\n" + stories + "## Requirements\n### Functional Requirements\n" + \
           "\n".join(f"- **FR-{i:03d}**: {t}" for i, t in enumerate(reqs, 1)) + "\n"
    return load_feature(make_feature(spec=body))


def rules(fs, rule):
    return sorted(i for f in fs if f.rule == rule for i in f.ids)


# ---------- EARS ----------
@pytest.mark.parametrize("text,pattern", [
    ("System MUST log every login", "ubiquitous"),
    ("The system shall hash passwords", "ubiquitous"),
    ("When a user logs in, the system MUST record the time", "event"),
    ("While the account is locked, the system MUST reject logins", "state"),
    ("If the card is declined, then the system MUST show an error", "unwanted"),
    ("Where two-factor is enabled, the system MUST ask for a code", "optional"),
    ("While offline, when the user saves, the system MUST queue the change", "complex"),
    ("Cuando el usuario inicia sesión, el sistema debe registrar la hora", "event"),
    ("Users should probably export data", "none"),
    ("Fast exports", "none"),
])
def test_ears_classification(text, pattern):
    assert ears.classify(text) == pattern


def test_normative_levels():
    assert ears.normative("System MUST x") == "strong"
    assert ears.normative("System should x") == "weak"
    assert ears.normative("Export is available") == "none"


# ---------- ambiguity / testability ----------
def test_quality_attribute_without_metric_is_untestable(make_feature):
    # verifies 001/FR-006
    fs = check_requirements(feat(make_feature, ["System MUST be fast", "System MUST respond fast, within 200 ms"]))
    assert rules(fs, "QUA002") == ["FR-001"]


def test_vague_wording_is_ambiguous(make_feature):
    fs = check_requirements(feat(make_feature, ["System MUST handle errors appropriately", "System MUST reject empty names"]))
    assert rules(fs, "QUA001") == ["FR-001"]


def test_spanish_terms(make_feature):
    # verifies 001/FR-006
    fs = check_requirements(feat(make_feature, ["El sistema debe ser rápido y escalable"]))
    assert rules(fs, "QUA002") == ["FR-001"]


def test_weak_modal_and_missing_modal(make_feature):
    fs = check_requirements(feat(make_feature, ["System should export CSV", "Export is available as CSV", "System MUST export CSV"]))
    assert rules(fs, "QUA002") == ["FR-001", "FR-002"]


def test_open_clarification_is_blocker(make_feature):
    fs = check_requirements(feat(make_feature, ["System MUST retain data for [NEEDS CLARIFICATION: how long?]"]))
    f = next(f for f in fs if f.rule == "QUA004")
    assert f.severity.label == "bloqueante" and "how long?" in f.message


def test_actor_centric_form_suggests_ears(make_feature):
    fs = check_requirements(feat(make_feature, ["Users MUST be able to reset their password"]))
    f = next(f for f in fs if f.rule == "QUA003")
    assert f.severity.label == "sugerencia" and "System MUST allow" in f.fix


def test_well_formed_requirement_has_no_findings(make_feature):
    fs = check_requirements(feat(make_feature, ["When an order is placed, the system MUST email a receipt within 30 seconds"]))
    assert fs == []


def test_multiple_musts_suggest_split(make_feature):
    fs = check_requirements(feat(make_feature, ["System MUST save drafts and MUST sync them"]))
    assert rules(fs, "QUA007") == ["FR-001"]


# ---------- acceptance criteria ----------
STORY = """### User Story 1 - Reset password (Priority: P1)
A user resets their password by email.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they request a reset, **Then** a reset email is sent

"""


def test_requirement_without_acceptance_criterion(make_feature):
    f = feat(make_feature, ["System MUST send a password reset email", "System MUST export audit logs as CSV"], STORY)
    assert rules(check_acceptance(f), "QUA006") == ["FR-002"]


def test_story_without_scenarios(make_feature):
    # verifies 001/FR-008
    f = feat(make_feature, ["System MUST x"], "### User Story 2 - Empty (Priority: P2)\nDesc\n\n")
    assert rules(check_acceptance(f), "QUA005") == ["US2"]


def test_story_without_scenarios_does_not_absolve_requirements(make_feature):
    f = feat(make_feature, ["System MUST export audit logs as CSV"],
             "### User Story 2 - Export audit logs (Priority: P2)\nAdmin exports audit logs as CSV\n\n")
    assert rules(check_acceptance(f), "QUA006") == ["FR-001"]


def test_incomplete_scenario(make_feature):
    f = feat(make_feature, ["System MUST x"], "### User Story 1 - A (Priority: P1)\nT\n\n**Acceptance Scenarios**:\n\n1. **Given** a user, **When** they act\n")
    assert rules(check_acceptance(f), "QUA008") == ["US1.1"]


def test_ac_severity_depends_on_how_unrelated_the_nearest_criterion_is(make_feature, example):
    # clearly nothing resembles it -> warning
    f = feat(make_feature, ["System MUST export audit logs as CSV"], STORY)
    assert [x.severity.label for x in check_acceptance(f)] == ["advertencia"]
    # Planted fixture gaps: three are clearly unrelated; FR-005/FR-008 share words with other stories (0.16/0.23),
    # indistinguishable by text similarity from borderline cases in real repos, so they are only a hint (not dropped).
    sev = {x.ids[0]: x.severity.label for x in check_acceptance(load_feature(example)) if x.rule == "QUA006"}
    assert sev == {"FR-005": "sugerencia", "FR-006": "advertencia", "FR-008": "sugerencia",
                   "FR-009": "advertencia", "FR-010": "advertencia"}


# ---------- contradictions ----------
def test_quantities_normalize_units():
    assert quantities("within 2 minutes")[0][:2] == ("t", 120.0)


def test_numeric_contradiction(make_feature):
    # verifies 001/FR-007
    fs = check_contradictions(feat(make_feature, ["System MUST lock accounts after 3 failed logins", "System MUST lock accounts after 5 failed logins"]))
    assert rules(fs, "CON001") == ["FR-001", "FR-002"]


def test_same_value_in_different_units_is_not_contradiction(make_feature):
    fs = check_contradictions(feat(make_feature, ["System MUST expire sessions after 60 minutes", "System MUST expire sessions after 1 hours"]))
    assert fs == []


def test_unrelated_numbers_are_not_contradictions(make_feature):
    fs = check_contradictions(feat(make_feature, ["System MUST expire invitations after 7 days", "System MUST send email receipts within 30 seconds"]))
    assert fs == []


def test_polarity_contradiction(make_feature):
    fs = check_contradictions(feat(make_feature, ["System MUST store user passwords in the database", "System MUST NOT store user passwords in the database"]))
    assert rules(fs, "CON001") == ["FR-001", "FR-002"]


class FakeLLM:
    def __init__(self, reply): self.reply, self.calls = reply, []
    def complete(self, system, user):
        self.calls.append(user)
        return self.reply


def test_llm_findings_are_labeled_as_model_judgement(make_feature):
    f = feat(make_feature, ["System MUST work offline", "System MUST require a live connection for every action"])
    llm = FakeLLM('Sure: [{"a": "FR-001", "b": "FR-002", "why": "offline vs always-online"}]')
    fs = check_contradictions(f, llm)
    assert [(x.rule, x.severity.label) for x in fs] == [("CON002", "advertencia")]
    assert "FR-001: System MUST work offline" in llm.calls[0]


def test_llm_garbage_output_is_ignored():
    assert llm_contradictions([], FakeLLM("no json here")) == []
    assert llm_contradictions([], FakeLLM("[not json]")) == []


# ---------- ground truth over everything ----------
def test_example_matches_known_truth(example):
    # verifies 001/SC-001
    missing, forbidden = check(run_all(load_feature(example)), ["COV", "QUA", "CON"])
    assert not missing, f"no detectados: {missing}"
    assert not forbidden, f"falsos positivos: {forbidden}"


def test_citing_the_requirement_id_in_a_scenario_counts_as_acceptance_criterion(make_feature):
    story = ("### User Story 1 - A (Priority: P1)\nT\n\n**Acceptance Scenarios**:\n\n"
             "1. **Given** a thing, **When** it happens, **Then** something unrelated occurs (FR-002)\n\n")
    f = feat(make_feature, ["System MUST do alpha", "System MUST do omega"], story)
    assert rules(check_acceptance(f), "QUA006") == ["FR-001"]            # FR-002 is cited, FR-001 is not


def test_id_citation_matches_whole_ids_only(make_feature):
    story = ("### User Story 1 - A (Priority: P1)\nT\n\n**Acceptance Scenarios**:\n\n"
             "1. **Given** a thing, **When** it happens, **Then** something unrelated occurs (FR-0010)\n\n")
    f = feat(make_feature, ["System MUST do alpha"], story)
    assert rules(check_acceptance(f), "QUA006") == ["FR-001"]            # FR-0010 must not satisfy FR-001
