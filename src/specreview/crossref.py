"""Bidirectional requirement <-> plan/tasks cross-reference and gap detection.

Evidence layers, strongest first:
  explicit  the text cites FR-001
  lexical   TF-IDF cosine or IDF-weighted recall above threshold
  llm       an optional model judged it (only consulted for non-confident cases)
Coverage has three states: covered / uncertain / gap. Only a *confident* gap is a blocker; "uncertain" is a
low-severity prompt to verify. Weak evidence may absolve a task of scope creep but never covers a requirement
(docs/03-decisions D9). Calibrated on a real implemented Spec Kit repo, see docs/04-real-repo-calibration.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .findings import Finding, Severity
from .model import Feature, Loc
from .text import LexicalSimilarity, Similarity, content_words, tokens

DEFAULT_THRESHOLD = 0.35     # cosine to call a pair linked
RECALL_LINK = 0.50           # share of the requirement's weighted terms found in one task/plan item
GAP_STRONG = 0.30            # best single-item evidence below this ...
GAP_UNION = 0.45             # ... and terms spread over all items below this => confident gap
CREEP_STRONG = 0.60          # weighted share of a task's words that are new to the spec => warning (else suggestion)
LLM_CANDIDATES = 8


@dataclass
class Link:
    req_id: str
    target_id: str            # T012 / P3
    target_kind: str          # task | plan
    score: float
    evidence: str             # explicit | lexical | llm


@dataclass
class CrossRef:
    links: list[Link] = field(default_factory=list)
    best: dict[str, tuple[float, str]] = field(default_factory=dict)   # req_id -> (strongest evidence, target id)
    state: dict[str, str] = field(default_factory=dict)                # req_id -> covered | uncertain | gap
    unmapped_tasks: dict[str, tuple[list[str], float]] = field(default_factory=dict)  # id -> (novel words, novelty 0..1)
    unmapped_plan: dict[str, tuple[list[str], float]] = field(default_factory=dict)
    unknown_refs: list[tuple[str, str, Loc]] = field(default_factory=list)
    llm_calls: int = 0
    traceable: bool = False                       # the team cites FR-ids in plan/tasks: absence of a cite is informative
    llm_confirmed_gaps: set[str] = field(default_factory=set)

    def for_req(self, rid: str, kind: str | None = None) -> list[Link]:
        return [l for l in self.links if l.req_id == rid and (kind is None or l.target_kind == kind)]


def _spec_vocab(feature: Feature) -> set[str]:
    spec = feature.spec
    parts = [r.text for r in spec.requirements + spec.success_criteria]
    for st in spec.stories:
        parts += [st.title, st.body, st.independent_test] + [s.text for s in st.scenarios]
    parts += list(spec.entities) + list(spec.entities.values()) + spec.assumptions + spec.edge_cases
    parts += [c.question + " " + c.answer for c in spec.clarifications]
    return {t for p in parts for t in tokens(p)}


def crossref(feature: Feature, sim: Similarity | None = None, threshold: float = DEFAULT_THRESHOLD,
             llm=None, max_llm_calls: int = 60) -> CrossRef:
    spec = feature.spec
    reqs = spec.requirements + spec.success_criteria
    fr_ids = {r.id for r in spec.requirements}
    req_ids = {r.id for r in reqs}
    plan_items = feature.plan.items if feature.plan else []
    tasks = feature.tasks

    corpus = [r.text for r in reqs] + [t.text for t in tasks] + [i.text for i in plan_items]
    corpus += [st.title + " " + st.body for st in spec.stories]
    lex = LexicalSimilarity(corpus)
    sim = sim or lex

    xr = CrossRef()
    targets = ([("task", t.id, t.text, t.refs, t.loc) for t in tasks]
               + [("plan", i.id, i.text, i.refs, i.loc) for i in plan_items])
    kind_of = {tid: kind for kind, tid, *_ in targets}
    text_of = {tid: text for _, tid, text, *_ in targets}
    union_terms: set[str] = set()
    for _, _, text, *_ in targets:
        union_terms |= set(tokens(text))

    for kind, tid, text, refs, loc in targets:
        for ref in refs:
            if ref not in req_ids:
                xr.unknown_refs.append((tid, ref, loc))

    for r in reqs:
        strongest = (0.0, "")
        for kind, tid, text, refs, loc in targets:
            if r.id in refs:
                xr.links.append(Link(r.id, tid, kind, 1.0, "explicit"))
                strongest = max(strongest, (1.0, tid))
                continue
            cos = sim.similarity(r.text, text)
            rec = lex.recall(r.text, text)
            if cos >= threshold or rec >= RECALL_LINK:
                xr.links.append(Link(r.id, tid, kind, round(max(cos, rec), 2), "lexical"))
            strongest = max(strongest, (max(cos, rec), tid))
        xr.best[r.id] = (round(strongest[0], 2), strongest[1])
        if r.id not in fr_ids:
            continue
        if xr.for_req(r.id):
            xr.state[r.id] = "covered"
            continue
        rt = set(tokens(r.text))
        total = sum(lex.weight(t) for t in rt)
        union = sum(lex.weight(t) for t in rt & union_terms) / total if total else 0.0
        confident_gap = strongest[0] < GAP_STRONG and union < GAP_UNION
        xr.state[r.id] = "gap" if confident_gap else "uncertain"

    xr.traceable = any(l.evidence == "explicit" for l in xr.links)

    if llm is not None:                                   # the model arbitrates every non-covered requirement
        from .llm import llm_covering
        for r in spec.requirements:
            if xr.state.get(r.id) == "covered" or xr.llm_calls >= max_llm_calls:
                continue
            ranked = sorted(targets, key=lambda x: -lex.similarity(r.text, x[2]))[:LLM_CANDIDATES]
            xr.llm_calls += 1
            for tid in llm_covering((r.id, r.text), [(t[1], t[2]) for t in ranked], llm):
                xr.links.append(Link(r.id, tid, kind_of[tid], 1.0, "llm"))
            xr.state[r.id] = "covered" if xr.for_req(r.id) else "gap"
            if xr.state[r.id] == "gap":
                xr.llm_confirmed_gaps.add(r.id)

    vocab = _spec_vocab(feature)
    linked = {l.target_id for l in xr.links}

    def novelty(text: str) -> tuple[list[str], float]:
        cw = content_words(text)
        total = sum(lex.weight(s) for s in cw)
        new = [(s, w) for s, w in cw.items() if s not in vocab]
        if not new or not total:
            return [], 0.0
        return [w for _, w in new], sum(lex.weight(s) for s, _ in new) / total

    def judge(tid: str, text: str) -> bool:
        """True if the model finds a requirement that justifies this item."""
        from .llm import llm_justifying
        xr.llm_calls += 1
        ranked = sorted(spec.requirements, key=lambda r: -lex.similarity(text, r.text))[:LLM_CANDIDATES * 2]
        return bool(llm_justifying((tid, text), [(r.id, r.text) for r in ranked], llm))

    for t in tasks:
        if t.id in linked or (t.phase_kind in ("setup", "foundational", "polish") and not t.story):
            continue                                       # D4: shared infrastructure is not scope creep
        nov, frac = novelty(t.text)
        if not nov:
            continue
        if llm is not None and xr.llm_calls < max_llm_calls and judge(t.id, t.text):
            continue
        xr.unmapped_tasks[t.id] = (nov, frac)
    for i in plan_items:
        if i.id in linked:
            continue
        nov, frac = novelty(i.text)
        if not nov:
            continue
        if llm is not None and xr.llm_calls < max_llm_calls and judge(i.id, i.text):
            continue
        xr.unmapped_plan[i.id] = (nov, frac)
    return xr


def coverage_findings(feature: Feature, xr: CrossRef) -> list[Finding]:
    out: list[Finding] = []
    spec = feature.spec
    has_plan, has_tasks = feature.plan is not None, feature.has_tasks_file
    if not has_plan and not has_tasks:
        return [Finding("COV000", Severity.BLOCKER, [feature.name], Loc("spec.md"),
                        "No hay plan.md ni tasks.md: no se puede verificar que los requisitos tengan implementación.",
                        "Correr /speckit.plan y /speckit.tasks")]

    for r in spec.requirements:
        task_links, plan_links = xr.for_req(r.id, "task"), xr.for_req(r.id, "plan")
        state = xr.state.get(r.id, "gap")
        sc, tid = xr.best.get(r.id, (0.0, ""))
        ev = [f"más cercano: {tid} (similitud {sc:.2f})"] if tid else []
        if state == "gap":
            # D19: text similarity alone is not enough to BLOCK; explicit traceability or a model's confirmation is.
            firm = xr.traceable or r.id in xr.llm_confirmed_gaps
            why = "" if firm else " (según similitud de texto; no hay trazabilidad explícita FR-### para confirmarlo)"
            out.append(Finding("COV001", Severity.BLOCKER if firm else Severity.WARNING, [r.id], r.loc,
                               f"{r.id} no tiene correlato en el plan ni en las tasks: nadie lo va a implementar{why}." if firm else
                               f"{r.id} parece no tener correlato en el plan ni en las tasks{why}.",
                               "Agregar el paso/task que lo implementa (citando " + r.id + "), o quitar el requisito si ya no aplica"
                               + ("" if firm else "; con --llm un modelo puede confirmarlo"), ev))
        elif state == "uncertain":
            out.append(Finding("COV006", Severity.SUGGESTION, [r.id], r.loc,
                               f"No pude confirmar que {r.id} esté implementado: ningún paso o task lo describe con claridad.",
                               f"Citar {r.id} en la task que lo implementa (o correr con --llm para que un modelo lo verifique)", ev))
        elif has_tasks and not task_links:
            out.append(Finding("COV004", Severity.WARNING, [r.id], r.loc,
                               f"{r.id} figura en el plan ({plan_links[0].target_id}) pero ninguna task lo implementa.",
                               "Agregar la task correspondiente en tasks.md",
                               [f"{l.target_id} ({l.evidence} {l.score:.2f})" for l in plan_links]))

    task_by_id = {t.id: t for t in feature.tasks}
    for tid, (nov, frac) in xr.unmapped_tasks.items():
        t = task_by_id[tid]
        sev = Severity.WARNING if frac >= CREEP_STRONG else Severity.SUGGESTION
        out.append(Finding("COV002", sev, [tid], t.loc,
                           f"{tid} no responde a ningún requisito (introduce: {', '.join(nov[:4])}): posible scope que se coló.",
                           "Agregar el requisito que lo justifica o eliminar la task",
                           [t.text[:140], f"novedad {frac:.0%}"]))
    item_by_id = {i.id: i for i in (feature.plan.items if feature.plan else [])}
    for pid, (nov, frac) in xr.unmapped_plan.items():
        i = item_by_id[pid]
        sev = Severity.WARNING if frac >= CREEP_STRONG else Severity.SUGGESTION
        out.append(Finding("COV003", sev, [pid], i.loc,
                           f"El plan incluye «{_clip(i.text)}» ({pid}) que no responde a ningún requisito (introduce: {', '.join(nov[:4])}).",
                           "Agregar el requisito que lo justifica o sacarlo del plan", [f"novedad {frac:.0%}"]))
    for src, ref, loc in xr.unknown_refs:
        out.append(Finding("COV005", Severity.WARNING, [src, ref], loc,
                           f"{src} cita {ref}, que no existe en spec.md.", "Corregir la referencia"))
    return out


def _clip(s: str, n: int = 70) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"
