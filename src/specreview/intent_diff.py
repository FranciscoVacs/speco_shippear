"""What a change to the specs means for the business: the review a PR gets before anyone reads its lines.

Compares two copies of a repository (the PR's base and head) feature by feature and answers, per feature:
which requirements were added, removed or reworded, which values moved («10,000 USD → 15,000 USD»), which tasks and plan steps
implement what changed, and which blockers the PR introduces (the ones already on the base branch are not repeated).
It also carries what the person who decides asks before the requirements: what the change is for (its stories), how it will be
measured (its success criteria), what stays open (unanswered edge cases, assumptions), how much of it has tasks, the status the spec declares,
the goals and decisions it serves, and what the PR changes in the product layer itself (`product/goals.md`, `product/decisions.md`).
Pure: two directories in, data out. The cloud worker, the CLI and the MCP all render from here."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from . import suppress
from .analyzers import Context, run_all
from .contradictions import quantities
from .crossref import crossref
from .decision import summarize
from .findings import Finding, Severity
from .model import Feature, Loc
from .parser import load_feature
from .parser.loader import discover_features
from .product import ProductContext, load_product, spec_refs

MARKER = "<!-- speco:intent -->"
STATUS_OPEN, STATUS_CLOSE = "<!-- speco:status -->", "<!-- /speco:status -->"      # where the cloud writes whether someone has decided, so it can change later
WAITING = ("needs_decision", "blocked")                                            # the verdicts that ask a person to decide before building
MAX_AFFECTS = 5
MAX_ITEMS = 5                                                                      # per list of stories, criteria, questions or assumptions
VERDICT_LABEL = {"ready": "lista para construir", "needs_work": "necesita trabajo del equipo",
                 "blocked": "bloqueada", "needs_decision": "espera una decisión"}


@dataclass
class Affected:
    id: str            # T004 / P2
    kind: str          # task | plan
    text: str
    explicit: bool     # the task cites the requirement id; otherwise inferred from the text


@dataclass
class ReqChange:
    id: str
    kind: str                                  # added | removed | changed
    before: str | None
    after: str | None
    loc: Loc | None
    values: list[tuple[str, str]] = field(default_factory=list)
    affects: list[Affected] = field(default_factory=list)
    checked_by: list[str] | None = None        # what verifies it (docs/37); None = this repository does not trace verification


@dataclass
class FeatureDiff:
    key: str
    title: str
    is_new: bool
    changes: list[ReqChange]
    new_blockers: list[Finding]
    resolved_blockers: int
    verdict_before: str | None
    verdict_after: str
    status_before: str | None = None                       # the **Status** the spec declares; None when the feature is new
    status_after: str = ""
    stories: list[tuple[str, str | None, str]] = field(default_factory=list)   # (US1, P1, title) the PR adds
    questions: list[str] = field(default_factory=list)     # edge cases asked as a question and not answered, that the PR adds
    assumptions: list[str] = field(default_factory=list)   # that the PR adds
    tasks_done: int = 0
    tasks_total: int = 0
    serves: list[tuple[str, str]] = field(default_factory=list)   # (G-19 / D-020, its text) the spec starts citing in its header


@dataclass
class ProductChange:
    id: str            # G-19 / D-020
    kind: str          # added | changed | status
    text: str
    status: str = ""   # a decision's status after the PR
    status_before: str = ""


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _reqs(feat: Feature | None) -> dict:
    if not feat or not feat.spec:
        return {}
    return {r.id: r for r in feat.spec.requirements + feat.spec.success_criteria}


def moved_values(before: str, after: str) -> list[tuple[str, str]]:
    """Quantities of the same dimension that differ, paired in order of appearance."""
    a, b = quantities(before), quantities(after)
    out = []
    for dim in dict.fromkeys(d for d, _, _ in a):
        for (_, va, ra), (_, vb, rb) in zip([q for q in a if q[0] == dim], [q for q in b if q[0] == dim]):
            if va != vb:
                out.append((ra, rb))
    return out


def _affects(feat: Feature, rid: str) -> list[Affected]:
    xr = crossref(feat)
    texts = {t.id: ("task", t.text) for t in feat.tasks}
    texts.update({p.id: ("plan", p.text) for p in (feat.plan.items if feat.plan else [])})
    links = sorted(xr.for_req(rid), key=lambda l: (l.evidence != "explicit", -l.score))
    out, seen = [], set()
    for l in links:
        if l.target_id in seen or l.target_id not in texts:
            continue
        seen.add(l.target_id)
        kind, text = texts[l.target_id]
        out.append(Affected(l.target_id, kind, text, l.evidence == "explicit"))
    return out[:MAX_AFFECTS]


def _findings(feat: Feature | None) -> list[Finding]:
    return run_all(feat, Context()) if feat and feat.spec else []


def _cited(feat: Feature | None) -> set[str]:
    if not feat or not (feat.dir / "spec.md").is_file():
        return set()
    goals, decisions, _ = spec_refs(feat)
    return goals | decisions


def _serves(base: Feature | None, head: Feature, ctx: ProductContext | None) -> list[tuple[str, str]]:
    new = _cited(head) - _cited(base)
    text = {**{g.id: g.text for g in ctx.goals.values()}, **{d.id: d.title for d in ctx.decisions.values()}} if ctx else {}
    return [(i, text.get(i, "")) for i in sorted(new, key=lambda i: (i[0] != "G", int(i[2:])))]


def diff_feature(key: str, base: Feature | None, head: Feature, product: ProductContext | None = None) -> FeatureDiff | None:
    before, after = _reqs(base), _reqs(head)
    changes = []
    for rid, r in after.items():
        if rid not in before:
            changes.append(ReqChange(rid, "added", None, r.text, r.loc, affects=_affects(head, rid)))
        elif _norm(before[rid].text) != _norm(r.text):
            changes.append(ReqChange(rid, "changed", before[rid].text, r.text, r.loc,
                                     moved_values(before[rid].text, r.text), _affects(head, rid)))
    for rid, r in before.items():
        if rid not in after:
            changes.append(ReqChange(rid, "removed", r.text, None, r.loc, affects=_affects(base, rid)))
    hs, bs = head.spec, base.spec if base else None
    status_before = bs.status if bs else None
    known = {_norm(s.title) for s in bs.stories} if bs else set()
    stories = [(s.id, s.priority, s.title) for s in (hs.stories if hs else []) if _norm(s.title) not in known]
    questions = _added([e for e in (hs.edge_cases if hs else []) if e.rstrip().endswith("?")], bs.edge_cases if bs else [])
    assumptions = _added(hs.assumptions if hs else [], bs.assumptions if bs else [])
    status_after = hs.status if hs else ""
    serves = _serves(base, head, product)
    old, new = _findings(base), _findings(head)
    moved = base is not None and (status_before or "") != status_after
    if not (changes or moved or stories or questions or assumptions or serves) and _fps(old, key) == _fps(new, key):
        return None
    seen = _fps(old, key)
    new_blockers = [f for f in new if f.severity == Severity.BLOCKER and suppress.fingerprint(key, f) not in seen]
    still = _fps(new, key)
    resolved = sum(1 for f in old if f.severity == Severity.BLOCKER and suppress.fingerprint(key, f) not in still)
    title = (head.spec.title if head.spec else "") or key
    return FeatureDiff(key, title, base is None, changes, new_blockers, resolved,
                       summarize(old)["verdict"] if base else None, summarize(new)["verdict"],
                       status_before, status_after, stories, questions, assumptions,
                       sum(t.done for t in head.tasks), len(head.tasks), serves)


def _added(now: list[str], before: list[str]) -> list[str]:
    seen = {_norm(x) for x in before}
    return [x for x in now if _norm(x) not in seen]


def declared_done(status: str | None) -> bool:
    """The spec says it is already built, so «ready to build» would read as if nothing was."""
    return bool(status) and status.strip().lower().startswith("implemented")


def _fps(findings: list[Finding], key: str) -> set[str]:
    return {suppress.fingerprint(key, f) for f in findings}


def _load(d: Path | None) -> Feature | None:
    return load_feature(d) if d and (d / "spec.md").is_file() else None


def diff_trees(base_root: Path, head_root: Path) -> list[FeatureDiff]:
    """Every feature of `head_root` whose requirements or blockers differ from `base_root`. Features deleted by the PR are not reviewed."""
    base, head = discover_features(Path(base_root)), discover_features(Path(head_root))
    product = load_product(Path(head_root))
    out = []
    for key, hdir in sorted(head.items()):
        feat = _load(hdir)
        if feat is None:
            continue
        fd = diff_feature(key, _load(base.get(key)), feat, product)
        if fd:
            out.append(fd)
    return out


def diff_product(base_root: Path, head_root: Path) -> list[ProductChange]:
    """Goals and decisions the PR adds or rewords, and decisions whose status moves (proposed → accepted). Removed ones are not reviewed."""
    empty = ProductContext(Path())
    before, after = load_product(Path(base_root)) or empty, load_product(Path(head_root)) or empty
    out = []
    for g in after.goals.values():
        old = before.goals.get(g.id)
        if not old or _norm(old.text) != _norm(g.text):
            out.append(ProductChange(g.id, "changed" if old else "added", g.text))
    for d in after.decisions.values():
        old = before.decisions.get(d.id)
        if not old or _norm(old.title) != _norm(d.title):
            out.append(ProductChange(d.id, "changed" if old else "added", d.title, d.status))
        elif old.status != d.status:
            out.append(ProductChange(d.id, "status", d.title, d.status, old.status))
    return out


# ---------------------------------------------------------------------------------------------- the PR comment
def _quote(s: str, n: int = 160) -> str:
    s = _norm(s)
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _affects_md(ch: ReqChange) -> list[str]:
    if not ch.affects:
        return ["  - ⚠️ Ninguna tarea ni paso del plan lo implementa." if ch.kind != "removed" else ""]
    verb = "Siguen implementándolo" if ch.kind == "removed" else "Afecta a"
    items = ", ".join(f"`{a.id}` {_quote(a.text, 70)}" + ("" if a.explicit else " _(inferido)_") for a in ch.affects)
    out = [f"  - {verb}: {items}"]
    for a in stale(ch):
        out.append(f"  - ⚠️ `{a.id}` todavía dice «{next(old for old, _ in ch.values if old in a.text)}»: actualizarla antes de implementar.")
    return out


def stale(ch: ReqChange) -> list[Affected]:
    """Tasks and plan steps that still carry a value the PR changed: the agent would build the old rule."""
    return [a for a in ch.affects if any(old in a.text for old, _ in ch.values)]


def _checked_md(ch: ReqChange) -> list[str]:
    if ch.checked_by is None or ch.kind == "removed":
        return []
    if not ch.checked_by:
        return ["  - ⚠️ Ningún test, propiedad ni prueba cita este requisito."]
    stale_hint = " Cambió el requisito: revisá que siga comprobando lo nuevo." if ch.kind == "changed" else ""
    return [f"  - Verificado por: {', '.join(ch.checked_by)}.{stale_hint}"]


def _change_md(ch: ReqChange) -> list[str]:
    return [*_change_core(ch), *_checked_md(ch)]


def _change_core(ch: ReqChange) -> list[str]:
    if ch.kind == "changed":
        head = f"- **{ch.id} cambió**"
        if ch.values:
            head += ": " + "; ".join(f"**{a} → {b}**" for a, b in ch.values)
        return [head, f"  - Antes: «{_quote(ch.before)}»", f"  - Ahora: «{_quote(ch.after)}»", *_affects_md(ch)]
    if ch.kind == "added":
        return [f"- **{ch.id} nuevo**: «{_quote(ch.after)}»", *_affects_md(ch)]
    return [f"- **{ch.id} eliminado**: «{_quote(ch.before)}»", *[l for l in _affects_md(ch) if l]]


def _more(items: list[str], n: int = MAX_ITEMS) -> list[str]:
    return items[:n] + ([f"- … y {len(items) - n} más."] if len(items) > n else [])


def _intent_md(d: FeatureDiff) -> list[str]:
    """What it is for, how it is measured and what stays open: the questions of the person who decides, before the requirements."""
    out = []
    goals = [f"- **{i}** {_quote(t, 140)}" if t else f"- **{i}** _(no está en `product/`)_" for i, t in d.serves if i[0] == "G"]
    decisions = [i for i, _ in d.serves if i[0] == "D"]
    if goals or decisions:
        out += ["**A qué responde**", *_more(goals)]
        out += [f"- Decisiones que cita: {', '.join(decisions)}"] if decisions else []
        out.append("")
    if d.stories:
        out += ["**Qué resuelve**", *_more([f"- {p + ' · ' if p else ''}{_quote(t, 120)}" for _, p, t in d.stories]), ""]
    criteria = [c for c in d.changes if c.kind == "added" and c.id.startswith("SC-")] if d.is_new else []
    if criteria:
        out += ["**Cómo se va a medir**", *_more([f"- `{c.id}` {_quote(c.after)}" for c in criteria]), ""]
    if d.questions or d.assumptions:
        out += ["**Qué queda abierto**",
                *_more([f"- ❓ {_quote(q)}" for q in d.questions] + [f"- Supuesto: {_quote(a)}" for a in d.assumptions]), ""]
    return out


def _coverage_md(d: FeatureDiff) -> str:
    reqs = [c for c in d.changes if c.kind == "added" and not c.id.startswith("SC-")]   # criteria are measured, not built by a task
    bare = [c.id for c in reqs if not c.affects]
    line = f"**Cobertura:** {len(reqs)} requisito{'s' if len(reqs) != 1 else ''} funcional{'es' if len(reqs) != 1 else ''}"
    line += (", todos con tarea o paso del plan" if not bare else
             f", {len(bare)} sin tarea ni paso del plan ({', '.join(f'`{i}`' for i in bare[:8])}{'…' if len(bare) > 8 else ''})")
    if d.tasks_total:
        line += f" · {d.tasks_done}/{d.tasks_total} tareas hechas"
    return line + "."


_PRODUCT_WORD = {"G": ("Objetivo", "o"), "D": ("Decisión", "a")}


def _product_md(changes: list[ProductChange]) -> list[str]:
    out = []
    for c in changes:
        word, g = _PRODUCT_WORD[c.id[0]]
        status = f" · _{c.status}_" if c.id[0] == "D" and c.status else ""
        if c.kind == "status":
            out.append(f"- {word} **{c.id}**: _{c.status_before} → {c.status}_ · {_quote(c.text)}")
        else:
            out.append(f"- {word} {'nuev' + g if c.kind == 'added' else 'reescrit' + g} **{c.id}**{status}: {_quote(c.text)}")
    return ["### Producto", *_more(out, 10), ""]


def waits_for_decision(d: FeatureDiff) -> bool:
    """The version this change proposes cannot be built until a person decides (or the team fixes what blocks it)."""
    return d.verdict_after in WAITING


def with_status(body: str, status: str) -> str:
    """The comment with its status block replaced; a comment written without the block is returned as it is."""
    a, b = body.find(STATUS_OPEN), body.find(STATUS_CLOSE)
    if a < 0 or b < a:
        return body
    return body[: a + len(STATUS_OPEN)] + "\n" + status + "\n" + body[b:]


def values_md(moved: list[dict], subject: str = "Esta PR", links: dict[str, str] | None = None) -> list[str]:
    """029: decided numbers this change moves in the code while the rule still says another; 031: with the link to decide them."""
    if not moved:
        return []
    out = [f"### ⚠️ {subject} mueve {'un número' if len(moved) == 1 else f'{len(moved)} números'} que decidió producto", ""]
    for v in moved:
        was = f" (antes {v['before']})" if v.get("before") else ""
        out.append(f"- **`{v['rule']}`** dice **{' / '.join(v['expected']) or '—'}**; `{v['file']}:{v['line']}` pasa a **{v['found']}**{was}.")
        out.append(f"  > {_quote(v['text'])}")
    out += ["", "Si el cambio es a propósito, cambien primero la regla (y que alguien la decida); si no, el código vuelve al número decidido.", ""]
    for key in dict.fromkeys(v["rule"].split("/", 1)[0] for v in moved):
        if links and key in links:
            out += [f"**[Decidir en Speco →]({links[key]})** `{key}`", ""]
    return out


def render_comment(diffs: list[FeatureDiff], max_changes: int = 15, subject: str = "Esta PR", cta: str = "",
                   links: dict[str, str] | None = None, status: str | None = None, product: list[ProductChange] | None = None,
                   values: list[dict] | None = None, edited: list[dict] | None = None) -> str:
    """`links` maps a feature key to where its decision is made; `status` (even empty) opens the block `with_status` can rewrite later;
    `product` is what `diff_product` found in the goals and decisions; `values` are the decided numbers the change moves in the code (spec 029);
    `edited` are the rules whose citing tests the change edits (032/FR-006)."""
    lines = [MARKER, "## Speco · qué cambia en el negocio", ""]
    if status is not None:
        lines += [STATUS_OPEN, status, STATUS_CLOSE, ""]
    lines += values_md(values or [], subject, links)
    if edited:
        from .strength import edited_md
        lines += edited_md(edited, subject)
    if not diffs and not product:
        if values or edited:
            return "\n".join(lines) + "\n"
        return "\n".join(lines + [f"{subject} no cambia ninguna spec: no hay intención que revisar."]) + "\n"
    blockers = sum(len(d.new_blockers) for d in diffs)
    if diffs:
        head = f"{subject} cambia la intención de **{len(diffs)}** feature{'s' if len(diffs) != 1 else ''}"
        lines += [head + (f" e introduce **{blockers} bloqueante{'s' if blockers != 1 else ''}**." if blockers else " sin bloqueantes nuevos."), ""]
    else:
        lines += [f"{subject} no cambia ninguna feature, pero sí los objetivos o las decisiones del producto.", ""]
    if product:
        lines += _product_md(product)
    for d in diffs:
        verdict = VERDICT_LABEL.get(d.verdict_after, d.verdict_after)
        if d.verdict_after == "ready" and declared_done(d.status_after):
            verdict = "sin hallazgos"                                      # it is not waiting to be built: the spec says it already was
        state = f"nueva · {verdict}" if d.is_new else (
            verdict if d.verdict_before == d.verdict_after else f"{VERDICT_LABEL.get(d.verdict_before, d.verdict_before)} → {verdict}")
        if d.status_after and (d.is_new or d.status_before == d.status_after):
            state += f" · la spec dice: {_quote(d.status_after, 90)}"
        lines += [f"### `{d.key}` · {d.title}", f"_{state}_", ""]
        if not d.is_new and d.status_before != d.status_after:
            lines += [f"**Estado:** «{_quote(d.status_before or '—', 90)}» → «{_quote(d.status_after or '—', 90)}»", ""]
        if links and d.key in links and waits_for_decision(d):
            lines += [f"**[Decidir en Speco →]({links[d.key]})**", ""]
        lines += _intent_md(d)
        shown = d.changes if not d.is_new else []
        for ch in shown[:max_changes]:
            lines += _change_md(ch)
        if d.is_new:
            lines.append(_coverage_md(d))
        elif len(shown) > max_changes:
            lines.append(f"- … y {len(shown) - max_changes} cambios más.")
        if d.new_blockers:
            lines += ["", f"**Bloqueantes que trae {subject.lower()}**"]
            lines += [f"- `{f.rule}` {' + '.join(f.ids)}: {f.message}" + (f" ↳ {f.fix}" if f.fix else "") for f in d.new_blockers]
        if d.resolved_blockers:
            lines += ["", f"✅ Resuelve {d.resolved_blockers} bloqueante{'s' if d.resolved_blockers != 1 else ''} que había antes."]
        lines.append("")
    if cta:
        lines += [cta, ""]
    lines.append("<sub>Speco revisa la intención antes que el código. _(inferido)_ = relación deducida del texto, no citada.</sub>")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)) + "\n"
