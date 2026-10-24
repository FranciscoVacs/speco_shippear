"""Evidence strength (spec 032): a verification is only as good as the test behind it.

- `fingerprint` hashes the source of a cited test (the Python function, decorators included, or the whole file otherwise). A run records
  the fingerprints of the tests it ran; when one changes or a new test cites the rule, that run proved a test that no longer exists and
  stops counting (Anthropic, 2026-10-22, note 6: an agent can make a proof pass by rewriting what it checks).
- `evidence_kind` tells examples from generated cases (property-based libraries). Nothing is ever labeled proved (D-019).
- `shape` classifies a requirement as invariant, conditional or not formalizable (docs/37 §7, step 1).
- `edited_tests` lists the rules whose citing tests a change edits against its base, for the review of that change.
Deterministic and offline (D-001).
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

from .approvals import sha

# ---------------------------------------------------------------------------------------------- fingerprints (FR-001..FR-005)


class Sources:
    """Reads and parses each test file once per build."""

    def __init__(self, root: Path, texts: dict[str, str] | None = None):
        self.root = Path(root)
        self._text: dict[str, str | None] = dict(texts or {})
        self._tree: dict[str, ast.Module | None] = {}

    def text(self, rel: str) -> str | None:
        if rel not in self._text:
            try:
                self._text[rel] = (self.root / rel).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                self._text[rel] = None
        return self._text[rel]

    def _parsed(self, rel: str) -> ast.Module | None:
        if rel not in self._tree:
            text = self.text(rel)
            try:
                self._tree[rel] = ast.parse(text) if text is not None else None
            except SyntaxError:
                self._tree[rel] = None
        return self._tree[rel]

    def source(self, c: dict, strict: bool = False) -> str | None:
        """The source of the cited test: its function (with decorators) for a Python node, the whole file otherwise.
        With `strict`, a node whose function is not in the file gives None instead of the file."""
        text = self.text(c["file"])
        node = c.get("node") or ""
        if text is None or not node or not c["file"].endswith(".py"):
            return text
        tree = self._parsed(c["file"])
        fn = _find(tree, node.split("::")[1:]) if tree else None
        if fn is None:
            return None if strict else text
        lines = text.splitlines()
        start = min([d.lineno for d in fn.decorator_list] + [fn.lineno])
        return "\n".join(lines[start - 1: fn.end_lineno])


def _find(tree: ast.AST, path: list[str]) -> ast.AST | None:
    scope = tree
    for name in path:
        nxt = next((n for n in getattr(scope, "body", []) if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
                    and n.name == name), None)
        if nxt is None:
            return None
        scope = nxt
    return scope if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)) else None


def key(c: dict) -> str:
    return c.get("node") or c["file"]


def fingerprint(source: str | None) -> str:
    return "" if source is None else sha(re.sub(r"\s+", " ", source).strip())[:16]


def fingerprints(src: Sources, tests: list[dict]) -> dict[str, str]:
    """FR-001: {test: fingerprint} for the tests that cite a rule."""
    return {key(c): fingerprint(src.source(c)) for c in tests}


def changed(recorded: dict[str, str] | None, current: dict[str, str]) -> list[str] | None:
    """FR-002..FR-005: the tests that differ from the run, or None when the run still counts (or has no fingerprints)."""
    if not recorded:
        return None                                                            # FR-005: a run from before fingerprints
    diff = sorted(t for t, h in current.items() if recorded.get(t) != h)
    return diff or None


# ---------------------------------------------------------------------------------------------- evidence kind (FR-007, FR-008)
PROPERTY = re.compile(r"@given\b|@hypothesis\.given\b|\bfc\.(?:assert|property|asyncProperty)\s*\(|@Property\b|\bforAll\s*[(\[{]|\bproptest!")
KINDS = {"examples": "ejemplos", "generated": "casos generados"}               # FR-008: there is no "proved"


def evidence_kind(src: Sources, tests: list[dict]) -> str | None:
    if not tests:
        return None
    return "generated" if any(PROPERTY.search(src.source(c) or "") for c in tests) else "examples"


# ---------------------------------------------------------------------------------------------- shape (FR-009, FR-010)
SHAPES = ("invariant", "conditional", "not_formalizable")
SHAPE_LABEL = {"invariant": "invariante", "conditional": "condicional", "not_formalizable": "no formalizable"}
_TRIGGER = re.compile(r"^\s*(when|if|where|once|after|upon|cuando|si|donde)\b", re.I)
_PRESENT = re.compile(r"\b(?:must|shall|debe|deben)\s+(?:not\s+)?(?:also\s+)?(?:show|print|display|offer|tell|say|explain|render|"
                      r"list|return|answer|present|mostrar|imprimir|decir|explicar|ofrecer|listar)\b", re.I)


def shape(text: str, vague: bool = False) -> str:
    """Presenting something or a vague quality → not formalizable; a When/If/Where trigger → conditional; otherwise invariant."""
    if vague or _PRESENT.search(text):
        return "not_formalizable"
    return "conditional" if _TRIGGER.match(text) else "invariant"


def shapes(led: dict) -> dict:
    """FR-009, FR-010: every functional requirement with its class, and the count and percentage of each class."""
    rules = [{"ref": i["ref"], "text": i["text"], "shape": shape(i["text"], vague=bool(VAGUE & set(i["issues"])))}
             for i in led["intents"] if i["kind"] == "FR"]
    total = len(rules)
    counts = {s: sum(1 for r in rules if r["shape"] == s) for s in SHAPES}
    return {"total": total, "counts": counts, "percent": {s: round(100 * counts[s] / total, 1) if total else 0.0 for s in SHAPES},
            "rules": rules}


VAGUE = {"QUA001", "QUA002"}                                                   # ambiguous wording, quality attribute without a threshold


def render_shapes(sh: dict) -> str:
    out = [f"Forma de las reglas: {sh['total']} requisitos funcionales (N = {sh['total']})"]
    out += [f"  {SHAPE_LABEL[s]:<16} {sh['counts'][s]:>4}  {sh['percent'][s]:>5.1f} %" for s in SHAPES]
    out += ["", "invariante: vale siempre (candidata a propiedades o prueba) · condicional: «cuando A, B» · "
                "no formalizable: muestra o dice algo, o es vaga"]
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------------------------- edited tests (FR-006)
def edited_tests(led: dict, read_base) -> list[dict]:
    """The rules whose citing tests existed in the base and changed: [{ref, text, tests: [{test, file, line}]}]. New tests are not edits.
    `read_base(path)` returns the base text of a file, or None when it did not exist there."""
    src = Sources(Path(led["root"]))
    base_cache: dict[str, Sources] = {}
    out = []
    for i in led["intents"]:
        hits = []
        for c in i["tests"]:
            base_text = read_base(c["file"])
            if base_text is None:
                continue                                                       # a new test file: nothing was edited
            before = base_cache.setdefault(c["file"], Sources(Path("."), {c["file"]: base_text})).source(c, strict=True)
            if before is not None and fingerprint(before) != fingerprint(src.source(c)):
                hits.append({"test": key(c), "file": c["file"], "line": c["line"]})
        if hits:
            seen, uniq = set(), []
            for h in hits:
                if h["test"] not in seen:
                    seen.add(h["test"])
                    uniq.append(h)
            out.append({"ref": i["ref"], "text": i["text"], "state": i["state"], "tests": uniq})
    return out


def edited_md(rows: list[dict], subject: str = "Esta PR") -> list[str]:
    """FR-006: the section of the review of a change."""
    if not rows:
        return []
    n = len(rows)
    out = [f"### ⚠️ {subject} toca {'el test' if n == 1 else 'los tests'} de {'una regla' if n == 1 else f'{n} reglas'}", ""]
    for r in rows:
        tests = ", ".join(f"`{t['file']}:{t['line']}`" for t in r["tests"][:3])
        out.append(f"- **`{r['ref']}`**: {tests}")
        out.append(f"  > {_quote(r['text'])}")
    out += ["", "Una regla vale lo que vale su test. Que una persona mire si el test sigue comprobando lo que dice la regla; "
                "la verificación anterior deja de contar hasta que el test nuevo corra.", ""]
    return out


def _quote(s: str, n: int = 160) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"
