"""Structured report: one object, three renderings (text for humans, JSON for machines, Markdown for PRs/chat)."""
from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field

from . import ears
from .findings import Finding, Severity
from .model import Feature

SCHEMA_VERSION = 1

from .rules import BY_ID

RULES = {rid: r.name for rid, r in BY_ID.items()}   # single source: rules.py


def _natural(s: str):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)]


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (-f.severity, f.rule, _natural(f.ids[0] if f.ids else "")))


@dataclass
class Report:
    feature: str
    path: str
    findings: list[Finding]
    metrics: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)   # parser-level notes (missing plan.md, malformed task...)
    hidden: int = 0                                     # findings dropped by --min-severity
    suppressed: dict = field(default_factory=dict)      # findings dropped by config / baseline / waivers (suppress.py)

    @property
    def counts(self) -> dict[str, int]:
        c = Counter(f.severity.key for f in self.findings)
        return {k: c.get(k, 0) for k in ("blocker", "warning", "suggestion")}

    def worst(self) -> Severity | None:
        return max((f.severity for f in self.findings), default=None)


def build_report(feature: Feature, findings: list[Finding]) -> Report:
    spec = feature.spec
    frs = spec.requirements
    flagged = lambda rule: {i for f in findings if f.rule == rule for i in f.ids}  # noqa: E731
    uncovered = flagged("COV001") & {r.id for r in frs}
    nothing_to_cross = any(f.rule == "COV000" for f in findings)
    no_ac = flagged("QUA006") & {r.id for r in frs}
    patterns = Counter(ears.classify(r.text) for r in frs)
    pct = lambda n, d: round(100 * n / d) if d else None  # noqa: E731
    metrics = {
        "requirements": len(frs),
        "success_criteria": len(spec.success_criteria),
        "user_stories": len(spec.stories),
        "tasks": len(feature.tasks),
        "plan_items": len(feature.plan.items) if feature.plan else 0,
        # with no plan and no tasks there is nothing to measure against: unknown (None), not 100 %
        "requirements_with_plan_or_tasks_pct": None if nothing_to_cross else pct(len(frs) - len(uncovered), len(frs)),
        "requirements_with_acceptance_pct": pct(len(frs) - len(no_ac), len(frs)),
        "tasks_without_requirement": len({i for f in findings if f.rule == "COV002" and f.severity >= Severity.WARNING for i in f.ids}),
        "ears_patterns": {k: patterns.get(k, 0) for k in
                          ("ubiquitous", "event", "state", "unwanted", "optional", "complex", "none")},
    }
    return Report(feature.name, str(feature.dir), sort_findings(findings), metrics, list(feature.warnings))


def filter_min_severity(r: Report, minimum: Severity) -> Report:
    """Hide lower-severity findings from the listing; the summary line still says how many were hidden."""
    kept = [f for f in r.findings if f.severity >= minimum]
    hidden = len(r.findings) - len(kept)
    out = Report(r.feature, r.path, kept, r.metrics, r.warnings)
    out.hidden = hidden
    out.suppressed = r.suppressed
    return out


# ------------------------------------------------------------------ text
_BADGE = {Severity.BLOCKER: "BLOQUEANTE", Severity.WARNING: "ADVERTENCIA", Severity.SUGGESTION: "SUGERENCIA"}


def render_text(r: Report, verbose: bool = False, color: bool = False) -> str:
    paint = _painter(color)
    m = r.metrics
    c = r.counts
    out = [paint("bold", f"Spec review · {r.feature}"),
           f"{m['requirements']} requisitos · {m['user_stories']} stories · {m['plan_items']} pasos de plan · {m['tasks']} tasks",
           ""]
    for w in r.warnings:
        out.append(paint("dim", f"nota: {w}"))
    if r.warnings:
        out.append("")
    if not r.findings:
        out.append(paint("green", "Sin hallazgos."))
    else:
        wid = max(len(_where(f)) for f in r.findings)
        loc_w = max(len(str(f.loc)) for f in r.findings)
        for f in r.findings:
            badge = paint(f.severity.key, f"{_BADGE[f.severity]:<11}")
            out.append(f"{badge} {_where(f):<{wid}}  {str(f.loc):<{loc_w}}  {f.rule}  {f.message}")
            if verbose:
                if f.fix:
                    out.append(f"{'':<12}↳ {f.fix}")
                for e in f.evidence:
                    out.append(f"{'':<12}· {e}")
    out += ["", "Resumen: " + ", ".join(
        paint(k, f"{c[k]} {lbl}") for k, lbl in
        (("blocker", "bloqueantes"), ("warning", "advertencias"), ("suggestion", "sugerencias")))]
    if r.hidden:
        out.append(paint("dim", f"({r.hidden} hallazgos de menor severidad ocultos; usar --min-severity suggestion para verlos)"))
    if r.suppressed:
        out.append(paint("dim", f"({_suppressed_note(r.suppressed)})"))
    out.append(_metrics_line(m))
    return "\n".join(out) + "\n"


def _suppressed_note(s: dict) -> str:
    names = {"baseline": "en baseline", "waived": "con waiver", "rules": "de reglas desactivadas"}
    return f"{sum(s.values())} hallazgos suprimidos: " + ", ".join(f"{v} {names.get(k, k)}" for k, v in s.items())


def _where(f: Finding) -> str:
    return " + ".join(f.ids)


