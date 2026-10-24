"""Orchestrates the portrait: read, propose, verify, store. The network and the model run outside any database transaction."""
from __future__ import annotations

from psycopg import Connection

from .. import credits
from ..config import Settings
from ..db import service_tx
from ..providers import Reader
from .candidates import Candidate, snippet_hash, statement_key, verify
from .drift import check_drift, confirmed_evidence
from .extractors import ModelClient, ModelExtractor, SpecExtractor, select_code_files
from .inventory import build_inventory


def store_inventory(conn: Connection, org_id: str, repo_id: str, sha: str, tree: list[dict]) -> dict:
    inv = build_inventory(tree)
    from psycopg.types.json import Jsonb
    conn.execute(
        """insert into public.repo_inventory (repo_id, org_id, commit_sha, counts, total_files) values (%s, %s, %s, %s, %s)
           on conflict (repo_id) do update set commit_sha = excluded.commit_sha, counts = excluded.counts, total_files = excluded.total_files, updated_at = now()""",
        (repo_id, org_id, sha, Jsonb(inv["counts"]), inv["total_files"]),
    )
    return inv


def store_rules(conn: Connection, org_id: str, repo_id: str, sha: str, verified: list[Candidate], files: dict[str, str]) -> int:
    """Inserts each verified candidate as PROPOSED (the service cannot insert anything else). A rule that already exists is left alone, whatever its status."""
    new = 0
    for c in verified:
        row = conn.execute(
            """insert into public.business_rules (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) on conflict (repo_id, statement_key) do nothing returning id""",
            (org_id, repo_id, c.statement, statement_key(c.statement), c.category, c.risk, c.origin, c.confidence, c.proposed_by, sha),
        ).fetchone()
        if not row:
            continue
        new += 1
        for e in c.evidence:
            conn.execute(
                """insert into public.rule_evidence (org_id, rule_id, path, start_line, end_line, excerpt, snippet_hash, commit_sha) values (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (org_id, row["id"], e.path, e.start_line, e.end_line, e.quote[:600], snippet_hash(files[e.path], e.start_line, e.end_line), sha),
            )
    return new


def evidence_files(settings: Settings, reader: Reader, sha: str, repo_id: str, have: dict[str, str]) -> dict[str, str | None]:
    """The current text of every file that supports a confirmed rule (fetched only if we do not already have it)."""
    with service_tx(settings) as conn:
        paths = {e["path"] for e in confirmed_evidence(conn, repo_id)}
    return {p: have[p] if p in have else reader.get_file_optional(p, sha) for p in paths}


def run_portrait(settings: Settings, reader: Reader, repo: dict, sha: str, tree: list[dict], spec_files: dict[str, str],
                 model: ModelClient | None = None) -> dict:
    """`repo`: {id, org_id, full_name, code_consent_at}. Returns counts for the job log."""
    candidates = SpecExtractor().extract(spec_files)
    code_files: dict[str, str] = {}
    code_analysis = "off"
    spent = 0
    if model is not None and repo.get("code_consent_at"):                       # FR-004: no consent, no code leaves for a model
        try:
            with credits.metered(settings, str(repo["org_id"]), "portrait", model) as res:      # spec 020: reserved before, charged to what was used
                code_files = {p: reader.get_file(p, sha) for p in select_code_files(tree)}
                candidates += ModelExtractor(model).extract(code_files)
            spent, code_analysis = res.spent, "on"
        except credits.CreditsRefused as e:                                   # FR-006: the model pauses, the deterministic portrait is still built
            code_analysis = "paused: " + e.code
    elif model is not None:
        code_analysis = "no consent"
    files = {**spec_files, **code_files}
    verified = [v for v in (verify(c, files) for c in candidates) if v]
    current = evidence_files(settings, reader, sha, str(repo["id"]), files)
    with service_tx(settings) as conn:
        inv = store_inventory(conn, str(repo["org_id"]), str(repo["id"]), sha, tree)
        new = store_rules(conn, str(repo["org_id"]), str(repo["id"]), sha, verified, files)
        drift = check_drift(conn, str(repo["id"]), sha, current)
    return {"inventory": inv["total_files"], "proposed": new, "discarded": len(candidates) - len(verified), "drift": drift, "code_analysis": code_analysis, "credits": spent}


def sync_inventory_and_drift(settings: Settings, reader: Reader, repo: dict, sha: str, tree: list[dict], spec_files: dict[str, str]) -> dict:
    """What every sync does besides the review: refresh the inventory and look for drift. No rules are proposed here."""
    current = evidence_files(settings, reader, sha, str(repo["id"]), spec_files)
    with service_tx(settings) as conn:
        inv = store_inventory(conn, str(repo["org_id"]), str(repo["id"]), sha, tree)
        drift = check_drift(conn, str(repo["id"]), sha, current)
    return {"inventory": inv["total_files"], "drift": drift}
