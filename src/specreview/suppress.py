"""Repo-level configuration, baseline and waivers: what the team has decided to live with.

Adoption lives or dies here. A repo with existing debt must be able to turn the tool on today and only be told about
*new* problems (baseline), and a known-and-accepted finding must carry a reason and an author (waiver), not a silent
ignore. Everything is plain files under `.specreview/` so it is reviewed in a PR like any other change.

A finding is identified by a fingerprint of (feature, rule, requirement/task ids, file). Line numbers and message
wording are left out on purpose: editing a spec above a finding must not resurrect it.
"""
from __future__ import annotations

import hashlib
import json
import tomllib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .findings import Finding
from .report import Report

DIR = ".specreview"
BASELINE_FILE = "baseline.json"
WAIVERS_FILE = "waivers.json"
CONFIG_FILES = ("specreview.toml", f"{DIR}/config.toml")


def fingerprint(feature: str, f: Finding) -> str:
    key = "|".join([feature, f.rule, ",".join(sorted(f.ids)), f.loc.file])
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


# ------------------------------------------------------------------ config
@dataclass
class Config:
    fail_on: str | None = None
    min_severity: str | None = None
    threshold: float | None = None
    disable_rules: set[str] = field(default_factory=set)
    ignore_features: set[str] = field(default_factory=set)
    path: Path | None = None


def load_config(root: Path) -> Config:
    for rel in CONFIG_FILES:
        p = root / rel
        if p.is_file():
            try:
                raw = tomllib.loads(p.read_text(encoding="utf-8"))
            except tomllib.TOMLDecodeError as e:
                raise ValueError(f"{p}: TOML inválido ({e})") from None
            return Config(
                fail_on=raw.get("fail_on"), min_severity=raw.get("min_severity"), threshold=raw.get("threshold"),
                disable_rules={str(r).upper() for r in raw.get("disable_rules", [])},
                ignore_features={str(x) for x in raw.get("ignore_features", [])}, path=p)
    return Config()


# ------------------------------------------------------------------ baseline / waivers
def _read_json(p: Path, default):
    if not p.is_file():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"{p}: JSON inválido ({e})") from None


def load_baseline(root: Path, explicit: Path | None = None) -> dict[str, dict]:
    p = explicit or root / DIR / BASELINE_FILE
    if explicit and not explicit.is_file():
        raise ValueError(f"no existe el baseline {explicit}")
    return {e["fingerprint"]: e for e in _read_json(p, {}).get("findings", [])}


def write_baseline(root: Path, reports: list[Report]) -> tuple[Path, int]:
    entries = sorted(({"fingerprint": fingerprint(r.feature, f), "feature": r.feature, "rule": f.rule,
                       "ids": sorted(f.ids), "file": f.loc.file} for r in reports for f in r.findings),
                     key=lambda e: (e["feature"], e["rule"], e["fingerprint"]))
    p = root / DIR / BASELINE_FILE
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"version": 1, "findings": entries}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return p, len(entries)


def load_waivers(root: Path) -> dict[str, dict]:
    return {e["fingerprint"]: e for e in _read_json(root / DIR / WAIVERS_FILE, {}).get("waivers", [])}


def add_waiver(root: Path, fp: str, reason: str, author: str, today: date | None = None, expires: str | None = None) -> dict:
    if not reason.strip():
        raise ValueError("un waiver necesita --reason: sin motivo no hay excepción")
    p = root / DIR / WAIVERS_FILE
    waivers = load_waivers(root)
    entry = {"fingerprint": fp, "reason": reason.strip(), "author": author, "date": (today or date.today()).isoformat()}
    if expires:
        entry["expires"] = expires
    waivers[fp] = entry
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"version": 1, "waivers": sorted(waivers.values(), key=lambda e: e["fingerprint"])},
                            indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return entry


# ------------------------------------------------------------------ applying
def apply(report: Report, cfg: Config, baseline: dict[str, dict], waivers: dict[str, dict],
          today: date | None = None) -> Report:
    """Drop disabled rules, baselined findings and live waivers. Counts of what was dropped go in `report.suppressed`."""
    today = today or date.today()
    kept, dropped = [], {"rules": 0, "baseline": 0, "waived": 0}
    for f in report.findings:
        fp = fingerprint(report.feature, f)
        w = waivers.get(fp)
        live_waiver = bool(w) and not (w.get("expires") and w["expires"] < today.isoformat())
        if f.rule in cfg.disable_rules:
            dropped["rules"] += 1
        elif live_waiver:
            dropped["waived"] += 1
        elif fp in baseline:
            dropped["baseline"] += 1
        else:
            kept.append(f)
    out = Report(report.feature, report.path, kept, report.metrics, report.warnings, report.hidden)
    out.suppressed = {k: v for k, v in dropped.items() if v}
    return out
