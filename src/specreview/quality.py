"""Requirement quality checks: ambiguity, testability, EARS form, acceptance criteria."""
from __future__ import annotations

import re

from . import ears
from .findings import Finding, Severity
from .model import Feature
from .text import LexicalSimilarity

# Quality attributes: untestable unless accompanied by a measurable threshold.
QUALITY_ATTRS = [
    "fast", "faster", "quick", "quickly", "slow", "responsive", "performant", "high-performance", "scalable",
    "scalability", "robust", "reliable", "secure", "user-friendly", "user friendly", "intuitive", "easy", "easily",
    "simple", "seamless", "seamlessly", "efficient", "efficiently", "lightweight", "flexible", "maintainable",
    "modern", "highly available", "real-time", "realtime", "friendly",
    "rápido", "rápida", "rápidamente", "escalable", "robusto", "seguro", "intuitivo", "amigable", "fácil",
    "eficiente", "flexible", "ágil",
]
# Vague wording that makes a requirement open to interpretation.
VAGUE = [
    "appropriately", "appropriate", "adequate", "adequately", "reasonable", "reasonably", "as needed",
    "as appropriate", "if necessary", "if needed", "etc", "and/or", "some", "several", "various", "minimal",
    "optimal", "optimally", "properly", "gracefully", "similar", "and so on", "as required", "as applicable",
    "adecuado", "adecuada", "adecuadamente", "apropiado", "apropiadamente", "razonable", "según sea necesario",
    "si es necesario", "y/o", "varios", "algunos", "correctamente",
]


def _rx(words):
    alts = sorted(words, key=len, reverse=True)
    return re.compile(r"(?<![\w-])(" + "|".join(re.escape(w) for w in alts) + r")(?![\w-])", re.I)


_QA, _VAGUE = _rx(QUALITY_ATTRS), _rx(VAGUE)
_METRIC = re.compile(r"\d")


def check_requirements(feature: Feature) -> list[Finding]:
    out: list[Finding] = []
    for r in feature.spec.requirements:
        text = r.text
        body = re.sub(r"\[NEEDS CLARIFICATION:.*?\]", "", text, flags=re.I | re.S)
        has_metric = bool(_METRIC.search(body))

        for q in r.clarifications:
            out.append(Finding("QUA004", Severity.BLOCKER, [r.id], r.loc,
                               f"{r.id} tiene una pregunta abierta [NEEDS CLARIFICATION]: «{q}»",
                               "Responderla con /speckit.clarify antes de planificar"))

        qa = sorted({m.group(1).lower() for m in _QA.finditer(body)})
        vague = sorted({m.group(1).lower() for m in _VAGUE.finditer(body)})
        if qa and not has_metric:
            out.append(Finding("QUA002", Severity.WARNING, [r.id], r.loc,
                               f"{r.id} no es testeable: usa {_q(qa)} sin un umbral medible.",
                               "Definir un número verificable (p. ej. «p95 < 300 ms», «≥ 99 % de …»)"))
        if vague:
            out.append(Finding("QUA001", Severity.WARNING, [r.id], r.loc,
                               f"{r.id} es ambiguo: {_q(vague)} deja la decisión al implementador.",
                               "Reemplazar por un comportamiento o valor concreto"))

        level = ears.normative(body)
        weak = ears.weak_words(body)
        if level == "none":
            out.append(Finding("QUA002", Severity.WARNING, [r.id], r.loc,
                               f"{r.id} no usa un verbo normativo (MUST/SHALL): no queda claro si es obligatorio ni cómo verificarlo.",
                               "Escribirlo como «System MUST …»"))
        elif level == "weak":
            out.append(Finding("QUA002", Severity.WARNING, [r.id], r.loc,
                               f"{r.id} usa lenguaje no vinculante ({_q(weak)}): no se puede decidir si se cumplió.",
                               "Usar MUST (obligatorio) o moverlo a Assumptions/ideas si es opcional"))
        else:
            pattern = ears.classify(body)
            hint = ears.suggest_rewrite_hint(body)
            if pattern == "none" or (pattern == "ubiquitous" and hint):
                out.append(Finding("QUA003", Severity.SUGGESTION, [r.id], r.loc,
                                   f"{r.id} no sigue un patrón EARS" + (" (centrado en el actor)." if hint and "actor" in hint else "."),
                                   hint or "Reescribir con un patrón EARS (ubicuo, evento, estado, no deseado u opcional)"))
            elif hint and pattern != "ubiquitous":
                pass
        if len(re.findall(rf"\b(?:{ears.STRONG})\b", body, flags=re.I)) >= 2:
            out.append(Finding("QUA007", Severity.SUGGESTION, [r.id], r.loc,
                               f"{r.id} contiene varios MUST: probablemente son varios requisitos en uno.",
                               "Separarlo en requisitos atómicos, cada uno con su criterio de aceptación"))
    return out


