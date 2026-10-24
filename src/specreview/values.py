"""Decided values: the numbers product decided, checked against the line of code that holds them (spec 029).

A binding in `specreview.toml` ties a rule to one number in the code:

    [values]
    "021/FR-008" = { file = "supabase/migrations/20261018000002_referrals.sql", match = "'referral_monthly_cap',\\s*(\\d+)" }

Every build of the ledger reads that number (no test runs) and compares it with the numbers the rule states. A drift names the
commit, author and date that last changed the line (git blame), so «who changed what we decided» has an answer without asking.
Deterministic and offline (D-001).
"""
from __future__ import annotations

import re
import subprocess
import tomllib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .contradictions import quantities
from .suppress import CONFIG_FILES

_NUM = re.compile(r"\d+(?:[.,]\d+)*")


@dataclass
class Binding:
    ref: str                   # as written in the config: "021/FR-008"
    file: str
    match: str
    status: str = "ok"         # ok | drift | broken
    found: str | None = None   # the number the code holds
    line: int | None = None
    expected: list[str] = field(default_factory=list)   # the numbers the rule states
    reason: str = ""
    changed_by: dict | None = None                       # {commit, author, date, subject} of the line, on a drift

    def to_dict(self) -> dict:
        return asdict(self)


def numbers(text: str) -> list[str]:
    """The numbers a rule states, normalised: «10,000» and «10000» are the same; «2.5» stays 2.5."""
    out = []
    for m in _NUM.finditer(text):
        out.append(_norm(m.group(0)))
    return list(dict.fromkeys(out))


def _norm(raw: str) -> str:
    s = raw.strip()
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", s):            # thousands separators
        return s.replace(",", "").replace(".", "")
    s = s.replace(",", ".")
    return s.rstrip("0").rstrip(".") if "." in s else s.lstrip("0") or "0"


def config(root: Path) -> dict[str, list[dict]]:
    """FR-001: `[values]` of specreview.toml; a ref maps to one binding or a list of them."""
    for rel in CONFIG_FILES:
        p = Path(root) / rel
        if p.is_file():
            try:
                raw = tomllib.loads(p.read_text(encoding="utf-8")).get("values") or {}
            except tomllib.TOMLDecodeError as e:
                raise ValueError(f"{p}: TOML inválido ({e})") from None
            return {ref: (v if isinstance(v, list) else [v]) for ref, v in raw.items()}
    return {}