def _metrics_line(m: dict) -> str:
    bits = []
    if m["requirements_with_plan_or_tasks_pct"] is not None:
        bits.append(f"cobertura requisito→plan/tasks {m['requirements_with_plan_or_tasks_pct']}%")
        bits.append(f"con criterio de aceptación {m['requirements_with_acceptance_pct']}%")
    p = m["ears_patterns"]
    bits.append(f"EARS {m['requirements'] - p['none']}/{m['requirements']}")
    return "Métricas: " + " · ".join(bits)


def _painter(enabled: bool):
    codes = {"blocker": "1;31", "warning": "33", "suggestion": "36", "bold": "1", "dim": "2", "green": "32"}
    return (lambda k, s: f"\033[{codes[k]}m{s}\033[0m") if enabled else (lambda k, s: s)


# ------------------------------------------------------------------ json
def to_dict(r: Report) -> dict:
    from .decision import owner_of, risk_of, summarize
    from .suppress import fingerprint
    d = {
        "schema_version": SCHEMA_VERSION,
        "feature": r.feature,
        "summary": r.counts,
        "metrics": r.metrics,
        "notes": r.warnings,
        "decision": summarize(r.findings),
        "findings": [{
            "fingerprint": fingerprint(r.feature, f),
            "owner": owner_of(f.rule),
            "risk": risk_of(f.rule),
            "rule": f.rule,
            "rule_name": RULES.get(f.rule, f.rule),
            "severity": f.severity.key,
            "ids": f.ids,
            "location": {"file": f.loc.file, "line": f.loc.line},
            "message": f.message,
            "fix": f.fix,
            "evidence": f.evidence,
        } for f in r.findings],
    }
    if r.suppressed:                                   # only present when something was suppressed: old consumers unaffected
        d["suppressed"] = r.suppressed
    return d


def render_json(r: Report) -> str:
    return json.dumps(to_dict(r), indent=2, ensure_ascii=False) + "\n"


# ------------------------------------------------------------------ markdown
_EMOJI = {Severity.BLOCKER: "🔴", Severity.WARNING: "🟡", Severity.SUGGESTION: "🔵"}


def render_markdown(r: Report, verbose: bool = False) -> str:
    c = r.counts
    out = [f"## Spec review · `{r.feature}`", "",
           f"🔴 {c['blocker']} bloqueantes · 🟡 {c['warning']} advertencias · 🔵 {c['suggestion']} sugerencias", ""]
    if r.findings:
        out += ["| Sev. | Dónde | Ubicación | Regla | Qué pasa |", "|---|---|---|---|---|"]
        for f in r.findings:
            msg = f.message.replace("|", "\\|") + (f" _→ {f.fix.replace('|', chr(92) + '|')}_" if verbose and f.fix else "")
            out.append(f"| {_EMOJI[f.severity]} | {_where(f)} | `{f.loc}` | {f.rule} | {msg} |")
    else:
        out.append("Sin hallazgos ✅")
    if r.suppressed:
        out += ["", f"_{_suppressed_note(r.suppressed)}_"]
    out += ["", _metrics_line(r.metrics)]
    return "\n".join(out) + "\n"


# ------------------------------------------------------------------ all features (docs/specs/002)
@dataclass
class FeatureResult:
    name: str
    report: Report | None = None        # full (unfiltered) report; None if the feature failed
    error: str = ""

    def counts(self) -> dict[str, int] | None:
        return self.report.counts if self.report else None


def render_summary_table(results: list[FeatureResult], color: bool = False) -> str:
    paint = _painter(color)
    w = max([len(r.name) for r in results] + [7])
    out = [paint("bold", "Resumen por feature"), f"{'feature':<{w}}  {'bloq.':>5}  {'adv.':>5}  {'sug.':>5}"]
    tot = {"blocker": 0, "warning": 0, "suggestion": 0}
    for r in results:
        c = r.counts()
        if c is None:
            out.append(f"{r.name:<{w}}  " + paint("blocker", "FALLÓ") + f"  {r.error}")
            continue
        for k in tot:
            tot[k] += c[k]
        out.append(f"{r.name:<{w}}  " + "  ".join(paint(k, f"{c[k]:>5}") if c[k] else f"{c[k]:>5}"
                                                     for k in ("blocker", "warning", "suggestion")))
    out.append(f"{'total':<{w}}  {tot['blocker']:>5}  {tot['warning']:>5}  {tot['suggestion']:>5}")
    return "\n".join(out) + "\n"


def multi_to_dict(results: list[FeatureResult], shown: list[Report]) -> dict:
    """One document: per-feature reports (as displayed, i.e. after --min-severity) + counts table over ALL findings."""
    return {
        "schema_version": SCHEMA_VERSION,
        "features": [to_dict(r) for r in shown],
        "summary": [{"feature": r.name, **(r.counts() or {"blocker": None, "warning": None, "suggestion": None}),
                     "failed": r.error or None} for r in results],
    }


def render_multi_json(results: list[FeatureResult], shown: list[Report]) -> str:
    return json.dumps(multi_to_dict(results, shown), indent=2, ensure_ascii=False) + "\n"


def render_multi_markdown(results: list[FeatureResult], shown: list[Report], verbose: bool = False) -> str:
    out = ["## Spec review · todas las features", "", "| Feature | 🔴 | 🟡 | 🔵 |", "|---|---|---|---|"]
    for r in results:
        c = r.counts()
        out.append(f"| `{r.name}` | " + (" | ".join(str(c[k]) for k in ("blocker", "warning", "suggestion")) if c
                                        else f"FALLÓ: {r.error} |  | ") + " |")
    out.append("")
    out += [render_markdown(rep, verbose) for rep in shown]
    return "\n".join(out)