AC_CLEARLY_MISSING = 0.15   # below this, nothing in the acceptance criteria even resembles the requirement


def check_acceptance(feature: Feature, threshold: float = 0.30) -> list[Finding]:
    """Stories without scenarios, incomplete scenarios, and FRs no scenario/SC speaks about."""
    out: list[Finding] = []
    spec = feature.spec
    for st in spec.stories:
        if not st.scenarios:
            out.append(Finding("QUA005", Severity.WARNING, [st.id], st.loc,
                               f"La story {st.id} «{st.title}» no tiene Acceptance Scenarios: no hay forma de saber cuándo está terminada.",
                               "Agregar al menos un escenario Given/When/Then"))
        for sc in st.scenarios:
            missing = [k for k, v in (("Given", sc.given), ("When", sc.when), ("Then", sc.then)) if not v]
            if missing:
                out.append(Finding("QUA008", Severity.WARNING, [f"{st.id}.{sc.index}"], sc.loc,
                                   f"Escenario {st.id}.{sc.index} incompleto: falta {', '.join(missing)}.",
                                   "Completar Given/When/Then"))

    # An acceptance context = a story that HAS scenarios (title + description + scenarios), or an SC.
    # Stories without scenarios must not absolve requirements (that is QUA005's job).
    ac_texts = [(st.id, " ".join([st.title, st.body] + [sc.text for sc in st.scenarios]))
                for st in spec.stories if st.scenarios]
    ac_texts += [(f"{st.id}.{sc.index}", sc.text) for st in spec.stories for sc in st.scenarios]
    ac_texts += [(c.id, c.text) for c in spec.success_criteria]
    if not spec.requirements:
        return out
    sim = LexicalSimilarity([r.text for r in spec.requirements] + [t for _, t in ac_texts])
    for r in spec.requirements:
        explicit = any(re.search(rf"(?<![\w-]){re.escape(r.id)}(?![\w-])", t) for _, t in ac_texts)   # whole id, not FR-1 in FR-10
        best = max(((sim.similarity(r.text, t), i) for i, t in ac_texts), default=(0.0, ""))
        if not explicit and best[0] < threshold:
            clear = best[0] < AC_CLEARLY_MISSING     # borderline similarity may just be different wording
            out.append(Finding("QUA006", Severity.WARNING if clear else Severity.SUGGESTION, [r.id], r.loc,
                               f"{r.id} no tiene criterio de aceptación: ningún escenario ni Success Criterion lo verifica." if clear else
                               f"No encontré con claridad un criterio de aceptación para {r.id}: revisar que algún escenario o SC lo verifique.",
                               "Agregar un escenario Given/When/Then o un SC medible",
                               [f"más cercano: {best[1]} (similitud {best[0]:.2f})"] if best[1] else []))
    return out


def _q(words: list[str]) -> str:
    return ", ".join(f"«{w}»" for w in words)
