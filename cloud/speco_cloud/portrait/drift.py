"""Drift (spec 014, FR-010): after the baseline, a confirmed rule is only as good as the lines that support it. When a later commit changes
or removes them, someone must say whether the rule still holds. We compare hashes of the supporting lines, so no model is involved."""
from __future__ import annotations

from psycopg import Connection

from .candidates import normalize, snippet_hash


def confirmed_evidence(conn: Connection, repo_id: str) -> list[dict]:
    return conn.execute(
        """select e.id as evidence_id, r.id as rule_id, r.code, e.org_id, e.path, e.start_line, e.end_line, e.snippet_hash, e.excerpt
             from public.business_rules r join public.rule_evidence e on e.rule_id = r.id
            where r.repo_id = %s and r.status = 'confirmed' order by r.seq, e.path, e.start_line""",
        (repo_id,),
    ).fetchall()


def _find(text: str, excerpt: str) -> tuple[int, int] | None:
    """Lines where the excerpt now lives, if it only moved."""
    want = normalize(excerpt)
    lines = text.splitlines()
    n = max(1, len(excerpt.splitlines()))
    for start in range(len(lines)):
        if normalize(" ".join(lines[start:start + n])) == want:
            return start + 1, start + n
    return None


def _open(conn: Connection, rule_id, kind: str, sha: str, org_id, detail: str) -> bool:
    if conn.execute("select 1 from public.drift_findings where rule_id = %s and kind = %s and status = 'open'", (rule_id, kind)).fetchone():
        return False                                           # already waiting for a person: do not pile up one finding per commit
    return bool(conn.execute(
        """insert into public.drift_findings (org_id, rule_id, commit_sha, kind, detail) values (%s, %s, %s, %s, %s)
           on conflict (rule_id, kind, commit_sha) do nothing returning id""",
        (org_id, rule_id, sha, kind, detail[:500]),
    ).fetchone())


def check_drift(conn: Connection, repo_id: str, sha: str, files: dict[str, str | None]) -> int:
    """`files` holds the current text of each evidence path (None = the file is gone). Returns how many findings were opened."""
    opened = 0
    for ev in confirmed_evidence(conn, repo_id):
        text = files.get(ev["path"])
        if text is None:
            opened += _open(conn, ev["rule_id"], "evidence_removed", sha, ev["org_id"], f"{ev['code']}: {ev['path']} no longer exists")
            continue
        if snippet_hash(text, ev["start_line"], ev["end_line"]) == ev["snippet_hash"]:
            continue
        moved = _find(text, ev["excerpt"])
        if moved:                                              # same lines, new position: follow them, nothing to decide
            conn.execute("update public.rule_evidence set start_line = %s, end_line = %s, snippet_hash = %s, commit_sha = %s where id = %s",
                         (moved[0], moved[1], snippet_hash(text, *moved), sha, ev["evidence_id"]))
            continue
        opened += _open(conn, ev["rule_id"], "evidence_changed", sha, ev["org_id"], f"{ev['code']}: the lines {ev['start_line']}-{ev['end_line']} of {ev['path']} changed")
        # follow the new text so only FURTHER changes open new findings; the frozen baseline keeps the original hashes
        end = min(ev["end_line"], max(len(text.splitlines()), 1))
        conn.execute("update public.rule_evidence set snippet_hash = %s, commit_sha = %s where id = %s", (snippet_hash(text, ev["start_line"], end), sha, ev["evidence_id"]))
    return opened
