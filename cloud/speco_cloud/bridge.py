"""Spec 027 · the bridge between a pull request and the decision in the app.

A pull request that changes a spec is reviewed as before (the comment). When its repository belongs to a company that chose to read it, the
bridge also:
  - keeps the version the pull request proposes (a snapshot with source 'pr') so a person can open it and decide it in the app,
  - links the comment to that decision and publishes a check that is pending while someone has to decide, and
  - when a person decides in the app, rewrites the check and the comment on the pull request.

Nothing here decides: the check only reports what a person recorded. It names nobody, because the pull request may be public.
A pull request of a repository the company does not read gets the comment and no check: a check nobody can resolve would hold a merge forever."""
from __future__ import annotations

import logging
import re

from psycopg.types.json import Jsonb
from specreview import values
from specreview.intent_diff import FeatureDiff, waits_for_decision, with_status

from . import decisions, worker
from .config import Settings
from .db import service_tx
from .github_app import GitHubApp

log = logging.getLogger("speco.bridge")

CHECK_NAME = "Speco · decisión"
APPROVING = ("approved", "approved_with_conditions")

STATUS_LINE = {
    "pending": "⏳ **Espera una decisión.** Hasta que una persona decida en Speco, el check «" + CHECK_NAME + "» queda pendiente.",
    "decided": "✅ **Decidido en Speco.** Una persona aprobó la versión que propone esta PR.",
    "rejected": "⛔ **Rechazado en Speco.** Una persona devolvió este cambio: no hay que construirlo hasta decidir de nuevo.",
    "clear": "",
}
CHECK = {   # state -> (conclusion, title)
    "pending": ("action_required", "Espera una decisión"),
    "decided": ("success", "Decidido en Speco"),
    "rejected": ("failure", "Una persona devolvió este cambio"),
    "clear": ("success", "Nada espera una decisión"),
}


def company_for(settings: Settings, installation_id: int, full_name: str) -> dict | None:
    """The company and repository this pull request belongs to, or None when nobody connected it or the company does not read it."""
    with service_tx(settings) as conn:
        return conn.execute(
            """select r.id as repo_id, r.org_id from public.repositories r join public.connections c on c.id = r.connection_id
                where c.provider = 'github' and c.external_id = %s and c.status = 'active' and r.status = 'active' and r.full_name = %s""",
            (str(installation_id), full_name),
        ).fetchone()


def state_of(conn, org_id: str, features: list[dict]) -> str:
    """clear | pending | decided | rejected, from the latest decision on each version the pull request proposes."""
    if not features:
        return "clear"
    rows = conn.execute(
        """select distinct on (snapshot_id) snapshot_id, decision from public.approvals
            where org_id = %s and snapshot_id = any(%s::uuid[]) order by snapshot_id, seq desc""",
        (org_id, [f["snapshot_id"] for f in features]),
    ).fetchall()
    latest = {str(r["snapshot_id"]): r["decision"] for r in rows}
    seen = [latest.get(f["snapshot_id"]) for f in features]
    if "rejected" in seen:
        return "rejected"
    if all(d in APPROVING for d in seen):
        return "decided"
    return "pending"


def _link(settings: Settings, org_id: str, feature_id: str, snapshot_id: str) -> str:
    return f"{settings.app_url.rstrip('/')}/reviews/{feature_id}~{snapshot_id}?org={org_id}"


def _head_files(files: dict[str, str], keys: set[str]) -> dict[str, str]:
    """Only what the review of those features needs: their own files and the product layer."""
    mine = re.compile(r"^specs/(" + "|".join(re.escape(k) for k in sorted(keys)) + r")/") if keys else None
    return {p: t for p, t in files.items() if p.startswith("product/") or (mine and mine.match(p))}


