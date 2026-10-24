"""The review worker (spec 013): takes a `sync_repo` job, reads the repository's specs at the pushed commit through GitHub, runs the
review engine as a library and stores one snapshot + one review per feature version.

Repositories are untrusted input. The worker only READS text over the GitHub API and parses markdown: nothing from a repository is executed,
cloned or installed. Paths, counts and sizes are bounded before anything is fetched."""
from __future__ import annotations

import re
import tempfile
from pathlib import Path

from psycopg.types.json import Jsonb
from specreview import __version__ as ENGINE_VERSION
from specreview import approvals
from specreview.analyzers import Context, run_all
from specreview.parser import load_feature
from specreview.parser.loader import discover_features
from specreview.report import build_report, to_dict

from . import billing
from .config import Settings
from .db import service_tx
from .providers import Reader, coerce
from .providers import from_settings as providers_from_settings
from .portrait import pipeline as portrait_pipeline
from .portrait.extractors import AnthropicClient, ModelClient

FEATURE_FILE = re.compile(r"^specs/([A-Za-z0-9][A-Za-z0-9._-]{0,80})/(spec|plan|tasks|data-model)\.md$")
PRODUCT_FILE = re.compile(r"^product/(goals|decisions)\.md$")
MAX_FILE_BYTES = 512 * 1024
MAX_FILES = 1000
MAX_FEATURES = 200
MAX_ATTEMPTS = 5


class SyncError(Exception):
    pass


def select_files(tree: list[dict]) -> list[str]:
    """Which paths of the repository we read: the Spec Kit files of each feature and the product layer. Everything else is ignored."""
    paths = [e["path"] for e in tree if e["type"] == "blob" and e.get("size", 0) <= MAX_FILE_BYTES and (FEATURE_FILE.match(e["path"]) or PRODUCT_FILE.match(e["path"]))]
    features = {FEATURE_FILE.match(p).group(1) for p in paths if FEATURE_FILE.match(p)}
    if len(features) > MAX_FEATURES or len(paths) > MAX_FILES:
        raise SyncError(f"repository has too many spec files ({len(features)} features, {len(paths)} files)")
    return sorted(paths)


def review_files(files: dict[str, str]) -> list[dict]:
    """{repo path: text} -> one entry per feature: {key, title, files (the versioned ones), hash, report}. Pure: no network, no database."""
    out = []
    with tempfile.TemporaryDirectory(prefix="speco-sync-") as tmp:
        root = Path(tmp)
        for path, text in files.items():
            dest = root / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text, encoding="utf-8")
        for key, fdir in discover_features(root).items():
            feat = load_feature(fdir)
            versioned = {n: (fdir / n).read_text(encoding="utf-8") for n in approvals.FILES if (fdir / n).is_file()}
            report = to_dict(build_report(feat, run_all(feat, Context())))
            out.append({"key": key, "title": getattr(feat.spec, "title", None) or key, "files": versioned,
                        "hash": approvals.spec_hash(approvals.spec_hashes(fdir)), "report": report})
    return out


def fetch_files(reader: Reader, sha: str, tree: list[dict] | None = None) -> tuple[dict[str, str], list[dict]]:
    tree = tree if tree is not None else reader.get_tree(sha)
    return {p: reader.get_file(p, sha) for p in select_files(tree)}, tree


def store(conn, org_id: str, repo_id: str, sha: str, reviewed: list[dict], source: str = "branch") -> dict:
    """Saves each feature version once. Re-running the same commit changes nothing (a snapshot is unique per feature + content hash).
    `source` says where the version was first seen: a version first seen on a pull request becomes a branch version once it is merged."""
    new_snapshots = new_reviews = 0
    for f in reviewed:
        feat = conn.execute(
            """insert into public.features (org_id, repo_id, key, title) values (%s, %s, %s, %s)
               on conflict (repo_id, key) do update set title = excluded.title returning id""",
            (org_id, repo_id, f["key"], f["title"]),
        ).fetchone()
        snap = conn.execute(
            """insert into public.spec_snapshots (org_id, feature_id, commit_sha, files_hash, files, source) values (%s, %s, %s, %s, %s, %s)
               on conflict (feature_id, files_hash) do update
                 set source = excluded.source, commit_sha = excluded.commit_sha
               where public.spec_snapshots.source = 'pr' and excluded.source = 'branch'
               returning id, (xmax = 0) as fresh""",
            (org_id, feat["id"], sha, f["hash"], Jsonb(f["files"]), source),
        ).fetchone()
        if snap and snap["fresh"]:
            new_snapshots += 1
        if not snap:
            snap = conn.execute("select id from public.spec_snapshots where feature_id = %s and files_hash = %s", (feat["id"], f["hash"])).fetchone()
        f["feature_id"], f["snapshot_id"] = str(feat["id"]), str(snap["id"])
        report = f["report"]
        if not conn.execute("select 1 from public.reviews where snapshot_id = %s and engine_version = %s", (snap["id"], ENGINE_VERSION)).fetchone():
            conn.execute(
                "insert into public.reviews (org_id, snapshot_id, verdict, summary, report, engine_version) values (%s, %s, %s, %s, %s, %s)",
                (org_id, snap["id"], report["decision"]["verdict"], Jsonb(report["summary"]), Jsonb(report), ENGINE_VERSION),
            )
            new_reviews += 1
    if source == "branch":
        conn.execute("update public.repositories set last_sha = %s, last_synced_at = now() where id = %s", (sha, repo_id))
    return {"features": len(reviewed), "snapshots": new_snapshots, "reviews": new_reviews}


