"""Product layer: validate a spec against what the product has already decided (goals, decisions, assumptions).

The code-level review checks a spec against itself and its plan. The product layer checks it against its *context*:

    product/goals.md        - **G-1**: Reduce onboarding time to under 5 minutes        (or "## G-1: ..." headings)
    product/decisions.md    - ## D-003: Points never expire        (**Status**: accepted | superseded | rejected | proposed)
                              **Out of scope**: expire, expiry, expiration     <- terms the decision rules out
    spec.md header          - **Goals**: G-1, G-2        **Decisions**: D-003

It is opt-in: with no `product/` folder the analyzer emits nothing and every existing review stays as it was. Traceability is
explicit (G-/D- ids, like FR-###) and deterministic. A contradiction found only by text matching ("Out of scope" terms) is a
warning; citing a decision that is superseded or rejected is a blocker, because there nothing is inferred.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .findings import Finding, Severity
from .model import Feature, Loc

DEFAULT_DIR = "product"
_GOAL_BULLET = re.compile(r"^\s*[-*]\s*\*{0,2}(G-\d+)\*{0,2}\s*[:\-–—]\s*(.+?)\s*$")
_GOAL_HEAD = re.compile(r"^#{1,6}\s*(G-\d+)\s*[:\-–—]\s*(.+?)\s*$")
_DEC_HEAD = re.compile(r"^#{1,6}\s*(D-\d+)\s*[:\-–—]\s*(.+?)\s*$")
_FIELD = re.compile(r"^\s*[-*]?\s*\*\*([^*:]+?)\*\*\s*:?\s*(.*)$")
_FIX = re.compile(r"\b(\d{3}(?:-[a-z0-9][a-z0-9-]*)?)[/:#]((?:FR|SC)-\d{3})\s*=\s*(\d+(?:[.,]\d+)*)", re.I)
_ID = {"G": re.compile(r"\bG-\d+\b"), "D": re.compile(r"\bD-\d+\b")}
_EVIDENCE = re.compile(r"\b(evidence|evidencia|validated|validado|source|fuente|interview|entrevista|survey|encuesta|data shows|datos)\b|https?://", re.I)
# An assumption about what people *think or do* ("users prefer X"), not a deployment fact ("runs on the user's machine").
_USER_BELIEF = re.compile(
    r"\b(users?|customers?|clients?|people|admins?|buyers?|teams?|usuarios?|clientes?|gente|personas|equipos?)\b[^.;]{0,70}?"
    r"\b(want|prefer|need|will|would|expect|like|pay|buy|use|know|understand|trust|care|quer\w*|prefier\w*|necesit\w*|esper\w*|pagar\w*|compr\w*|usar\w*|conoc\w*|entiend\w*)\b", re.I)


@dataclass
class Goal:
    id: str
    text: str
    loc: Loc


@dataclass
class DecisionRec:
    id: str
    title: str
    status: str = "accepted"
    date: str = ""
    out_of_scope: list[str] = field(default_factory=list)
    loc: Loc = Loc("")
    fixes: list[tuple[str, str, str]] = field(default_factory=list)   # (feature, FR-/SC- id, number) the decision fixes (031/FR-001)


@dataclass
class ProductContext:
    dir: Path
    goals: dict[str, Goal] = field(default_factory=dict)
    decisions: dict[str, DecisionRec] = field(default_factory=dict)


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace") if p.is_file() else ""


def load_product(root: Path, dirname: str = DEFAULT_DIR) -> ProductContext | None:
    d = Path(root) / dirname
    if not d.is_dir():
        return None
    ctx = ProductContext(d)
    rel = f"{dirname}/goals.md"
    for n, line in enumerate(_read(d / "goals.md").splitlines(), 1):
        m = _GOAL_BULLET.match(line) or _GOAL_HEAD.match(line)
        if m:
            ctx.goals[m.group(1)] = Goal(m.group(1), m.group(2).strip("* "), Loc(rel, n))
    rel = f"{dirname}/decisions.md"
    cur: DecisionRec | None = None
    for n, line in enumerate(_read(d / "decisions.md").splitlines(), 1):
        h = _DEC_HEAD.match(line)
        if h:
            cur = DecisionRec(h.group(1), h.group(2).strip("* "), loc=Loc(rel, n))
            ctx.decisions[cur.id] = cur
            continue
        f = _FIELD.match(line)
        if cur and f:
            key, val = f.group(1).strip().lower(), f.group(2).strip()
            if key in ("status", "estado"):
                cur.status = (re.split(r"[\s(,;]", val.lower(), maxsplit=1)[0] or "accepted")
            elif key in ("date", "fecha"):
                cur.date = val
            elif key in ("out of scope", "fuera de alcance", "excludes", "excluye"):
                cur.out_of_scope = [t.strip().lower() for t in re.split(r"[,;]", val) if t.strip()]
            elif key in ("fixes", "fija"):
                cur.fixes = [(m.group(1), m.group(2).upper(), m.group(3)) for m in _FIX.finditer(val)]
    return ctx


_JIRA_KEY = re.compile(r"\b[A-Z][A-Z0-9]+-\d+\b")


def jira_refs(feature: Feature) -> set[str]:
    """Jira keys in header lines like `**Jira**: PROJ-12, PROJ-13` (before the first '## ')."""
    keys: set[str] = set()
    for line in _read(feature.dir / "spec.md").splitlines():
        if line.startswith("## "):
            break
        if re.match(r"^\s*\*{0,2}(jira|epic|issues?)\b", line.lower()):
            keys |= set(_JIRA_KEY.findall(line))
    return keys


def spec_refs(feature: Feature) -> tuple[set[str], set[str], int]:
    """(goal ids, decision ids, line of the title) the spec declares in its header lines (before the first '## ')."""
    text = _read(feature.dir / "spec.md")
    goals: set[str] = set()
    decisions: set[str] = set()
    title_line = 1
    for n, line in enumerate(text.splitlines(), 1):
        if line.startswith("# ") and title_line == 1:
            title_line = n
        if line.startswith("## "):
            break
        low = line.lower()
        if re.match(r"^\s*\*{0,2}(goals?|objetivos?)\b", low):
            goals |= set(_ID["G"].findall(line))
        if re.match(r"^\s*\*{0,2}(decisions?|decisiones|decisión)\b", low):
            decisions |= set(_ID["D"].findall(line))
    return goals, decisions, title_line


def _line_of(text: str, needle: str, default: int = 1) -> int:
    for n, line in enumerate(text.splitlines(), 1):
        if needle in line:
            return n
    return default


def check_product(feature: Feature, ctx: ProductContext | None = None) -> list[Finding]:
    ctx = ctx if ctx is not None else load_product(feature.root)
    if ctx is None or feature.spec is None:
        return []
    out: list[Finding] = []
    goals, decisions, tline = spec_refs(feature)
    where = Loc("spec.md", tline)
    name = feature.name

    if ctx.goals and not goals:
        out.append(Finding("PRD001", Severity.WARNING, [name], where,
                           f"{name} no declara a qué objetivo de producto responde: ¿es alcance que queremos o un colado?",
                           "Agregar «**Goals**: G-n» en el encabezado de la spec, o decidir que no entra"))
    for g in sorted(goals - set(ctx.goals)):
        out.append(Finding("PRD002", Severity.WARNING, [g], where, f"La spec cita el objetivo {g}, que no existe en {ctx.dir.name}/goals.md.",
                           "Corregir el id o agregar el objetivo"))
    for d in sorted(decisions - set(ctx.decisions)):
        out.append(Finding("PRD002", Severity.WARNING, [d], where, f"La spec cita la decisión {d}, que no existe en {ctx.dir.name}/decisions.md.",
                           "Corregir el id o registrar la decisión"))
    for d in sorted(decisions & set(ctx.decisions)):
        rec = ctx.decisions[d]
        if rec.status in ("superseded", "rejected", "reemplazada", "rechazada"):
            out.append(Finding("PRD003", Severity.BLOCKER, [d], where,
                               f"La spec se apoya en la decisión {d} («{rec.title}»), que está {rec.status}.",
                               "Citar la decisión vigente que la reemplaza, o reabrir la decisión", [f"{d} en {rec.loc}"]))

    # Inferred by text: an accepted decision rules out a term that a requirement uses.
    reqs = [*feature.spec.requirements, *feature.spec.success_criteria]
    for rec in ctx.decisions.values():
        if rec.status not in ("accepted", "aceptada", "vigente") or not rec.out_of_scope:
            continue
        for r in reqs:
            hit = next((t for t in rec.out_of_scope if re.search(rf"(?<![\w-]){re.escape(t)}\w*", r.text, re.I)), None)
            if hit:
                out.append(Finding("PRD003", Severity.WARNING, [r.id, rec.id], r.loc,
                                   f"{r.id} parece ir contra la decisión {rec.id} («{rec.title}»): menciona «{hit}», que esa decisión deja fuera.",
                                   "Confirmar si contradice; si es así, reabrir la decisión o cambiar el requisito", [f"{rec.id} en {rec.loc}"]))

    out += check_fixed_numbers(feature, ctx)

    cache = None
    if ctx.dir.is_dir():
        from .jira import load_cache
        cache = load_cache(ctx.dir)
    if cache is not None:                                     # PRD006 is opt-in twice: product/ and a synced product/jira.json
        known = {i["key"]: i for i in cache.get("issues", [])}
        for key in sorted(jira_refs(feature)):
            issue = known.get(key)
            if issue is None:
                out.append(Finding("PRD006", Severity.WARNING, [key], where,
                                   f"La spec cita {key}, que no está en el caché de Jira (sincronizado el {cache.get('synced_at', '?')}).",
                                   "Corregir la clave o correr `specreview jira sync`"))
            elif issue.get("status_category") == "done":
                out.append(Finding("PRD006", Severity.WARNING, [key], where,
                                   f"{key} («{issue.get('summary', '')[:70]}») figura como {issue.get('status', 'cerrado')} en Jira, pero la spec sigue en curso.",
                                   "Confirmar si el trabajo sigue vigente o reabrir el issue"))

    spec_text = _read(feature.dir / "spec.md")
    for a in feature.spec.assumptions:
        if _USER_BELIEF.search(a) and not _EVIDENCE.search(a):
            out.append(Finding("PRD005", Severity.WARNING, [name], Loc("spec.md", _line_of(spec_text, a[:40], tline)),
                               f"Supuesto sobre el usuario sin evidencia: «{a[:110]}».",
                               "Citar de dónde sale (entrevista, datos, encuesta) o marcarlo como hipótesis a validar"))
    return out


ACCEPTED = ("accepted", "aceptada", "vigente")


def _same_feature(cited: str, key: str) -> bool:
    return cited == key or cited == key.split("-", 1)[0] or key.startswith(cited + "-")


def fixed_by(ctx: ProductContext | None, key: str, rid: str) -> list[tuple[DecisionRec, str]]:
    """031: the accepted decisions that fix the number of `key`/`rid`, with the number each one fixes."""
    if ctx is None:
        return []
    return [(rec, num) for rec in ctx.decisions.values() if rec.status in ACCEPTED
            for f, i, num in rec.fixes if i == rid and _same_feature(f, key)]


def check_fixed_numbers(feature: Feature, ctx: ProductContext) -> list[Finding]:
    """031/FR-002: a rule that does not state the number an accepted decision fixes for it."""
    from .values import _norm, numbers
    out = []
    reqs = {r.id: r for r in [*feature.spec.requirements, *feature.spec.success_criteria]}
    for rec in ctx.decisions.values():
        if rec.status not in ACCEPTED:
            continue
        for f, rid, num in rec.fixes:
            if not _same_feature(f, feature.name):
                continue
            r = reqs.get(rid)
            if r is None:
                out.append(Finding("PRD002", Severity.WARNING, [rec.id], rec.loc,
                                   f"La decisión {rec.id} fija {f}/{rid} = {num}, pero {feature.name} no tiene {rid}.",
                                   "Corregir la referencia en la decisión o restaurar el requisito"))
            elif _norm(num) not in numbers(r.text):
                out.append(Finding("PRD007", Severity.BLOCKER, [r.id, rec.id], r.loc,
                                   f"{r.id} no dice {num}, el número que fija la decisión {rec.id} («{rec.title}»): dice {' / '.join(numbers(r.text)) or 'ningún número'}.",
                                   f"Volver {r.id} a {num}, o reabrir {rec.id} con una decisión nueva que fije el número nuevo", [f"{rec.id} en {rec.loc}"]))
    return out


# ------------------------------------------------------------------ portfolio view (goal -> features)
def product_report(root: Path, features: dict[str, Path], dirname: str = DEFAULT_DIR) -> dict | None:
    """Which goals are covered by which features, which goals nobody builds (PRD004), which features answer to no goal."""
    from .parser import load_feature
    ctx = load_product(root, dirname)
    if ctx is None:
        return None
    cites: dict[str, list[str]] = {g: [] for g in ctx.goals}
    no_goal: list[str] = []
    for name, d in features.items():
        goals, _, _ = spec_refs(load_feature(d))
        if not goals:
            no_goal.append(name)
        for g in goals:
            if g in cites:
                cites[g].append(name)
    findings = [Finding("PRD004", Severity.WARNING, [g], ctx.goals[g].loc,
                        f"El objetivo {g} («{ctx.goals[g].text}») no está cubierto por ninguna feature.",
                        "Planificar una feature para este objetivo, o decidir que ya no es un objetivo")
                for g, fs in cites.items() if not fs]
    return {
        "goals": [{"id": g.id, "text": g.text, "features": sorted(cites[g.id]), "covered": bool(cites[g.id])} for g in ctx.goals.values()],
        "decisions": [{"id": d.id, "title": d.title, "status": d.status, "date": d.date} for d in ctx.decisions.values()],
        "features_without_goal": sorted(no_goal),
        "findings": [{"rule": f.rule, "severity": f.severity.key, "ids": f.ids, "message": f.message, "fix": f.fix,
                      "location": {"file": f.loc.file, "line": f.loc.line}} for f in findings],
    }
