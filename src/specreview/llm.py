"""Replaceable model layer. The core never imports a vendor SDK; it only talks to `LLMClient`.

To use another provider, implement `complete(system, user) -> str` and pass it to `run_all(..., llm=...)`.
"""
from __future__ import annotations

import json
import re
from typing import Iterator, Protocol

from .model import Requirement


class LLMClient(Protocol):
    def complete(self, system: str, user: str) -> str: ...


class ChatLLM(Protocol):
    """Streaming multi-turn chat (used by the assistant). `messages` = [{"role": "user"|"assistant", "content": str}]."""
    provider: str
    model: str
    demo: bool

    def chat(self, system: str, messages: list[dict]) -> Iterator[str]: ...


class AnthropicClient:
    """Optional adapter (pip install 'specreview[anthropic]'). Reads ANTHROPIC_API_KEY from the environment."""

    provider = "anthropic"
    demo = False
    choosable = True                      # accepts a model and an effort per turn (see models.py)

    def __init__(self, model: str = "claude-sonnet-5-5", max_tokens: int = 2000):
        import anthropic  # lazy: core has no vendor dependency
        self._client = anthropic.Anthropic()
        self.model, self.max_tokens = model, max_tokens

    def chat(self, system: str, messages: list[dict], *, model: str | None = None, effort: str | None = None,
             max_tokens: int | None = None) -> Iterator[str]:
        """`model`/`effort`/`max_tokens` come from a validated choice of the composer; without them the call is exactly what it always was.
        Thinking counts against max_tokens, so a higher effort comes with more room (models.EFFORT_MAX_TOKENS)."""
        extra = {"output_config": {"effort": effort}} if effort else {}
        with self._client.messages.stream(model=model or self.model, max_tokens=max_tokens or self.max_tokens * 2, system=system,
                                          messages=messages, **extra) as stream:
            yield from stream.text_stream

    def complete(self, system: str, user: str) -> str:
        resp = self._client.messages.create(model=self.model, max_tokens=self.max_tokens, system=system,
                                            messages=[{"role": "user", "content": user}])
        return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")


_SYSTEM = ("You review software requirements. Find pairs that cannot both be satisfied. "
           "Answer ONLY with JSON: a list of {\"a\": id, \"b\": id, \"why\": short reason}. Empty list if none.")


def llm_contradictions(reqs: list[Requirement], llm: LLMClient) -> list[tuple[str, str, str]]:
    listing = "\n".join(f"{r.id}: {r.text}" for r in reqs)
    raw = llm.complete(_SYSTEM, listing)
    m = re.search(r"\[.*\]", raw, re.S)
    if not m:
        return []
    try:
        items = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    return [(str(i["a"]), str(i["b"]), str(i.get("why", ""))) for i in items if isinstance(i, dict) and "a" in i and "b" in i]


_COVER_SYS = ("You trace software requirements to implementation work. Given ONE requirement and a list of candidate "
              "plan items / tasks, answer ONLY with a JSON list of the candidate ids that, alone or together, "
              "implement or verify that requirement. Empty list if none does. Do not invent ids.")
_JUSTIFY_SYS = ("You detect scope creep. Given ONE task (or plan step) and a list of requirements, answer ONLY with a "
                "JSON list of requirement ids that justify it. Empty list if the work is not justified by any requirement. "
                "Generic engineering work needed to deliver a requirement (tests, endpoints, styling) counts as justified.")


def _ids(raw: str, allowed: set[str]) -> list[str]:
    m = re.search(r"\[.*?\]", raw, re.S)
    if not m:
        return []
    try:
        vals = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    return [str(v) for v in vals if str(v) in allowed]          # never trust ids the model made up


def llm_covering(req: tuple[str, str], candidates: list[tuple[str, str]], llm: LLMClient) -> list[str]:
    """Which candidates implement the requirement? (resolves lexical 'uncertain'/'gap' cases)"""
    listing = "\n".join(f"{i}: {t}" for i, t in candidates)
    raw = llm.complete(_COVER_SYS, f"Requirement {req[0]}: {req[1]}\n\nCandidates:\n{listing}")
    return _ids(raw, {i for i, _ in candidates})


def llm_justifying(item: tuple[str, str], reqs: list[tuple[str, str]], llm: LLMClient) -> list[str]:
    """Which requirements justify this task/plan step? (empty = scope creep)"""
    listing = "\n".join(f"{i}: {t}" for i, t in reqs)
    raw = llm.complete(_JUSTIFY_SYS, f"Task {item[0]}: {item[1]}\n\nRequirements:\n{listing}")
    return _ids(raw, {i for i, _ in reqs})


class DemoClient:
    """Offline stand-in so the assistant UI can be seen without an API key. NOT a judge: its answers are canned."""
    provider = "demo"
    model = "demo"
    demo = True

    def complete(self, system: str, user: str) -> str:      # never used for analysis (see server.make_server)
        return "[]"

    def chat(self, system: str, messages: list[dict]) -> Iterator[str]:
        last = messages[-1]["content"] if messages else ""
        if len(last) > 120:                                    # shorten at a word boundary, never mid-word
            last = last[:120].rsplit(" ", 1)[0] + "…"
        focus = re.search(r"<focus>(.*?)</focus>", system, re.S)
        about = f" sobre {focus.group(1).strip()}" if focus else ""
        text = (f"[modo demo] Esta respuesta es de ejemplo y no viene de un modelo.{about}\n\n"
                f"Recibí: «{last}».\n\n"
                "Con un modelo real, acá propondría una reescritura concreta del requisito (por ejemplo en formato EARS: "
                "«When <evento>, the system MUST <respuesta medible>»), los criterios de aceptación que faltan y las "
                "preguntas que hay que cerrar con el equipo de producto.")
        for i in range(0, len(text), 12):                    # stream in small chunks, like a real model
            yield text[i:i + 12]