def _blame(root: Path, file: str, line: int) -> dict | None:
    """FR-003: the commit that last changed that one line."""
    try:
        r = subprocess.run(["git", "-C", str(root), "blame", "--porcelain", "-L", f"{line},{line}", "--", file],
                           capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0 or not r.stdout:
        return None
    head = r.stdout.splitlines()
    sha = head[0].split()[0]
    info = dict(l.split(" ", 1) for l in head[1:] if " " in l and not l.startswith("\t"))
    if set(sha) == {"0"}:
        return {"commit": None, "author": None, "date": None, "subject": "sin commitear"}
    when = info.get("author-time")
    date = datetime.fromtimestamp(int(when), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if when else None
    return {"commit": sha[:7], "author": info.get("author"), "date": date, "subject": info.get("summary", "")}


def check(root: Path, ref: str, spec: dict, rule_text: str, blame: bool = True) -> Binding:
    """FR-001, FR-002, FR-004: read the bound number and compare it with the numbers of the rule."""
    root = Path(root)
    b = Binding(ref, str(spec.get("file") or ""), str(spec.get("match") or ""), expected=numbers(rule_text))
    if not b.file or not b.match:
        b.status, b.reason = "broken", "la vinculación necesita `file` y `match`"
        return b
    p = root / b.file
    if not p.is_file():
        b.status, b.reason = "broken", f"no existe {b.file}"
        return b
    try:
        pat = re.compile(b.match)
    except re.error as e:
        b.status, b.reason = "broken", f"`match` no es una expresión válida ({e})"
        return b
    text = p.read_text(encoding="utf-8", errors="replace")
    m = pat.search(text)
    if not m:
        b.status, b.reason = "broken", f"`match` no encuentra nada en {b.file}"
        return b
    raw = m.group(1) if m.groups() else m.group(0)
    b.found, b.line = _norm(raw), text.count("\n", 0, m.start(1) if m.groups() else m.start()) + 1
    if b.found not in b.expected:
        b.status = "drift"
        b.reason = (f"la regla dice {' / '.join(b.expected) or '(sin número)'}; {b.file}:{b.line} tiene {b.found}")
        if blame:
            b.changed_by = _blame(root, b.file, b.line)
    return b


def bindings_for(root: Path, cfg: dict[str, list[dict]], resolve) -> dict[str, list[Binding]]:
    """Every binding checked, keyed by the full ref of its rule. `resolve(ref)` -> (full_ref, text) or raises ValueError."""
    out: dict[str, list[Binding]] = {}
    for ref, specs in cfg.items():
        try:
            full, text = resolve(ref)
        except ValueError as e:
            out.setdefault(ref, []).append(Binding(ref, str(specs[0].get("file", "")), str(specs[0].get("match", "")),
                                                   status="broken", reason=str(e)))
            continue
        out.setdefault(full, []).extend(check(root, ref, s, text) for s in specs)
    return out


def impact(root: Path, before: str, after: str, cfg: dict[str, list[dict]], siblings: list[tuple[str, str]]) -> dict:
    """FR-006: when a change moves a number, the bindings that still hold the old one and the rules with a number in the same unit."""
    moved = []
    qa, qb = quantities(before), quantities(after)
    for dim in dict.fromkeys(d for d, _, _ in qa):
        for (_, va, ra), (_, vb, rb) in zip([q for q in qa if q[0] == dim], [q for q in qb if q[0] == dim]):
            if va != vb:
                moved.append((dim, _norm(_NUM.search(ra).group(0)), ra, rb))
    if not moved:
        return {"bindings": [], "rules": []}
    old = {n for _, n, _, _ in moved}
    dims = {d for d, _, _, _ in moved}
    holding = []
    for ref, specs in cfg.items():
        for s in specs:
            b = check(root, ref, s, before, blame=False)
            if b.found in old:
                holding.append({"ref": ref, "file": b.file, "line": b.line, "holds": b.found})
    rules = []
    words = {d for d in dims if d.isalpha()}
    for ref, text in siblings:
        same = [raw for d, _, raw in quantities(text) if d in dims]
        if not same and any(re.search(rf"\b{re.escape(w)}\b", text, re.I) for w in words):
            same = numbers(text)                  # «the credits … never exceed 200»: the unit and the number are apart
        if same:
            rules.append({"ref": ref, "text": text, "mentions": same})
    return {"bindings": holding, "rules": rules}


def rule_texts(root: Path) -> list[dict]:
    """Every requirement of the specs, parsed without reviewing them (cheap enough for a pull request)."""
    from .parser.loader import discover_features
    from .parser.spec import parse_spec
    rows = []
    for key, d in sorted(discover_features(Path(root)).items()):
        p = d / "spec.md"
        if p.is_file():
            s = parse_spec(p, str(p))
            rows += [{"ref": f"{key}/{r.id}", "feature": key, "id": r.id, "text": r.text} for r in s.requirements + s.success_criteria]
    return rows


def drifts(root: Path, cfg: dict[str, list[dict]] | None = None, blame: bool = True) -> list[dict]:
    """The bound numbers that do not match their rule today, with the rule they break."""
    root = Path(root)
    cfg = config(root) if cfg is None else cfg
    if not cfg:
        return []
    rows = rule_texts(root)

    def resolve(ref: str) -> tuple[str, str]:
        from .ledger import find
        hit = find({"intents": rows}, ref)
        return hit["ref"], hit["text"]

    texts = {r["ref"]: r["text"] for r in rows}
    out = []
    for full, bs in bindings_for(root, cfg, resolve).items():
        out += [{**b.to_dict(), "rule": full, "text": texts.get(full, "")} for b in bs if b.status != "ok"]
    if not blame:
        for d in out:
            d["changed_by"] = None
    return out


def introduced(head_root: Path, read_base) -> list[dict]:
    """The drifts a change brings: a bound number that breaks its rule now and held something else in the base.
    `read_base(path)` returns the base text of a file, or None when it did not exist there."""
    out = []
    for d in drifts(head_root, blame=False):
        if d["status"] == "broken":
            continue
        base = read_base(d["file"])
        m = re.search(d["match"], base) if base is not None else None
        before = _norm(m.group(1) if m and m.groups() else m.group(0)) if m else None
        if before != d["found"]:
            out.append({**d, "before": before})
    return out


MOVED_FILE = "values.md"


def moved_file(moved: list[dict]) -> str:
    """031/FR-006: the decided numbers a pull request moves, as a file of the version a person decides."""
    lines = ["# Números decididos que este cambio mueve en el código", "",
             "| Regla | La regla dice | El código pasa a | Antes | Dónde |", "|---|---|---|---|---|"]
    for v in moved:
        lines.append(f"| `{v['rule']}` | {' / '.join(v['expected']) or '—'} | **{v['found']}** | {v.get('before') or '—'} | `{v['file']}:{v['line']}` |")
    lines += [""] + [f"- `{v['rule']}`: «{v['text']}»" for v in moved]
    return "\n".join(lines) + "\n"
