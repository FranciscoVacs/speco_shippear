"""Continuous evidence (spec 030): one run of the suite verifies every rule, and the bindings of decided numbers are proposed.

- `import_junit` reads a JUnit report (what `pytest --junitxml` writes), maps each test case to the rules whose citations sit in that
  test, and appends one run per rule to the same hash-chained record `verify` uses. A rule none of whose tests ran gets nothing.
- `suggest_values` proposes, for each rule that states a number, the lines of code that hold that number next to an identifier sharing
  a word with the rule, as a `[values]` block to review in the pull request. It writes nothing (D-012).
Deterministic and offline (D-001).
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from . import ledger, strength, values

# ---------------------------------------------------------------------------------------------- JUnit (FR-003..FR-007)


def _cases(report: Path) -> list[tuple[str, str, str]]:
    """[(classname, name without parameters, outcome)] with outcome passed | failed | skipped."""
    try:
        tree = ET.parse(report)
    except (ET.ParseError, OSError) as e:
        raise ValueError(f"no pude leer el reporte JUnit {report}: {e}") from None
    out = []
    for tc in tree.iter("testcase"):
        kids = {c.tag for c in tc}
        state = "failed" if kids & {"failure", "error"} else "skipped" if "skipped" in kids else "passed"
        out.append((tc.get("classname", ""), re.sub(r"\[.*\]$", "", tc.get("name", "")), state))
    return out


def _module(path: str) -> str:
    return re.sub(r"\.py$", "", path).replace("/", ".")


def _keys(c: dict) -> tuple[str, str | None]:
    """A citation -> (dotted module[.Class], test name or None when the citation is not inside a test)."""
    if not c.get("node"):
        return _module(c["file"]), None
    parts = c["node"].split("::")
    return ".".join([_module(parts[0]), *parts[1:-1]]), parts[-1]


def _matches(case_class: str, mod: str) -> bool:
    return case_class == mod or mod.endswith("." + case_class) or case_class.endswith("." + mod)


def import_junit(root: Path, report: Path, by: str = "", via: str = "junit", record: bool = True) -> dict:
    """FR-003, FR-004, FR-005: one run per rule whose citing tests appear in the report."""
    root = Path(root).resolve()
    cases = _cases(Path(report))
    led = ledger.build(root)
    head = ledger._head(root)
    entries, broken, verified = [], [], 0
    src = strength.Sources(root)
    for i in led["intents"]:
        if not i["tests"]:
            continue
        seen = []
        for c in i["tests"]:
            mod, fn = _keys(c)
            seen += [(f"{cls}::{name}", st) for cls, name, st in cases if _matches(cls, mod) and (fn is None or name == fn)]
        ran = sorted({(n, st) for n, st in seen if st != "skipped"})
        if not ran:
            continue                                                     # FR-005: nothing of this rule ran
        failed = sorted({n for n, st in ran if st == "failed"})
        passed = not failed
        entries.append({"ref": i["ref"], "text_hash": i["text_hash"], "text": i["text"], "commit": head,
                        "command": f"junit:{Path(report).name}", "tests": sorted({n for n, _ in ran}),
                        "test_hashes": strength.fingerprints(src, i["tests"]), "passed": passed,
                        "exit_code": 0 if passed else 1, "output_tail": ("falló: " + ", ".join(failed))[-2000:] if failed else "",
                        "why": "", "by": {"name": by or "anónimo", "via": via}})
        if passed:
            verified += 1
        else:
            broken.append({"ref": i["ref"], "text": i["text"], "failed": failed})
    if record and entries:
        ledger.append_records(root, ledger.RUNS_FILE, entries, "v")
    return {"cases": len(cases), "recorded": len(entries), "verified": verified, "broken": broken, "commit": head,
            "recorded_to": str(Path(ledger.DIR) / ledger.RUNS_FILE) if record and entries else None}


# ---------------------------------------------------------------------------------------------- suggest bindings (FR-008, FR-009)
_STOP = {"system", "must", "when", "then", "that", "with", "from", "have", "more", "than", "each", "only", "into", "this", "there",
         "their", "they", "them", "same", "where", "while", "after", "before", "under", "over", "every", "least", "most", "never",
         "always", "show", "shows", "user", "users", "person", "people", "within", "which", "what", "does", "should", "other"}
SUGGEST_EXT = ledger.CODE_EXT | {".toml", ".yaml", ".yml"}
MAX_PER_RULE = 3


def _stems(words) -> set[str]:
    return {w[:5] for w in words if len(w) >= 4 and w not in _STOP}


def _rule_stems(text: str, feature: str) -> set[str]:
    words = re.findall(r"[a-záéíóúñ]+", (text + " " + feature.split("-", 1)[-1].replace("-", " ")).lower())
    return _stems(words)


def _ident_stems(ident: str) -> set[str]:
    return _stems(w.lower() for w in re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])", ident))


_LEFT = re.compile(r"""(['"]?)([A-Za-z_]\w*)\1([\s,:=(]*)$""")
_COMPOUND = re.compile(r"_|[a-z][A-Z]")                     # referral_monthly_cap, keepDays, KEEP_MS: a name, not a word of prose
_NOT_CODE = re.compile(r"(^|/)(scripts?/verify|i18n|locales?|translations?)(/|-)|\.(md|txt)$")


def _in_string(line: str, pos: int) -> bool:
    before = line[:pos]
    return any(before.count(q) % 2 for q in ('"', "'", "`"))


def _comment(line: str) -> bool:
    return line.lstrip().startswith(("#", "//", "--", "*", "/*"))


def suggest_values(root: Path, limit_files: int = 3000, include_bound: bool = False) -> list[dict]:
    """FR-008: for each rule that states a number, the lines holding that number next to an identifier sharing a word with the rule.
    Rules already bound in specreview.toml are left out unless `include_bound`."""
    root = Path(root).resolve()
    rows = values.rule_texts(root)
    bound = set() if include_bound else set(values.config(root))
    wanted: dict[str, list[tuple[dict, set[str], set[str]]]] = {}
    for r in rows:
        if any(_same(b, r) for b in bound):
            continue                                                     # already bound
        for n in values.numbers(r["text"]):
            if n in ("0", "1"):
                continue
            wanted.setdefault(n, []).append((r, _rule_stems(r["text"], r["feature"]), _stems(r["feature"].split("-")[1:])))
    if not wanted:
        return []
    files = [f for f in (ledger._git_files(root) or ledger._walk(root))
             if Path(f).suffix.lower() in SUGGEST_EXT and not ledger.is_test(f) and f not in ledger.CONFIG_FILES
             and not _NOT_CODE.search(f)
             and not any(p in ledger.SKIP_DIRS for p in Path(f).parts[:-1])][:limit_files]
    num = re.compile(r"(?<![\w.])(" + "|".join(sorted(map(re.escape, wanted), key=len, reverse=True)) + r")(?![\w.])")
    found: dict[str, list[dict]] = {}
    for rel in files:
        p = root / rel
        try:
            if p.stat().st_size > ledger.MAX_BYTES:
                continue
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for n_line, line in enumerate(text.splitlines(), 1):
            if _comment(line):
                continue
            for m in num.finditer(line):
                if _in_string(line, m.start()):
                    continue
                left = _LEFT.search(line[: m.start()])
                if not left or not _COMPOUND.search(left.group(2)):
                    continue
                q, ident = left.group(1), left.group(2)
                stems = _ident_stems(ident)
                for r, rstems, fstems in wanted[m.group(1)]:
                    shared = stems & rstems
                    if not shared:
                        continue
                    pattern = re.escape(f"{q}{ident}{q}") + r"[\s,:=(]*" + r"(\d+)"
                    first = re.search(pattern, text)                          # FR-009: `check` reads the first match
                    if not first or first.group(1) != m.group(1) or text.count("\n", 0, first.start()) + 1 != n_line:
                        continue
                    found.setdefault(r["ref"], []).append({
                        "ref": r["ref"], "rule": r["text"], "number": m.group(1), "file": rel, "line": n_line, "identifier": ident,
                        "match": pattern, "shared": sorted(shared), "score": len(shared) + (1 if shared & fstems else 0)})
    out = []
    for ref, cands in found.items():
        cands.sort(key=lambda c: (-c["score"], c["file"], c["line"]))
        out += cands[:MAX_PER_RULE]
    return sorted(out, key=lambda c: (c["ref"], -c["score"]))


def _same(b: str, r: dict) -> bool:
    try:
        return ledger.find({"intents": [r]}, b)["ref"] == r["ref"]
    except ValueError:
        return False


def to_toml(suggestions: list[dict]) -> str:
    """The `[values]` block to paste in specreview.toml; a rule with several candidates gets the best one and the rest commented."""
    lines = ["[values]"]
    seen = set()
    for s in suggestions:
        key = s["ref"].split("-", 1)[0] + "/" + s["ref"].rsplit("/", 1)[1]
        pat = s["match"].replace("\\", "\\\\").replace('"', '\\"')
        row = f'"{key}" = {{ file = "{s["file"]}", match = "{pat}" }}   # línea {s["line"]}: {s["identifier"]} = {s["number"]}'
        lines.append(("# " if s["ref"] in seen else "") + row)
        seen.add(s["ref"])
    return "\n".join(lines) + "\n"
