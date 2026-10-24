"""Reviewing a pull request as intent (spec 026): what the PR changes in the business, posted as one comment that is edited on each push.

Reads the spec files of the PR's base and head commits, compares them with `specreview.intent_diff` and upserts the comment.
A PR that touches no spec file gets no comment: the blob shas of the tree say so without reading any file.
Same trust rules as the worker: the repository is only read as text, nothing from it is executed."""
from __future__ import annotations

import tempfile
import tomllib
from pathlib import Path

from specreview import ledger, strength, values
from specreview.intent_diff import MARKER, diff_product, diff_trees, render_comment

from .github_app import GitHubApp
from .worker import MAX_FILE_BYTES, select_files

CONFIG = "specreview.toml"

PR_ACTIONS = {"opened", "synchronize", "reopened", "ready_for_review"}


def _materialize(gh: GitHubApp, token: str, full_name: str, sha: str, tree: list[dict], root: Path) -> None:
    for path in select_files(tree):
        dest = root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(gh.get_file(token, full_name, path, sha), encoding="utf-8")


def _spec_blobs(tree: list[dict], extra: set[str] = frozenset()) -> dict[str, str]:
    wanted = set(select_files(tree)) | set(extra)
    return {e["path"]: e.get("sha") for e in tree if e["path"] in wanted}


def _bound_files(gh: GitHubApp, token: str, full_name: str, sha: str, tree: list[dict]) -> tuple[str | None, set[str]]:
    """Spec 029: the head's specreview.toml and the code files its [values] bind, read as text only (nothing is executed)."""
    sizes = {e["path"]: e.get("size", 0) for e in tree if e["type"] == "blob"}
    if CONFIG not in sizes:
        return None, set()
    text = gh.get_file_optional(token, full_name, CONFIG, sha)
    if text is None:
        return None, set()
    with tempfile.TemporaryDirectory(prefix="speco-cfg-") as tmp:
        (Path(tmp) / CONFIG).write_text(text, encoding="utf-8")
        try:
            cfg = values.config(Path(tmp))
        except ValueError:
            return text, set()
    files = {str(b.get("file", "")) for bs in cfg.values() for b in bs}
    return text, {f for f in files if f in sizes and sizes[f] <= MAX_FILE_BYTES}


def reviews_tests(config_text: str | None) -> bool:
    """032/FR-011, FR-012: the repository asks for its edited tests to be reviewed with `[pr] review_tests = true`."""
    if not config_text:
        return False
    try:
        return tomllib.loads(config_text).get("pr", {}).get("review_tests") is True
    except tomllib.TOMLDecodeError:
        return False


def changed_tests(base_tree: list[dict], head_tree: list[dict]) -> list[str]:
    """Test files present in both commits whose blob changed, from the trees alone (no file is read). New test files are not edits."""
    base = {e["path"]: e.get("sha") for e in base_tree if e["type"] == "blob"}
    return sorted(e["path"] for e in head_tree if e["type"] == "blob" and e["path"] in base and base[e["path"]] != e.get("sha")
                  and ledger.is_test(e["path"]) and Path(e["path"]).suffix.lower() in ledger.CODE_EXT and e.get("size", 0) <= MAX_FILE_BYTES)


def review_pull_request(gh: GitHubApp, installation_id: int, full_name: str, number: int, base_sha: str, head_sha: str, cta: str = "", settings=None) -> dict:
    """With `settings` (the full service) a pull request of a repository a company reads also gets the bridge to the app (spec 027): a link to
    decide and a check. The stateless bot passes none and behaves as before."""
    token = gh.installation_token(installation_id)
    base_tree, head_tree = gh.get_tree(token, full_name, base_sha), gh.get_tree(token, full_name, head_sha)
    config_text, bound = _bound_files(gh, token, full_name, head_sha, head_tree)
    tests = changed_tests(base_tree, head_tree) if reviews_tests(config_text) else []      # 032/FR-012: no opt-in, no test read
    watched = bound | set(tests) | ({CONFIG} if config_text is not None else set())
    if _spec_blobs(base_tree, watched) == _spec_blobs(head_tree, watched):
        return {"outcome": "no_spec_changes"}
    specs_changed = _spec_blobs(base_tree) != _spec_blobs(head_tree)
    head_files: dict[str, str] = {}
    with tempfile.TemporaryDirectory(prefix="speco-pr-") as tmp:
        base_root, head_root = Path(tmp) / "base", Path(tmp) / "head"
        base_root.mkdir()
        head_root.mkdir()
        _materialize(gh, token, full_name, base_sha, base_tree, base_root)
        _materialize(gh, token, full_name, head_sha, head_tree, head_root)
        diffs = diff_trees(base_root, head_root)
        product = diff_product(base_root, head_root)
        moved = []
        if bound:
            (head_root / CONFIG).write_text(config_text, encoding="utf-8")
            for path in bound:
                dest = head_root / path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(gh.get_file(token, full_name, path, head_sha), encoding="utf-8")
            moved = values.introduced(head_root, lambda path: gh.get_file_optional(token, full_name, path, base_sha))
        edited = []
        if tests:                                                                         # 032/FR-011
            for path in tests:
                for sha, root in ((base_sha, base_root), (head_sha, head_root)):
                    dest = root / path
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_text(gh.get_file(token, full_name, path, sha), encoding="utf-8")
            edited = strength.edited_tests(ledger.build(head_root), lambda path: _read(base_root / path))
        if settings is not None:
            head_files = {p.relative_to(head_root).as_posix(): p.read_text(encoding="utf-8") for p in head_root.rglob("*.md")}
    attached, company = None, None
    if settings is not None:
        from . import bridge                                    # the stateless bot has no database: it never loads this
        company = bridge.company_for(settings, installation_id, full_name)
        if company:
            attached = bridge.attach(settings, company, number, base_sha, head_sha, head_files, diffs, moved=moved)
    if not specs_changed and not moved and not edited:
        return {"outcome": "no_spec_changes"}
    body = render_comment(diffs, cta="" if company else cta, links=attached["links"] if attached else None,
                          status=attached["status"] if attached else None, product=product, values=moved, edited=edited)
    comment_id, created = gh.upsert_comment(token, full_name, number, body, MARKER)
    if attached:
        bridge.publish(settings, gh, token, full_name, str(company["org_id"]), attached, comment_id, body, head_sha)
    return {"outcome": "commented", "comment_id": comment_id, "created": created, "features": len(diffs),
            "new_blockers": sum(len(d.new_blockers) for d in diffs), "moved_values": len(moved), "edited_tests": len(edited), **({"decision": attached["state"]} if attached else {})}


def from_webhook(payload: dict) -> dict | None:
    """The arguments of `review_pull_request` from a `pull_request` delivery, or None when the action does not call for a review."""
    pr = payload.get("pull_request") or {}
    if payload.get("action") not in PR_ACTIONS or not pr or not payload.get("installation"):
        return None
    return {"installation_id": int(payload["installation"]["id"]), "full_name": payload["repository"]["full_name"],
            "number": int(pr["number"]), "base_sha": pr["base"]["sha"], "head_sha": pr["head"]["sha"]}


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None
