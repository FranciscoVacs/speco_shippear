"""Which requirements something checks: the trace from a requirement to the tests (examples, properties, proofs) that verify it.

A test says what it verifies with one comment line (on its own line, so a string that quotes the tag does not count), in any language:

    # verifies[property]: 010/FR-003, FR-005      (Python, shell, SQL ...  use `--` or `//` the same way)

`[level]` is `test` (a case), `property` (generated cases) or `formal` (a proof); without brackets it is `test`. The text before the
slash is the feature (`010`, or the whole folder name); after it, one or more requirement ids of that feature.

This module only *reports* the trace. It never says a requirement is «proved»: it says which kind of check cites it, and where.
A tag that points at a feature or a requirement that does not exist is reported as broken, because a trace that rots is worse than none.
Pure: a repository in, data out (docs/37-verified-intent.md)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .parser import load_feature
from .parser.loader import discover_features

LEVELS = ("test", "property", "formal")                     # weakest to strongest
LEVEL_LABEL = {"test": "test", "property": "propiedad", "formal": "prueba formal"}
EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".rs", ".go", ".java", ".rb", ".sql", ".sh", ".kt", ".php", ".cs"}
TEST_DIRS = {"tests", "test", "__tests__", "spec", "specs_tests"}
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".tox", ".hypothesis", "mutants"}
TAG = re.compile(r"^\s*(?:#|//|--|/\*|\*)\s*verifies(?:\[(\w+)\])?:\s*([\w.-]+)\s*/\s*([A-Z]+-\d+(?:\s*,\s*[A-Z]+-\d+)*)")
# A requirement that states something about every case (a «never», an «at most once»): the kind a property pays off for. A hint, not a verdict.
INVARIANT = re.compile(r"\bMUST NOT\b|\bnever\b|\bat most\b|\bexactly once\b|\bonly once\b|\bonce per\b|\bat most one\b", re.I)


@dataclass
class Evidence:
    level: str
    file: str
    line: int

    def __str__(self) -> str:
        return f"{LEVEL_LABEL[self.level]} `{self.file}:{self.line}`"


@dataclass
class ReqTrace:
    id: str
    text: str
    evidence: list[Evidence] = field(default_factory=list)
    invariant: bool = False          # heuristic: worded as a «never» / «at most»

    @property
    def level(self) -> str | None:
        return max((e.level for e in self.evidence), key=LEVELS.index, default=None)


@dataclass
class FeatureTrace:
    key: str
    title: str
    reqs: list[ReqTrace]

    def count(self, level: str | None) -> int:
        return sum(1 for r in self.reqs if r.level == level)


@dataclass
class Broken:
    file: str
    line: int
    ref: str            # what the tag says
    why: str


@dataclass
class Trace:
    features: list[FeatureTrace]
    broken: list[Broken]
    tags: int           # tags found: 0 means the repository does not use the convention yet

    def evidence_for(self, key: str, rid: str) -> list[Evidence]:
        for f in self.features:
            if f.key == key:
                return next((r.evidence for r in f.reqs if r.id == rid), [])
        return []


def _is_test_file(root: Path, p: Path) -> bool:
    rel = p.relative_to(root)
    return p.suffix in EXTENSIONS and (any(part in TEST_DIRS for part in rel.parts[:-1])
                                       or re.match(r"(test_.*|.*_test|.*\.test|.*\.spec)\.\w+$", p.name) is not None)


def _walk(root: Path):
    for p in sorted(root.rglob("*")):
        if p.is_file() and not any(part in SKIP_DIRS for part in p.relative_to(root).parts) and _is_test_file(root, p):
            yield p


def scan_tags(root: Path) -> list[tuple[str, int, str, str, list[str]]]:
    """(file, line, level, feature ref, [requirement ids]) for every tag in the test files of `root`."""
    out = []
    for p in _walk(root):
        try:
            lines = p.read_text(encoding="utf-8").splitlines()
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(lines, 1):
            m = TAG.match(line)
            if m:
                out.append((p.relative_to(root).as_posix(), n, (m.group(1) or "test").lower(), m.group(2),
                            [r.strip() for r in m.group(3).split(",")]))
    return out


def _match(ref: str, keys: list[str]) -> str | None:
    """`010` or `010-auditable-approvals` -> the feature folder, when exactly one folder fits."""
    hits = [k for k in keys if k == ref or k.startswith(ref + "-")]
    return hits[0] if len(hits) == 1 else None


def trace(root: Path) -> Trace:
    root = Path(root).resolve()
    feats = {}
    for key, d in discover_features(root).items():
        f = load_feature(d)
        feats[key] = FeatureTrace(key, f.spec.title if f.spec and getattr(f.spec, "title", "") else key,
                                  [ReqTrace(r.id, r.text, invariant=bool(INVARIANT.search(r.text))) for r in (f.spec.requirements if f.spec else [])])
    tags, broken = scan_tags(root), []
    for file, line, level, ref, rids in tags:
        if level not in LEVELS:
            broken.append(Broken(file, line, f"{ref}/{', '.join(rids)}", f"nivel desconocido «{level}» (usá {', '.join(LEVELS)})"))
            continue
        key = _match(ref, list(feats))
        if key is None:
            broken.append(Broken(file, line, f"{ref}/{', '.join(rids)}", f"ninguna feature (o más de una) se llama «{ref}»"))
            continue
        by_id = {r.id: r for r in feats[key].reqs}
        for rid in rids:
            if rid in by_id:
                by_id[rid].evidence.append(Evidence(level, file, line))
            else:
                broken.append(Broken(file, line, f"{ref}/{rid}", f"{key} no tiene el requisito {rid}"))
    return Trace(list(feats.values()), broken, len(tags))


# ---------------------------------------------------------------------------------------------- reports
def summary(t: Trace) -> dict:
    reqs = [r for f in t.features for r in f.reqs]
    return {"requirements": len(reqs), "tags": t.tags, "broken": len(t.broken),
            **{lv: sum(1 for r in reqs if r.level == lv) for lv in LEVELS},
            "none": sum(1 for r in reqs if r.level is None),
            "invariants": sum(1 for r in reqs if r.invariant),
            "invariants_without_property": sum(1 for r in reqs if r.invariant and (r.level is None or r.level == "test"))}


def render(t: Trace, markdown: bool = False) -> str:
    s = summary(t)
    b = (lambda x: f"**{x}**") if markdown else (lambda x: x)
    code = (lambda x: f"`{x}`") if markdown else (lambda x: x)
    lines = []
    if not t.tags:
        return ("Ningún test cita un requisito todavía.\n"
                "Agregá sobre cada test una línea `# verifies[property]: 010/FR-003` (docs/37-verified-intent.md) y volvé a correr este comando.\n")
    lines.append(f"{b('Verificación de requisitos')}: {s['requirements']} requisitos · {s['formal']} con prueba formal · {s['property']} con propiedad · "
                 f"{s['test']} sólo con tests · {s['none']} sin verificación")
    if s["invariants"]:
        lines.append(f"De {s['invariants']} redactados como invariante («nunca», «como máximo»), {s['invariants_without_property']} no tienen propiedad ni prueba (heurística sobre el texto).")
    lines.append("")
    for f in t.features:
        if not f.reqs or not any(r.evidence for r in f.reqs):
            continue
        lines.append(f"{'### ' if markdown else ''}{f.key}  ({len(f.reqs) - f.count(None)}/{len(f.reqs)} verificados)")
        for r in f.reqs:
            if r.evidence:
                lines.append(f"  {code(r.id)}  {LEVEL_LABEL[r.level]}  ← " + ", ".join(str(e) if markdown else f"{e.file}:{e.line}" for e in r.evidence))
            elif r.invariant:
                lines.append(f"  {code(r.id)}  sin verificación · candidato a propiedad: «{r.text[:90]}»")
        lines.append("")
    silent = [f.key for f in t.features if f.reqs and not any(r.evidence for r in f.reqs)]
    if silent:
        lines.append(f"Features sin ninguna verificación citada: {', '.join(silent)}")
    if t.broken:
        lines += ["", b("Referencias rotas") + " (el test cita algo que no existe):"]
        lines += [f"  {x.file}:{x.line}  {x.ref}  → {x.why}" for x in t.broken]
    return "\n".join(lines).rstrip() + "\n"


def annotate(diffs, root: Path) -> None:
    """Fills `checked_by` on every requirement change of an intent diff, when the repository traces verification at all.
    A repository with no tags stays silent: a warning on every requirement would be noise, not information."""
    t = trace(root)
    if not t.tags:
        return
    for d in diffs:
        for ch in d.changes:
            ch.checked_by = [str(e) for e in t.evidence_for(d.key, ch.id)]
