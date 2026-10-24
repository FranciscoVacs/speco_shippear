"""Spec 016 · the second door. A person says what they want in their own words; Speco asks what matters, one question at a time, keeps what
they decided (or that they cannot decide yet) and gives them a brief to paste into the AI tool they build with.

Deterministic on purpose (D-003): no model is involved, so it costs nothing, works offline and gives the same questions for the same words.
Plain words (FR-010): nothing a person sees here says repository, commit, pull request or requirement."""
from __future__ import annotations

import re
import unicodedata

MAX_QUESTIONS = 7

_STRIP_NEED = re.compile(r"^(quiero que|quiero|queremos que|queremos|necesito que|necesito|necesitamos que|necesitamos|me gustaria que|me gustaria|nos gustaria que|nos gustaria|i want|we want|i need|we need|i would like)\s+", re.I)
_VAGUE = re.compile(r"\b(rapid[oa]s?|rapido|pronto|facil(es)?|simple(s)?|seguro|segura|intuitiv[oa]|fast|quick(ly)?|easy|secure|soon)\b")


def _fold(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


# id -> (words that make it worth asking, {lang: (question, example)})
_TOPICS: list[tuple[str, re.Pattern | None, dict[str, tuple[str, str]]]] = [
    ("who", None, {
        "es": ("¿Quién puede hacerlo y qué pasa con el resto?", "Por ejemplo: solo quien administra la cuenta; los demás ven el resultado pero no lo cambian."),
        "en": ("Who can do it, and what happens for everyone else?", "For example: only the account admin; everyone else sees the result but cannot change it.")}),
    ("limits", None, {
        "es": ("¿Hay límites de cantidad, de tiempo o de costo?", "Por ejemplo: hasta 5 por día; vence a los 30 días; gratis hasta 100 usuarios."),
        "en": ("Are there limits on amount, time or cost?", "For example: up to 5 per day; expires after 30 days; free up to 100 users.")}),
    ("money", re.compile(r"\b(pag\w*|cobr\w*|precio\w*|tarifa\w*|comision\w*|plan(es)?|suscrip\w*|factur\w*|reembols\w*|descuent\w*|payment\w*|price\w*|fee\w*|charge\w*|bill\w*|refund\w*|discount\w*|subscri\w*)\b"), {
        "es": ("¿Cuánto cuesta, quién paga y qué pasa si se devuelve?", "Por ejemplo: paga quien lo pide, 10 USD por uso; si lo cancela en 14 días se le devuelve todo."),
        "en": ("How much does it cost, who pays, and what happens on a refund?", "For example: the person who asks pays 10 USD per use; if they cancel within 14 days they get everything back.")}),
    ("people", re.compile(r"\b(datos|usuari\w*|cliente\w*|perfil\w*|persona\w*|email|mail|telefono|privacidad|data|user\w*|customer\w*|profile\w*|privacy|phone)\b"), {
        "es": ("¿Qué datos de las personas se guardan, y por cuánto tiempo?", "Por ejemplo: nombre y mail; se borran a pedido y a los 2 años sin uso."),
        "en": ("What information about people is kept, and for how long?", "For example: name and email; deleted on request and after 2 years of no use.")}),
    ("notify", re.compile(r"\b(avis\w*|notific\w*|alert\w*|recordatorio\w*|mensaje\w*|push|sms|notify|notification\w*|remind\w*|message\w*)\b"), {
        "es": ("¿A quién se avisa, cuándo y por qué medio?", "Por ejemplo: a quien lo pidió, apenas termina, por mail; a quien administra, una vez por día."),
        "en": ("Who is told, when and how?", "For example: the person who asked, as soon as it finishes, by email; the admin, once a day.")}),
    ("fails", None, {
        "es": ("¿Qué debería pasar cuando no se puede completar o alguien lo rechaza?", "Por ejemplo: se avisa a quien lo pidió, queda guardado y se puede reintentar."),
        "en": ("What should happen when it cannot be completed or someone rejects it?", "For example: the requester is told, it is kept, and it can be retried.")}),
    ("clash", None, {
        "es": ("¿Choca con algo que ya decidieron? (reglas actuales, planes, permisos)", "Por ejemplo: hoy el plan gratis no incluye esto; hay que decidir si cambia."),
        "en": ("Does it clash with anything you already decided? (current rules, plans, permissions)", "For example: today the free plan does not include this; decide whether that changes.")}),
    ("verify", None, {
        "es": ("¿Cómo van a saber que funciona? Un número o un resultado que se pueda comprobar.", "Por ejemplo: el 95 % de los pedidos termina en menos de 10 segundos."),
        "en": ("How will you know it works? A number or an outcome you can check.", "For example: 95% of requests finish in under 10 seconds.")}),
]
_VAGUE_Q = {
    "es": ("«{w}» no se puede comprobar tal cual: ¿cuál es el número?", "Por ejemplo: en menos de 3 segundos; con 1 clic; sin que se pueda hacer sin permiso."),
    "en": ("“{w}” cannot be checked as written: what is the number?", "For example: in under 3 seconds; with 1 click; impossible without permission."),
}


def title_of(need: str) -> str:
    core = _STRIP_NEED.sub("", need.strip()).strip()
    words = core.split()
    out = " ".join(words[:7]) + ("…" if len(words) > 7 else "")
    return (out[:1].upper() + out[1:])[:120] or need.strip()[:120]


def questions_for(need: str, lang: str = "es") -> list[dict]:
    """The questions this idea has to answer, in the order they are asked. Always the same for the same words."""
    lang = "en" if lang == "en" else "es"
    folded = _fold(need)
    out: list[dict] = []
    vague = _VAGUE.search(folded)
    if vague:
        ask, example = _VAGUE_Q[lang]
        written = need[vague.start():vague.end()].lower()                      # the word as the person wrote it, accent included, when the positions line up
        out.append({"id": "vague", "ask": ask.format(w=written if _fold(written) == vague.group(0) else vague.group(0)), "example": example})
    for tid, words, text in _TOPICS:
        if words is None or words.search(folded):
            ask, example = text[lang]
            out.append({"id": tid, "ask": ask, "example": example})
    # too many: the questions every idea needs stay, and the ones that only apply to some words go, the last first
    for tid in reversed([t for t, w, _ in _TOPICS if w is not None]):
        if len(out) <= MAX_QUESTIONS:
            break
        out = [q for q in out if q["id"] != tid]
    return out


def progress(idea: dict) -> dict:
    """How far along the person is: how many questions are decided, how many they could not decide, and the first one left to ask."""
    answers = idea["answers"] or {}
    state = {q["id"]: (answers.get(q["id"]) or {}).get("state") for q in idea["questions"]}
    nxt = next((q["id"] for q in idea["questions"] if state[q["id"]] is None), None)
    return {"total": len(state), "answered": sum(1 for s in state.values() if s == "answered"), "unknown": sum(1 for s in state.values() if s == "unknown"),
            "next": nxt, "done": nxt is None}


_L = {
    "es": {"decided": "Lo que ya decidí", "open": "Lo que todavía no está decidido", "open_note": "No lo adivines: preguntame antes de construirlo.",
           "want": "Qué quiero construir", "rules": "Cómo quiero que trabajes",
           "r1": "No inventes reglas de negocio. Si algo no está decidido arriba, preguntame antes de construirlo.",
           "r2": "Si una decisión de arriba choca con otra, avisame en vez de elegir una.",
           "r3": "Cuando termines, decime qué hiciste que no estaba en esta lista.", "risk": "RIESGO: sin decidir", "none": "(nada todavía)"},
    "en": {"decided": "What I already decided", "open": "What is not decided yet", "open_note": "Do not guess: ask me before building it.",
           "want": "What I want to build", "rules": "How I want you to work",
           "r1": "Do not invent business rules. If something is not decided above, ask me before building it.",
           "r2": "If two decisions above clash, tell me instead of picking one.",
           "r3": "When you finish, tell me what you did that was not on this list.", "risk": "RISK: undecided", "none": "(nothing yet)"},
}


def brief(idea: dict) -> str:
    """Plain text to paste into the AI tool the person builds with: what they want, what they decided, and what they must not let it guess."""
    t = _L["en" if idea["lang"] == "en" else "es"]
    answers = idea["answers"] or {}
    decided = [f"- {q['ask']} → {answers[q['id']]['text']}" for q in idea["questions"] if (answers.get(q["id"]) or {}).get("state") == "answered"]
    undecided = [f"- {q['ask']}" for q in idea["questions"] if (answers.get(q["id"]) or {}).get("state") != "answered"]
    lines = [f"# {t['want']}", idea["need"].strip(), "", f"# {t['decided']}", *(decided or [t["none"]])]
    if undecided:
        lines += ["", f"# {t['open']} ({t['open_note']})", *undecided]
    lines += ["", f"# {t['rules']}", f"- {t['r1']}", f"- {t['r2']}", f"- {t['r3']}"]
    return "\n".join(lines) + "\n"


def spec_markdown(idea: dict) -> str:
    """The same decisions as a Spec Kit spec, so the review engine can read it. A question nobody decided is an open question, which the engine flags as a risk."""
    t = _L["en" if idea["lang"] == "en" else "es"]
    answers = idea["answers"] or {}
    core = _STRIP_NEED.sub("", idea["need"].strip()).strip()
    lines = [f"# Feature Specification: {idea['title']}", "", "## User Scenarios & Testing", "", "### User Story 1 (Priority: P1)", idea["need"].strip(), "",
             "**Acceptance Scenarios**:", "1. **Given** the need above, **When** it is used, **Then** every decision below holds", "", "## Requirements", "",
             f"- **FR-001**: The system MUST {core[:1].lower() + core[1:]}"]
    for n, q in enumerate(idea["questions"], 2):
        a = answers.get(q["id"]) or {}
        if a.get("state") == "answered":
            lines.append(f"- **FR-{n:03d}**: {q['ask']} {a['text']}")
        else:
            lines.append(f"- **FR-{n:03d}**: [NEEDS CLARIFICATION: {q['ask']}]")
    return "\n".join(lines) + "\n"