def attach(settings: Settings, company: dict, number: int, base_sha: str, head_sha: str, head_files: dict[str, str], diffs: list[FeatureDiff],
           moved: list[dict] | None = None) -> dict:
    """Keeps the proposed versions that wait for a decision and the pull request's row. -> {links, status, state, features, row}
    `moved` are the decided numbers the pull request moves in the code (spec 031): their features wait for a person too, and the numbers
    are a file of the version, so a version with other numbers is never the one somebody already approved."""
    org_id, repo_id = str(company["org_id"]), str(company["repo_id"])
    by_feature: dict[str, list[dict]] = {}
    for v in moved or []:
        by_feature.setdefault(v["rule"].split("/", 1)[0], []).append(v)
    waiting = {d.key for d in diffs if waits_for_decision(d)} | set(by_feature)
    reviewed = worker.review_files(_head_files(head_files, waiting)) if waiting else []
    reviewed = [f for f in reviewed if f["key"] in waiting]
    for f in reviewed:
        if f["key"] in by_feature:                                         # 031/FR-005, FR-006
            text = values.moved_file(by_feature[f["key"]])
            f["files"] = {**f["files"], values.MOVED_FILE: text}
            f["hash"] = decisions.version_hash(decisions.file_hashes(f["files"]))     # what deciding this version hashes too
    with service_tx(settings) as conn:
        if reviewed:
            worker.store(conn, org_id, repo_id, head_sha, reviewed, source="pr")
        features = [{"feature_id": f["feature_id"], "snapshot_id": f["snapshot_id"], "key": f["key"], "title": f["title"], "files_hash": f["hash"],
                     "verdict": f["report"]["decision"]["verdict"]} for f in reviewed]
        prev = conn.execute("select check_run_id, head_sha from public.pull_reviews where repo_id = %s and number = %s", (repo_id, number)).fetchone()
        state = state_of(conn, org_id, features)
        row = conn.execute(
            """insert into public.pull_reviews (org_id, repo_id, number, base_sha, head_sha, features) values (%s, %s, %s, %s, %s, %s)
               on conflict (repo_id, number) do update set base_sha = excluded.base_sha, head_sha = excluded.head_sha, features = excluded.features,
                 check_run_id = case when public.pull_reviews.head_sha = excluded.head_sha then public.pull_reviews.check_run_id else null end, updated_at = now()
               returning id, check_run_id""",
            (org_id, repo_id, number, base_sha, head_sha, Jsonb(features)),
        ).fetchone()
    links = {f["key"]: _link(settings, org_id, f["feature_id"], f["snapshot_id"]) for f in features}
    return {"links": links, "status": STATUS_LINE[state], "state": state, "features": features, "id": str(row["id"]), "check_run_id": row["check_run_id"],
            "had_row": prev is not None}


def _summary(state: str, features: list[dict], settings: Settings, org_id: str) -> str:
    if not features:
        return "Esta PR no deja ninguna feature esperando una decisión."
    lines = {"pending": "Una persona tiene que decidir estas versiones antes de construirlas:", "decided": "Una persona aprobó estas versiones:",
             "rejected": "Una persona devolvió al menos una de estas versiones:", "clear": ""}[state]
    items = [f"- `{f['key']}` · [abrir en Speco]({_link(settings, org_id, f['feature_id'], f['snapshot_id'])})" for f in features]
    return "\n".join([lines, "", *items])


def publish(settings: Settings, gh: GitHubApp, token: str, full_name: str, org_id: str, attached: dict, comment_id: int, body: str, head_sha: str) -> None:
    """The check and the stored comment. A failure here never loses the comment: the check is best effort (the App may not have the permission yet)."""
    conclusion, title = CHECK[attached["state"]]
    first = attached["features"][0] if attached["features"] else None
    details = _link(settings, org_id, first["feature_id"], first["snapshot_id"]) if first else settings.app_url
    check_id = attached["check_run_id"]
    try:
        check_id = gh.put_check_run(token, full_name, head_sha, CHECK_NAME, conclusion, title, _summary(attached["state"], attached["features"], settings, org_id), details, check_id)
    except Exception:                                         # noqa: BLE001
        log.exception("could not publish the check for %s", full_name)
    with service_tx(settings) as conn:
        conn.execute("update public.pull_reviews set check_run_id = %s, comment_id = %s, comment_body = %s where id = %s", (check_id, comment_id, body, attached["id"]))


def refresh(settings: Settings, gh: GitHubApp, org_id: str, snapshot_id: str) -> int:
    """Someone decided a version: every pull request that proposes it gets its check and comment rewritten. -> how many were refreshed"""
    with service_tx(settings) as conn:
        rows = conn.execute(
            """select p.id, p.number, p.head_sha, p.check_run_id, p.comment_id, p.comment_body, p.features, r.full_name, c.external_id
                 from public.pull_reviews p join public.repositories r on r.id = p.repo_id join public.connections c on c.id = r.connection_id
                where p.org_id = %s and c.provider = 'github' and p.features @> %s""",
            (org_id, Jsonb([{"snapshot_id": snapshot_id}])),
        ).fetchall()
        states = [state_of(conn, org_id, r["features"]) for r in rows]
    done = 0
    for r, state in zip(rows, states):
        try:
            token = gh.installation_token(int(r["external_id"]))
            conclusion, title = CHECK[state]
            gh.put_check_run(token, r["full_name"], r["head_sha"], CHECK_NAME, conclusion, title, _summary(state, r["features"], settings, org_id),
                             _link(settings, org_id, r["features"][0]["feature_id"], r["features"][0]["snapshot_id"]), r["check_run_id"])
            if r["comment_id"] and r["comment_body"]:
                body = with_status(r["comment_body"], STATUS_LINE[state])
                gh.edit_comment(token, r["full_name"], r["comment_id"], body)
                with service_tx(settings) as conn:
                    conn.execute("update public.pull_reviews set comment_body = %s, updated_at = now() where id = %s", (body, r["id"]))
            done += 1
        except Exception:                                      # noqa: BLE001 - the decision is already recorded; the pull request catches up on its next push
            log.exception("could not refresh %s#%s", r["full_name"], r["number"])
    return done
