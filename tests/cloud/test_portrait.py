"""Spec 014 · initial portrait: inventory, rule proposals with verifiable evidence, consent, and what the service may not do.
A model is a fake that answers with a canned JSON (including lies); the schema and the worker are real."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

import httpx  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

from speco_cloud import worker  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402
from speco_cloud.portrait.candidates import Candidate, Evidence, snippet_hash, statement_key, verify  # noqa: E402
from speco_cloud.portrait.extractors import MAX_CODE_FILES, ModelExtractor, SpecExtractor, categorize, select_code_files  # noqa: E402
from speco_cloud.portrait.inventory import build_inventory, kind_of  # noqa: E402

P1, P2 = "30000000-0000-0000-0000-000000000001", "30000000-0000-0000-0000-000000000002"

SPEC_IMPLEMENTED = """# Feature Specification: Invitations

**Status**: Implemented

## Requirements

- **FR-001**: When a member is invited, the system MUST email the invitee within 60 seconds
- **FR-002**: The system MUST allow only owners and admins to invite members
- **FR-003**: The system MUST refund the full amount if an annual plan is cancelled within 14 days
- **NFR-001**: The system MUST keep every invitation for 90 days
"""
SPEC_DRAFT = SPEC_IMPLEMENTED.replace("Implemented", "In progress").replace("invitee within", "customer within")
BILLING = "def refund(plan, days):\n    if plan.annual and days <= 14:\n        return plan.price\n    return 0\n"
INVITES = "MAX_SEATS = {'hobby': 3, 'pro': 20}\n\ndef can_invite(user):\n    return user.role in ('owner', 'admin')\n"


# ------------------------------------------------------------------ pure pieces
def test_inventory_counts_files_by_kind_from_names_only():
    # verifies 014/FR-001
    tree = [{"path": p, "type": "blob", "size": 1} for p in (
        "specs/001-a/spec.md", "product/goals.md", "README.md", "docs/guide.md", "openapi.yaml", "api/schema.graphql", "tests/test_a.py", "src/a.test.ts",
        "db/migrations/001.sql", "pyproject.toml", ".github/workflows/ci.yml", "src/billing.py", "assets/logo.png", "node_modules/x/index.js", "vendor/y.go")]
    inv = build_inventory(tree)
    assert inv["counts"] == {"specs": 2, "docs": 2, "api": 2, "tests": 2, "database": 1, "config": 2, "code": 1, "other": 1}
    assert inv["total_files"] == 13 and kind_of("src/Billing.PY") == "code"


def test_only_implemented_specs_become_proposals_with_their_line_as_evidence():
    # verifies 014/FR-002
    files = {"specs/001-inv/spec.md": SPEC_IMPLEMENTED, "specs/002-draft/spec.md": SPEC_DRAFT}
    got = SpecExtractor().extract(files)
    assert [c.evidence[0].path for c in got] == ["specs/001-inv/spec.md"] * 4                       # the draft contributes nothing
    by = {c.evidence[0].start_line: c for c in got}
    assert by[7].statement == "When a member is invited: email the invitee within 60 seconds"
    assert (by[7].category, by[7].risk) == ("notifications", "low") and by[9].category == "money" and by[9].risk == "high"
    assert by[8].category == "permissions" and by[10].category == "data"
    assert all(verify(c, files) for c in got)


def test_categories():
    assert categorize("Refund the annual plan") == "money" and categorize("Only admins may do it") == "permissions" and categorize("Plain sentence") == "other"


def test_evidence_must_be_found_verbatim_at_those_lines():
    # verifies 014/FR-005
    files = {"a.py": BILLING}
    ok = Candidate("Annual plans are refunded in full within 14 days", "money", "high", "code", "medium", [Evidence("a.py", 2, 3, "if plan.annual and days <= 14:")])
    assert verify(ok, files) is ok
    for bad in (Evidence("a.py", 2, 3, "if plan.monthly and days <= 30:"),        # invented quote
                Evidence("a.py", 20, 21, "if plan.annual and days <= 14:"),         # lines do not exist
                Evidence("missing.py", 1, 1, "def refund(plan, days):"),            # file not in the repository
                Evidence("a.py", 1, 200, "def refund(plan, days):"),                # absurd range
                Evidence("a.py", 1, 1, "def")):                                     # too short to prove anything
        c = Candidate("Some rule about refunds", "money", "high", "code", "medium", [bad])
        assert verify(c, files) is None


def test_code_confidence_is_capped_and_unknown_categories_fall_back():
    c = Candidate("Annual plans are refunded in full within 14 days", "weird", "high", "code", "high", [Evidence("a.py", 2, 2, "if plan.annual and days <= 14:")])
    v = verify(c, {"a.py": BILLING})
    assert v.confidence == "medium" and v.category == "other"


def test_the_model_answer_is_parsed_defensively():
    ex = ModelExtractor(None)
    good = {"statement": "Only owners and admins can invite", "category": "permissions", "risk": "high", "confidence": "high",
            "evidence": [{"path": "i.py", "start_line": 3, "end_line": 4, "quote": "return user.role in ('owner', 'admin')"}]}
    raw = "Sure! Here you go:\n```json\n" + json.dumps([good, {"statement": "no evidence"}, "junk", {"statement": "x", "evidence": [{"path": 1}]}]) + "\n```"
    [c] = ex.parse(raw)
    assert c.origin == "code" and c.confidence == "low"                                            # "high" from a model is not accepted as is
    assert ex.parse("not json at all") == [] and ex.parse("[1, 2") == []


def test_code_file_selection_is_budgeted_and_skips_tests_and_vendor():
    tree = [{"path": p, "type": "blob", "size": 1000} for p in (
        "src/billing.py", "src/permissions.py", "src/utils.py", "tests/test_billing.py", "src/billing.test.ts", "vendor/billing/x.go", "node_modules/p/payment.js", "src/notify_email.py")]
    tree.append({"path": "src/huge_billing.py", "type": "blob", "size": 10_000_000})
    assert select_code_files(tree) == ["src/billing.py", "src/notify_email.py", "src/permissions.py"]
    many = [{"path": f"src/billing_{i}.py", "type": "blob", "size": 100} for i in range(100)]
    assert len(select_code_files(many)) == MAX_CODE_FILES


# ------------------------------------------------------------------ end to end
class FakeRepo:
    def __init__(self):
        self.files = {"specs/001-inv/spec.md": SPEC_IMPLEMENTED, "src/billing.py": BILLING, "src/invites.py": INVITES, "README.md": "# hi"}
        self.requests: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(req.url.path)
        path = req.url.path
        if path.endswith("/access_tokens"):
            return httpx.Response(201, json={"token": "t"})
        if "/commits/" in path:
            return httpx.Response(200, json={"sha": "head-1"})
        if "/git/trees/" in path:
            return httpx.Response(200, json={"tree": [{"path": p, "type": "blob", "size": len(t)} for p, t in self.files.items()]})
        if "/contents/" in path:
            rel = path.split("/contents/", 1)[1]
            return httpx.Response(200, text=self.files[rel]) if rel in self.files else httpx.Response(404)
        return httpx.Response(404)


class FakeModel:
    """Answers with one true rule, one invented quote and one made-up file."""

    def __init__(self):
        self.calls = 0
        self.seen: list[str] = []

    def complete(self, system: str, user: str) -> str:
        self.calls += 1
        self.seen.append(user)
        return json.dumps([
            {"statement": "Seats are capped per plan: 3 on Hobby and 20 on Pro", "category": "limits", "risk": "medium", "confidence": "medium",
             "evidence": [{"path": "src/invites.py", "start_line": 1, "end_line": 1, "quote": "MAX_SEATS = {'hobby': 3, 'pro': 20}"}]},
            {"statement": "Refunds are paid within one hour", "category": "money", "risk": "high", "confidence": "medium",
             "evidence": [{"path": "src/billing.py", "start_line": 2, "end_line": 3, "quote": "refund within 1 hour"}]},
            {"statement": "Admins can delete the whole company", "category": "permissions", "risk": "high", "confidence": "low",
             "evidence": [{"path": "src/admin.py", "start_line": 1, "end_line": 1, "quote": "def delete_company(user):"}]},
        ])


@pytest.fixture(scope="module")
def env(pg):
    pg.psql(f"insert into auth.users (id, email) values ('{P1}', 'p1@example.com'), ('{P2}', 'p2@example.com');")
    org = pg.rows("select public.create_organization('Portrait Co', 'portrait-co');", P1)[0]
    inst = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '7500', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '901', 'acme/shop') returning id;", "service")[0]
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", github_app_id="42", github_private_key=pem)
    fake = FakeRepo()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    return type("Env", (), {"pg": pg, "settings": settings, "gh": gh, "fake": fake, "org": org, "repo": repo, "model": FakeModel()})


def queue(env, kind: str, sha: str | None = None):
    payload = json.dumps({"sha": sha} if sha else {})
    env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, payload) values ('{env.org}', '{env.repo}', '{kind}', '{payload}');", "service")


def rules(env) -> list[str]:
    return env.pg.rows(f"select code, origin, status, category from public.business_rules where org_id = '{env.org}' order by seq;")


def test_the_first_sync_reads_the_branch_head_and_stores_the_inventory(env):
    # verifies 014/FR-001
    queue(env, "sync_repo")                                          # no sha in the job: a repository that was just connected
    out = worker.run_once(env.settings, env.gh)
    assert out["inventory"] == 4 and out["drift"] == 0
    assert env.pg.rows(f"select commit_sha, total_files, counts->>'specs', counts->>'code' from public.repo_inventory where repo_id = '{env.repo}';") == ["head-1|4|1|2"]
    assert env.pg.rows(f"select last_sha from public.repositories where id = '{env.repo}';") == ["head-1"]


def test_without_consent_only_implemented_specs_are_proposed_and_no_code_goes_to_a_model(env):
    # verifies 014/FR-002, FR-004
    queue(env, "portrait")
    out = worker.run_once(env.settings, env.gh, env.model)
    assert out["proposed"] == 4 and out["code_analysis"] == "no consent" and env.model.calls == 0
    assert rules(env) == ["BR-001|spec|proposed|notifications", "BR-002|spec|proposed|permissions", "BR-003|spec|proposed|money", "BR-004|spec|proposed|data"]
    assert env.pg.rows(f"select count(*) from public.rule_evidence e join public.business_rules r on r.id = e.rule_id where r.org_id = '{env.org}';") == ["4"]
    first = env.pg.rows(f"select path, start_line, snippet_hash from public.rule_evidence order by start_line limit 1;")[0].split("|")
    assert first == ["specs/001-inv/spec.md", "7", snippet_hash(SPEC_IMPLEMENTED, 7, 7)]


def test_running_again_creates_no_duplicates(env):
    # verifies 014/FR-012
    queue(env, "portrait")
    out = worker.run_once(env.settings, env.gh, env.model)
    assert out["proposed"] == 0 and len(rules(env)) == 4


def test_with_consent_the_model_proposes_code_rules_and_its_lies_are_discarded(env):
    # verifies 014/FR-003, FR-005, SC-001
    env.pg.psql(f"select public.set_code_consent('{env.repo}', true);", P1)
    queue(env, "portrait")
    out = worker.run_once(env.settings, env.gh, env.model)
    assert out["code_analysis"] == "on" and out["proposed"] == 1 and out["discarded"] == 2             # the invented quote and the made-up file
    assert rules(env)[-1] == "BR-005|code|proposed|limits"
    sent = "\n".join(env.model.seen)
    assert "src/billing.py" in sent and "src/invites.py" in sent and "README.md" not in sent and "def refund" in sent
    assert env.pg.rows(f"select confidence from public.business_rules where code = 'BR-005';") == ["medium"]


def test_consent_is_only_for_owners_and_admins_and_can_be_withdrawn(env):
    # verifies 014/FR-004
    assert "only owners and admins" in env.pg.fails(f"select public.set_code_consent('{env.repo}', false);", P2)
    env.pg.psql(f"select public.set_code_consent('{env.repo}', false);", P1)
    assert env.pg.rows(f"select code_consent_at is null, code_consent_by is null from public.repositories where id = '{env.repo}';") == ["t|t"]
    env.model.calls = 0
    queue(env, "portrait")
    assert worker.run_once(env.settings, env.gh, env.model)["code_analysis"] == "no consent" and env.model.calls == 0


def test_the_service_can_propose_but_never_decide(env):
    # verifies 014/FR-006
    sql = f"insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha, status, decided_by) values ('{env.org}', '{env.repo}', 'A sneaky confirmed rule', 'k1', 'money', 'high', 'spec', 'high', 'x', 's', 'confirmed', '{P1}');"
    assert "permission denied" in env.pg.fails(sql, "service")
    assert "permission denied" in env.pg.fails("update public.business_rules set status = 'confirmed';", "service")
    assert "permission denied" in env.pg.fails(f"insert into public.rule_decisions (org_id, rule_id, action, by_user, previous_statement, new_statement) select org_id, id, 'confirm', '{P1}', statement, statement from public.business_rules limit 1;", "service")


def test_a_code_rule_can_never_be_inserted_as_high_confidence(env):
    sql = f"insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha) values ('{env.org}', '{env.repo}', 'Code says so with certainty', 'k2', 'money', 'high', 'code', 'high', 'x', 's');"
    assert "check" in env.pg.fails(sql, "service")


def test_other_companies_see_none_of_it(env):
    for t in ("business_rules", "rule_evidence", "repo_inventory"):
        assert env.pg.rows(f"select count(*) from public.{t} where org_id = '{env.org}';", P2) == ["0"]
    assert int(env.pg.rows(f"select count(*) from public.business_rules where org_id = '{env.org}';", P1)[0]) == 5


def test_the_statement_key_matches_the_sql_normalization(env):
    k = statement_key("  Only   owners CAN invite ")
    assert env.pg.rows("select encode(sha256(convert_to(lower(regexp_replace('Only owners CAN invite', '\\s+', ' ', 'g')), 'utf8')), 'hex');") == [k]
