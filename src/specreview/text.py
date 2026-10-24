"""Tokenization, light stemming and a pluggable similarity (the replaceable 'semantic' layer)."""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Iterable, Protocol

STOP = set("""
a an the and or but if then else of to in on at by for with from as is are was were be been being it its this that these those
into onto per via within without upon than so such not no nor can could should would will shall may might must do does did
have has had their there when where which who whom whose what how why all any each every some more most other another also
only own same too very just about over under again further once up down out off both few he she they them his her we you your our us
system user users shall able allow allows allowed ensure provide provides
un una unos unas el la los las de del al y o pero si entonces en por para con sin sobre es son ser fue debe deben debera
puede pueden que se su sus lo le les como cuando donde cada todo todos
""".split())

# Words that describe *how* software is built, not *what* the product does.
TECH = set("""
implement implements implementation create creates add adds build builds write writes setup configure configures define
endpoint endpoints api route routes handler handlers service services model models class function method module
controller view test tests testing contract integration unit unittest migration migrations schema table db database
get post put patch delete http json request response layer logic job jobs worker file files code src
refactor cleanup update updates support check validate validation error errors handling logging log
send store render display show return parse load save fetch call run use make set generate handle process expose
""".split())

_WORD = re.compile(r"[^\W\d_][\w]*", re.U)
_SUFFIXES = ("ations", "ation", "ings", "ing", "ities", "ity", "ments", "ment", "ies", "ied", "ees", "ee",
             "ers", "er", "ed", "es", "s", "e", "y")


def stem(w: str) -> str:
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def tokens(text: str, keep_tech: bool = False) -> list[str]:
    text = re.sub(r"\b(?:FR|NFR|SC|US|T)-?\d+\b", " ", text)           # ids are not content
    text = re.sub(r"(?:[\w.-]+/)+[\w.-]+\.\w+", " ", text)              # file paths
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text).replace("_", " ")  # camelCase, snake_case
    out = []
    for w in _WORD.findall(text.lower()):
        if len(w) < 3 or w in STOP:
            continue
        if not keep_tech and w in TECH:
            continue
        out.append(stem(w))
    return out


class Similarity(Protocol):
    """Replaceable matcher: any implementation (embeddings, LLM) only needs this."""
    def similarity(self, a: str, b: str) -> float: ...


class LexicalSimilarity:
    """TF-IDF cosine over stemmed tokens, with IDF learned from the feature's own documents."""

    def __init__(self, corpus: Iterable[str]):
        docs = [set(tokens(d)) for d in corpus]
        n = max(len(docs), 1)
        df = Counter(t for d in docs for t in d)
        self.idf = {t: math.log(1 + n / c) for t, c in df.items()}
        self._default = math.log(1 + n)

    def vec(self, text: str) -> dict[str, float]:
        tf = Counter(tokens(text))
        return {t: c * self.idf.get(t, self._default) for t, c in tf.items()}

    def weight(self, token: str) -> float:
        return self.idf.get(token, self._default)

    def recall(self, needle: str, haystack: str) -> float:
        """IDF-weighted share of `needle`'s tokens that appear in `haystack` (length-insensitive)."""
        nt, ht = set(tokens(needle)), set(tokens(haystack))
        total = sum(self.weight(t) for t in nt)
        return sum(self.weight(t) for t in nt & ht) / total if total else 0.0

    def similarity(self, a: str, b: str) -> float:
        va, vb = self.vec(a), self.vec(b)
        dot = sum(w * vb[t] for t, w in va.items() if t in vb)
        na = math.sqrt(sum(w * w for w in va.values()))
        nb = math.sqrt(sum(w * w for w in vb.values()))
        return dot / (na * nb) if na and nb else 0.0


def content_words(text: str) -> dict[str, str]:
    """stem -> first original word, for explaining *which* words are new."""
    text = re.sub(r"\b(?:FR|NFR|SC|US|T)-?\d+\b", " ", text)
    text = re.sub(r"(?:[\w.-]+/)+[\w.-]+\.\w+", " ", text)
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text).replace("_", " ")
    out: dict[str, str] = {}
    for w in _WORD.findall(text.lower()):
        if len(w) < 3 or w in STOP or w in TECH:
            continue
        out.setdefault(stem(w), w)
    return out
