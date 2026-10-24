"""The per-turn choice of model and effort (the composer's selectors): what a server offers, and what it accepts back."""
import pytest

from specreview.models import CATALOG, EFFORT_MAX_TOKENS, NO_EFFORT_MAX_TOKENS, ChoiceError, choose, offered, parse_models

ALL = tuple(CATALOG)
SONNET, OPUS, HAIKU = "claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"


def test_the_list_is_parsed_and_a_typo_fails_at_start():
    assert parse_models("") == () and parse_models(None) == ()
    assert parse_models(f" {HAIKU}, {SONNET},{HAIKU} ") == (HAIKU, SONNET)
    with pytest.raises(ValueError, match="claude-opus-9"):
        parse_models("claude-opus-9")


def test_nothing_is_offered_until_the_operator_turns_it_on():
    assert offered((), SONNET) == []
    assert [m["id"] for m in offered((HAIKU, OPUS), SONNET)] == [HAIKU, SONNET, OPUS]      # the default model is always on the list, in catalog order
    assert [m["id"] for m in offered((HAIKU,), "some-custom-model")] == [HAIKU]


def test_the_offer_carries_what_the_composer_needs():
    sonnet = next(m for m in offered(ALL, SONNET) if m["id"] == SONNET)
    assert sonnet == {"id": SONNET, "label": "Sonnet 5.5", "tier": "balanced", "efforts": ["low", "medium", "high"]}


def test_asking_for_nothing_changes_nothing():
    assert choose((), SONNET, None, None) is None and choose(ALL, SONNET, None, None) is None


def test_a_valid_choice_gets_its_room_and_price():
    c = choose(ALL, SONNET, OPUS, "high")
    assert (c.model, c.effort, c.max_tokens, c.weight) == (OPUS, "high", EFFORT_MAX_TOKENS["high"], 2.0)
    assert c.kwargs() == {"model": OPUS, "effort": "high", "max_tokens": 16_000}
    assert choose(ALL, SONNET, HAIKU, "low").weight == pytest.approx(0.05)


def test_effort_defaults_to_medium_and_a_model_alone_is_enough():
    assert choose(ALL, SONNET, SONNET, None).effort == "medium"
    assert choose(ALL, SONNET, None, "low").model == SONNET                  # only an effort: the default model


@pytest.mark.parametrize("allowed,model,effort", [
    ((), SONNET, "low"),                          # nothing was offered, so nothing can be picked
    ((HAIKU,), OPUS, "low"),                      # a model that was not turned on
    (ALL, "gpt-9", "low"),                        # not a model of this catalog
    (ALL, SONNET, "ludicrous"),                   # not an effort
    (ALL, 5, "low"),
])
def test_what_was_not_offered_is_refused_not_replaced(allowed, model, effort):
    with pytest.raises(ChoiceError):
        choose(allowed, SONNET, model, effort)


def test_a_model_without_efforts_drops_the_effort_instead_of_failing():
    c = choose(("custom-1",), "custom-1", "custom-1", "high")
    assert (c.effort, c.max_tokens, c.weight) == (None, NO_EFFORT_MAX_TOKENS, 1.0)