def run_job(settings: Settings, code, job: dict, model: ModelClient | None = None) -> dict:
    with service_tx(settings) as conn:
        repo = conn.execute(
            """select r.id, r.org_id, r.full_name, r.last_sha, r.default_branch, r.code_consent_at, r.status as repo_status,
                      c.provider, c.external_id as connection_external_id, c.status as conn_status, s.credentials
                 from public.repositories r join public.connections c on c.id = r.connection_id
                      left join public.connection_secrets s on s.connection_id = c.id
                where r.id = %s""",
            (job["repo_id"],),
        ).fetchone()
    if not repo or repo["conn_status"] != "active" or repo["repo_status"] != "active":
        return {"skipped": "repository or connection is gone"}
    reader = coerce(code).reader(repo)
    sha = (job["payload"] or {}).get("sha") or reader.resolve_ref(repo["default_branch"])     # first sync: the branch head
    files, tree = fetch_files(reader, sha)                                            # network and parsing outside any transaction
    if job["kind"] == "portrait":
        out = portrait_pipeline.run_portrait(settings, reader, repo, sha, tree, files, model)
        out["referrals"] = reward_referrals(settings, str(repo["org_id"]))               # a first portrait is a first result (spec 021 FR-005)
        return out
    reviewed = review_files(files)
    extra = portrait_pipeline.sync_inventory_and_drift(settings, reader, repo, sha, tree, files)
    with service_tx(settings) as conn:
        out = {**store(conn, str(repo["org_id"]), str(repo["id"]), sha, reviewed), **extra}
    if out["reviews"]:
        out["referrals"] = reward_referrals(settings, str(repo["org_id"]))                # so is a first recorded review
    return out


def reward_referrals(settings: Settings, org_id: str) -> int:
    """Rewards the referral of whoever owns this company, if there is a pending one. Idempotent: nothing happens the second time."""
    with service_tx(settings) as conn:
        return conn.execute("select public.referral_activate(%s) as n", (org_id,)).fetchone()["n"]


def finish(settings: Settings, job_id: int, error: str | None, attempts: int) -> None:
    with service_tx(settings) as conn:
        if error is None:
            conn.execute("update public.jobs set status = 'done', last_error = null, updated_at = now() where id = %s", (job_id,))
        elif attempts >= MAX_ATTEMPTS:
            conn.execute("update public.jobs set status = 'failed', last_error = %s, updated_at = now() where id = %s", (error[:500], job_id))
        else:  # back to pending with exponential backoff (2, 4, 8, 16 minutes)
            retried = conn.execute(
                """update public.jobs set status = 'pending', last_error = %s, run_after = now() + make_interval(mins => %s), updated_at = now()
                    where id = %s and not exists (select 1 from public.jobs o where o.repo_id = jobs.repo_id and o.kind = jobs.kind and o.status = 'pending' and o.id <> jobs.id)""",
                (error[:500], 2 ** attempts, job_id),
            ).rowcount
            if not retried:   # a newer push already has its own pending job for this repository: it supersedes this one
                conn.execute("update public.jobs set status = 'failed', last_error = %s where id = %s", ("superseded after error: " + error[:450], job_id))


def run_once(settings: Settings, code, model: ModelClient | None = None) -> dict | None:
    """Claims and runs one job. Returns what happened, or None when there is nothing due."""
    with service_tx(settings) as conn:
        job = conn.execute("select * from public.claim_job()").fetchone()
    if not job:
        return None
    try:
        result = run_job(settings, code, job, model)
    except Exception as e:                      # noqa: BLE001 - any failure is recorded on the job and retried
        finish(settings, job["id"], repr(e), job["attempts"])
        return {"job": job["id"], "error": repr(e)}
    finish(settings, job["id"], None, job["attempts"])
    return {"job": job["id"], **result}


def model_from_settings(settings: Settings) -> ModelClient | None:
    return AnthropicClient(settings.anthropic_api_key, settings.model) if settings.anthropic_api_key else None      # optional (D-003)


def periodic(settings: Settings, payments) -> None:
    """Monthly credits and renewals. Running it again in the same month changes nothing (spec 020 FR-003)."""
    with service_tx(settings) as conn:
        conn.execute("select public.grant_monthly_credits()")
        conn.execute("select public.release_stale_reservations()")        # a turn or a run that died mid-call must not hold credits
    billing.renew_due(settings, payments)                                 # spec 024: renew what is due, apply what was scheduled, end what lapsed


def drain(settings: Settings, code, model: ModelClient | None = None, budget_seconds: float = 30) -> list[dict]:
    """Runs due jobs until none is left or the budget is spent. A job already started is never cut: the budget only stops the next one."""
    import time

    deadline, done = time.monotonic() + budget_seconds, []
    while time.monotonic() < deadline:
        out = run_once(settings, code, model)
        if out is None:
            break
        done.append(out)
    return done


def main() -> None:                              # pragma: no cover - loop around run_once
    import time

    settings = Settings.from_env()
    code = providers_from_settings(settings)
    model = model_from_settings(settings)
    payments = billing.provider_from_settings(settings)
    next_grants = 0.0
    while True:
        if time.time() >= next_grants:
            periodic(settings, payments)
            next_grants = time.time() + 3600
        if run_once(settings, code, model) is None:
            time.sleep(5)


if __name__ == "__main__":                       # pragma: no cover
    main()
