"""SARIF 2.1.0 output: findings show up as native annotations in GitHub Code Scanning and in the PR diff view."""
from __future__ import annotations

import json
import os
from pathlib import Path

from .findings import Severity
from .report import Report
from .rules import BY_ID
from .suppress import fingerprint

_LEVEL = {Severity.BLOCKER: "error", Severity.WARNING: "warning", Severity.SUGGESTION: "note"}
SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json"


def _uri(report: Report, file: str, root: Path | None) -> str:
    p = Path(report.path) / file
    try:
        return Path(os.path.relpath(p, root)).as_posix() if root else p.as_posix()
    except ValueError:                                  # different drive on Windows
        return p.as_posix()


def to_sarif(reports: list[Report], root: Path | None = None, version: str = "0.0.0") -> dict:
    used = sorted({f.rule for r in reports for f in r.findings})
    rules = []
    for rid in used:
        r = BY_ID.get(rid)
        rules.append({"id": rid, "name": r.name if r else rid,
                      "shortDescription": {"text": r.name if r else rid},
                      "fullDescription": {"text": r.what if r else rid},
                      "help": {"text": (r.fix if r else "")},
                      "properties": {"family": r.family if r else ""}})
    results = []
    for rep in reports:
        for f in rep.findings:
            region = {"startLine": f.loc.line} if f.loc.line else {}
            results.append({
                "ruleId": f.rule,
                "level": _LEVEL[f.severity],
                "message": {"text": f.message + (f" → {f.fix}" if f.fix else "")},
                "locations": [{"physicalLocation": {"artifactLocation": {"uri": _uri(rep, f.loc.file, root)},
                                                    **({"region": region} if region else {})}}],
                "partialFingerprints": {"specreview/v1": fingerprint(rep.feature, f)},
                "properties": {"feature": rep.feature, "ids": f.ids},
            })
    return {"$schema": SCHEMA, "version": "2.1.0", "runs": [{
        "tool": {"driver": {"name": "specreview", "version": version,
                            "informationUri": "https://github.com/agustindelmonti/speco.ia", "rules": rules}},
        "results": results}]}


def render_sarif(reports: list[Report], root: Path | None = None, version: str = "0.0.0") -> str:
    return json.dumps(to_sarif(reports, root, version), indent=2, ensure_ascii=False) + "\n"
