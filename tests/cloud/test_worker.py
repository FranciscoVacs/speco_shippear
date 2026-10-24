"""Spec 013 part 3 · the review worker: from a queued push to stored snapshots and reviews, using the real engine and the real schema.
GitHub is a fake transport serving the example repository in examples/invitations."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "cloud"))

import httpx  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

from speco_cloud import worker  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402
from speco_cloud.github_app import GitHubApp  # noqa: E402

EXAMPLE = ROOT / "examples" / "invitations"
W1, W2 = "20000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000002"


def example_files() -> dict[str, str]:
    return {str(p.relative_to(EXAMPLE)): p.read_text(encoding="utf-8") for p in (EXAMPLE / "specs").rglob("*.md")}


class FakeRepo:
    """A repository whose files can change between commits. `fail` makes GitHub answer 500."""

    def __init__(self):
        self.commits: dict[str, dict[str, str]] = {"sha-A": example_files()}
        self.noise = {"src/app.py": "print('hi')", "README.md": "# hi", "specs/../escape.md": "x", "specs/x/notes.txt": "n"}
        self.fail = False
        self.requests: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(f"{req.method} {req.url.path}")
        if self.fail:
            return httpx.Response(500, json={"message": "boom"})
        path = req.url.path
        if path.endswith("/access_tokens"):
            return httpx.Response(201, json={"token": "ghs_x"})
        if "/git/trees/" in path:
            files = self.commits[path.rsplit("/", 1)[1]]
            tree = [{"path": p, "type": "blob", "size": len(t)} for p, t in {**files, **self.noise}.items()]
            tree.append({"path": "specs/sub", "type": "tree"})
            tree.append({"path": "specs/huge/spec.md", "type": "blob", "size": 10_000_000})
            return httpx.Response(200, json={"tree": tree})
        if "/contents/" in path:
            sha = req.url.params["ref"]
            rel = path.split("/contents/", 1)[1]
            return httpx.Response(200, text=self.commits[sha][rel])
        return httpx.Response(404)


@pytest.fixture(scope="module")
def env(pg):
    pg.psql(f"insert into auth.users (id, email) values ('{W1}', 'w1@example.com'), ('{W2}', 'w2@example.com');")
    org = pg.rows("select public.create_organization('Worker Co', 'worker-co');", W1)[0]
    other = pg.rows("select public.create_organization('Other Co', 'other-co');", W2)[0]
    inst = pg.rows(f"insert into public.connections (org_id, provider, external_id, account_login, account_type) values ('{org}', 'github', '7001', 'acme', 'Organization') returning id;", "service")[0]
    repo = pg.rows(f"insert into public.repositories (org_id, connection_id, external_id, full_name) values ('{org}', '{inst}', '801', 'acme/app') returning id;", "service")[0]
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", github_app_id="42", github_private_key=pem)
    fake = FakeRepo()
    gh = GitHubApp("42", pem, "https://api.github.test", httpx.Client(transport=httpx.MockTransport(fake)))
    return type("Env", (), {"pg": pg, "settings": settings, "gh": gh, "fake": fake, "org": org, "other": other, "repo": repo, "inst": inst})


def enqueue(env, sha: str):
    env.pg.psql(f"insert into public.jobs (org_id, repo_id, kind, payload) values ('{env.org}', '{env.repo}', 'sync_repo', '{{\"sha\": \"{sha}\"}}');", "service")


def count(env, table: str) -> int:
    return int(env.pg.rows(f"select count(*) from public.{table} where org_id = '{env.org}';")[0])


# ------------------------------------------------------------------ what we are willing to read
def test_only_spec_kit_files_and_the_product_layer_are_read():
    # verifies 013/FR-019
    tree = [{"path": p, "type": "blob", "size": 10} for p in (
        "specs/001-a/spec.md", "specs/001-a/plan.md", "specs/001-a/tasks.md", "specs/001-a/data-model.md", "product/goals.md", "product/decisions.md",
        "src/app.py", "specs/001-a/notes.md", "specs/../x/spec.md", "specs/a/b/spec.md", "product/secrets.md", ".env")]
    tree += [{"path": "specs/002-b/spec.md", "type": "tree"}, {"path": "specs/003-c/spec.md", "type": "blob", "size": worker.MAX_FILE_BYTES + 1}]
    assert worker.select_files(tree) == ["product/decisions.md", "product/goals.md", "specs/001-a/data-model.md", "specs/001-a/plan.md", "specs/001-a/spec.md", "specs/001-a/tasks.md"]


def test_a_repository_with_absurdly_many_features_is_refused():
    # verifies 013/FR-019
    tree = [{"path": f"specs/{i:04d}-f/spec.md", "type": "blob", "size": 1} for i in range(worker.MAX_FEATURES + 1)]
    with pytest.raises(worker.SyncError):
        worker.select_files(tree)


def test_the_engine_is_run_as_a_library_on_text_only():
    from specreview.analyzers import Context, run_all
    from specreview.parser import load_feature
    from specreview.report import build_report, to_dict
    direct = to_dict(build_report(load_feature(EXAMPLE), run_all(load_feature(EXAMPLE), Context())))
    [r] = worker.review_files(example_files())
    assert r["key"] == "003-team-invitations"
    assert r["report"]["summary"] == direct["summary"] and r["report"]["decision"]["verdict"] == direct["decision"]["verdict"]
    assert set(r["files"]) == {"spec.md", "plan.md", "tasks.md", "data-model.md"}


# ------------------------------------------------------------------ the job
def test_a_queued_push_becomes_a_stored_review(env):
    # verifies 013/FR-017
    enqueue(env, "sha-A")
    out = worker.run_once(env.settings, env.gh)
    assert out["features"] == 1 and out["snapshots"] == 1 and out["reviews"] == 1
    assert env.pg.rows(f"select key from public.features where org_id = '{env.org}';") == ["003-team-invitations"]
    verdict, blockers = env.pg.rows(f"select verdict, (summary->>'blocker')::int > 0 from public.reviews where org_id = '{env.org}';")[0].split("|")
    assert verdict in ("blocked", "needs_decision") and blockers == "t"
    assert env.pg.rows(f"select last_synced_at is not null, last_sha from public.repositories where id = '{env.repo}';") == ["t|sha-A"]
    assert env.pg.rows("select status from public.jobs where status <> 'done';") == []
    assert worker.run_once(env.settings, env.gh) is None                                    # nothing else due


def test_the_same_content_is_not_stored_twice(env):
    # verifies 013/FR-018
    env.fake.commits["sha-B"] = dict(env.fake.commits["sha-A"])                             # new commit, same specs
    enqueue(env, "sha-B")
    out = worker.run_once(env.settings, env.gh)
    assert out["snapshots"] == 0 and out["reviews"] == 0
    assert (count(env, "spec_snapshots"), count(env, "reviews")) == (1, 1)
    assert env.pg.rows(f"select last_sha from public.repositories where id = '{env.repo}';") == ["sha-B"]


def test_a_changed_spec_adds_a_new_version_and_keeps_the_old_one(env):
    files = dict(env.fake.commits["sha-A"])
    files["specs/003-team-invitations/spec.md"] += "\n- **FR-099**: The system MUST email the invitee within 60 seconds of an invitation being sent\n"
    env.fake.commits["sha-C"] = files
    enqueue(env, "sha-C")
    out = worker.run_once(env.settings, env.gh)
    assert out["snapshots"] == 1 and out["reviews"] == 1
    assert (count(env, "spec_snapshots"), count(env, "reviews")) == (2, 2)
    assert env.pg.rows(f"select count(distinct files_hash) from public.spec_snapshots where org_id = '{env.org}';") == ["2"]


def test_the_stored_hash_is_the_one_the_cli_uses_for_approvals(env):
    # verifies 013/SC-004
    from specreview import approvals
    want = approvals.spec_hash(approvals.spec_hashes(EXAMPLE / "specs" / "003-team-invitations"))
    assert want in env.pg.rows(f"select files_hash from public.spec_snapshots where org_id = '{env.org}';")


def test_a_github_failure_is_retried_later_with_backoff_then_gives_up(env):
    env.fake.fail = True
    enqueue(env, "sha-A")
    out = worker.run_once(env.settings, env.gh)
    assert "error" in out
    assert env.pg.rows("select status, attempts, last_error is not null, run_after > now() from public.jobs order by id desc limit 1;") == ["pending|1|t|t"]
    assert worker.run_once(env.settings, env.gh) is None                                    # not due yet
    for attempt in range(2, worker.MAX_ATTEMPTS + 1):
        env.pg.psql("update public.jobs set run_after = now() where status = 'pending';")
        worker.run_once(env.settings, env.gh)
    assert env.pg.rows("select status, attempts from public.jobs order by id desc limit 1;") == [f"failed|{worker.MAX_ATTEMPTS}"]
    env.fake.fail = False


def test_a_suspended_installation_is_skipped_not_retried(env):
    env.pg.psql(f"update public.connections set status = 'suspended' where id = '{env.inst}';")
    enqueue(env, "sha-A")
    out = worker.run_once(env.settings, env.gh)
    assert "skipped" in out and env.pg.rows("select status from public.jobs order by id desc limit 1;") == ["done"]
    env.pg.psql(f"update public.connections set status = 'active' where id = '{env.inst}';")


def test_a_newer_push_supersedes_a_job_that_failed(env):
    env.fake.fail = True
    enqueue(env, "sha-A")
    from speco_cloud.db import service_tx
    with service_tx(env.settings) as conn:
        job = conn.execute("select * from public.claim_job()").fetchone()
    enqueue(env, "sha-C")                                                                   # arrives while the first one runs
    worker.finish(env.settings, job["id"], "RuntimeError('boom')", job["attempts"])
    assert env.pg.rows(f"select status from public.jobs where id = {job['id']};")[0] == "failed"
    assert "superseded" in env.pg.rows(f"select last_error from public.jobs where id = {job['id']};")[0]
    env.fake.fail = False
    env.pg.psql("update public.jobs set status = 'done' where status = 'pending';")


def test_other_companies_cannot_read_the_reviews(env):
    # verifies 013/FR-002
    assert env.pg.rows(f"select count(*) from public.reviews where org_id = '{env.org}';", W2) == ["0"]
    assert int(env.pg.rows(f"select count(*) from public.reviews where org_id = '{env.org}';", W1)[0]) == 2
    assert env.pg.rows(f"select count(*) from public.spec_snapshots where org_id = '{env.org}';", W2) == ["0"]
