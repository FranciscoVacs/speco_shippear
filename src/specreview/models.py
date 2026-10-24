"""Which models the assistant may use per turn, and how hard each may think. One list for the local server and the cloud service, so the
composer's choice (model + effort) is validated in exactly one place: a client can only ever select what the operator turned on.

The operator opts in (`SPECO_MODELS=claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5` or `--models`); with nothing configured no choice is
advertised and the assistant behaves as before: one model, the provider's default effort."""
from __future__ import annotations

from dataclasses import dataclass

EFFORTS = ("low", "medium", "high")

# What one answer may produce (thinking counts against it). Bigger effort, bigger room; the cost ceiling of a turn follows from it.
EFFORT_MAX_TOKENS = {"low": 4_000, "medium": 8_000, "high": 16_000}
NO_EFFORT_MAX_TOKENS = 4_000

# The credit calibration of spec 020 (10 000 tokens per credit) was made on a model that costs this much per million input tokens.
BASE_INPUT_PRICE = 2.00


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    tier: str                            # fast | balanced | deep: what the composer shows as the hint
    input_price: float                   # USD per million input tokens (output costs five times as much on every model here)
    efforts: tuple[str, ...] = EFFORTS   # empty = the model has no effort setting

    @property
    def weight(self) -> float:
        """How many credits a token of this model costs, relative to the model the credits were calibrated on."""
        return self.input_price / BASE_INPUT_PRICE

    def public(self) -> dict:
        return {"id": self.id, "label": self.label, "tier": self.tier, **({"efforts": list(self.efforts)} if self.efforts else {})}


# Prices are an assumption to verify against the provider's current list (docs/25-free-plan-credits.md).
CATALOG: dict[str, ModelSpec] = {m.id: m for m in (
    ModelSpec("claude-haiku-5-5", "Haiku 5.5", "fast", 0.10),
    ModelSpec("claude-sonnet-5-5", "Sonnet 5.5", "balanced", 2.00),
    ModelSpec("claude-opus-5-5", "Opus 5.5", "deep", 4.00),
)}


class ChoiceError(ValueError):
    """The request asked for something the operator did not offer. The message is safe to show."""


@dataclass(frozen=True)
class Choice:
    model: str
    effort: str | None
    max_tokens: int
    weight: float

    def kwargs(self) -> dict:
        """What the model client takes on top of (system, messages)."""
        return {"model": self.model, "effort": self.effort, "max_tokens": self.max_tokens}


def parse_models(value: str | None) -> tuple[str, ...]:
    """'a,b,c' -> ('a','b','c'). An id that is not in the catalog is a mistake in the configuration: say so at start, not on the first turn."""
    ids = tuple(dict.fromkeys(p.strip() for p in (value or "").split(",") if p.strip()))
    unknown = [i for i in ids if i not in CATALOG]
    if unknown:
        raise ValueError(f"modelo desconocido: {', '.join(unknown)} (disponibles: {', '.join(CATALOG)})")
    return ids


def offered(allowed: tuple[str, ...], default: str | None) -> list[dict]:
    """The list the composer shows, in catalog order. The default model is always on it when it is a known one."""
    if not allowed:
        return []
    ids = set(allowed) | ({default} if default in CATALOG else set())
    return [m.public() for m in CATALOG.values() if m.id in ids]


def choose(allowed: tuple[str, ...], default: str | None, model: object, effort: object) -> Choice | None:
    """Validates what a request asked for. None = it asked for nothing: run exactly as before (default model, provider's default effort).
    An unoffered model, or an effort that does not exist, is refused rather than quietly replaced: the person must know what answered."""
    if model is None and effort is None:
        return None
    if model is not None and not isinstance(model, str):
        raise ChoiceError("modelo inválido")
    if effort is not None and effort not in EFFORTS:
        raise ChoiceError("esfuerzo inválido")
    mid = model or default
    offered_ids = set(allowed) | ({default} if default else set())
    if not allowed or mid not in offered_ids:
        raise ChoiceError("este servidor no ofrece ese modelo")
    spec = CATALOG.get(mid)
    efforts = spec.efforts if spec else ()
    use = (effort if effort in efforts else "medium" if efforts else None)    # an effort the model does not have is dropped, not an error
    return Choice(mid, use, EFFORT_MAX_TOKENS[use] if use else NO_EFFORT_MAX_TOKENS, spec.weight if spec else 1.0)
