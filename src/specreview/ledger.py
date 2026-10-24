"""The intent ledger: every rule the specs state, how much evidence backs it, and how it got here (spec 028).

The question it answers is «what does the software do, and how do we know?» without reading the how:

    proposed  the spec says it, nobody approved this version and the feature is not built
    decided   approved for the current version of the spec, not built yet
    built     the feature is implemented, but no test cites the rule
    covered   a test cites the rule (`028/FR-002`) and no run of it was recorded for the current text
    verified  the latest recorded run of the citing tests, for the current text, passed
    failing   that run failed

Evidence is a citation `<feature>/<id>` in a source file; tests are told from code by their path. Runs and the changes an
agent makes to the specs go to append-only, hash-chained records under `.specreview/`, so «verified» always points at a run
someone can audit and «who changed this rule» has an answer before anything is committed. Deterministic and offline except
`verify`, which runs only the command the repository configured (D-001, D-005, D-012, D-019).
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import tempfile
import threading
import tomllib
import unicodedata
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .analyzers import Context, run_all
from .approvals import sha
from .approvals import history as approval_history
from .approvals import status as approval_status
from .intent_diff import moved_values
from .model import Requirement
from .parser import load_feature
from .parser.loader import discover_features
from .parser.spec import parse_spec
from . import strength
from .report import build_report, to_dict
from .suppress import CONFIG_FILES, DIR
from . import values as decided

STATES = ("proposed", "decided", "built", "covered", "verified", "failing")
LABEL = {"proposed": "propuesta", "decided": "decidida", "built": "construida sin test", "covered": "con test, sin correr",
         "verified": "verificada", "failing": "rota"}
TODAY = ("built", "covered", "verified", "failing")          # what the software does now, by the specs' own account
RUNS_FILE, INTENT_FILE = "verifications.jsonl", "intent-log.jsonl"

SKIP_DIRS = {".git", "node_modules", "specs", "docs", DIR, ".specify", "dist", "build", ".venv", "venv", "__pycache__",
             "vendor", ".next", "coverage", ".pytest_cache", ".mypy_cache", "site-packages", "target"}
CODE_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs",
            ".swift", ".scala", ".sql", ".sh", ".feature", ".ex", ".exs", ".dart", ".vue", ".svelte"}
MAX_BYTES = 1_000_000
CITE = re.compile(r"(?:\b(\d{3}(?:-[a-z0-9][a-z0-9-]*)?)[/:#])?\b((?:FR|SC)-\d{3})\b")
TEST_PATH = re.compile(r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]*$|_test\.[a-z]+$|\.(test|spec)\.[a-z]+$")
PY_TEST = re.compile(r"^(\s*)(?:async\s+)?def\s+(test\w*)")
PY_CLASS = re.compile(r"^class\s+(Test\w*)")
_lock = threading.Lock()
# 030/FR-001: a runner that is not installed ran no test; its exit code says nothing about the software
NO_RUNNER = re.compile(r"No module named '?(pytest|py\.test|unittest|nose2?|coverage)'?|command not found|is not recognized as an internal or external command")


# ---------------------------------------------------------------------------------------------- model
@dataclass
class Citation:
    file: str
    line: int
    kind: str                  # test | code
    feature: str               # as written: "028" or "028-intent-ledger" (a slug must match the feature's)
    id: str
    node: str = ""             # pytest node id when the citation sits inside a test function

    def where(self) -> str:
        return f"{self.file}:{self.line}"


@dataclass
class Intent:
    ref: str                   # 028-intent-ledger/FR-002
    feature: str
    id: str
    kind: str                  # FR | SC
    text: str
    loc: str
    text_hash: str
    state: str
    tests: list[Citation] = field(default_factory=list)
    code: list[Citation] = field(default_factory=list)
    last_run: dict | None = None
    stale_run: dict | None = None      # a run recorded for an earlier text
    issues: list[str] = field(default_factory=list)
    values: list[dict] = field(default_factory=list)   # spec 029: bound numbers in the code
    reason: str = ""                                    # why it is failing, when the reason is not a test run
    run_age: int | None = None                          # commits between the last run and HEAD (029/FR-007)
    last_error: dict | None = None                      # a later run that ran no test (030/FR-002): shown, never counted
    evidence: str | None = None                         # 032/FR-007: examples | generated (never proved, FR-008)
    changed_tests: list[str] = field(default_factory=list)   # 032/FR-003: tests edited since the last run, which no longer counts

    def to_dict(self) -> dict:
        d = asdict(self)
        d["label"] = LABEL[self.state]
        return d


@dataclass
class FeatureState:
    key: str
    title: str
    status: str                # what the spec's Status line says
    implemented: bool
    implemented_by: str        # status | tasks | ""
    approval: str              # none | approved | ... (approval log)
    approval_current: bool     # approved for the current version of the spec


# ---------------------------------------------------------------------------------------------- config
def _ledger_config(root: Path) -> dict:
    for rel in CONFIG_FILES:
        p = Path(root) / rel
        if p.is_file():
            try:
                raw = tomllib.loads(p.read_text(encoding="utf-8"))
            except tomllib.TOMLDecodeError as e:
                raise ValueError(f"{p}: TOML inválido ({e})") from None
            return raw.get("ledger") or {}
    return {}


def verify_command(root: Path) -> str | None:
    cmd = _ledger_config(root).get("verify")
    return str(cmd) if cmd else None


def suite_command(root: Path) -> str | None:
    """030/FR-006: the command that runs the whole suite once, with {junit} where the report goes."""
    cmd = _ledger_config(root).get("suite")
    return str(cmd) if cmd else None


def passed_pattern(root: Path) -> str | None:
    """A regex the run's output must contain to count as passed, on top of exit 0 (a runner that skips every test exits 0 too)."""
    pat = _ledger_config(root).get("passed_pattern")
    return str(pat) if pat else None


# ---------------------------------------------------------------------------------------------- evidence
def _git_files(root: Path) -> list[str] | None:
    try:
        r = subprocess.run(["git", "-C", str(root), "ls-files", "-co", "--exclude-standard"], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.splitlines() if r.returncode == 0 else None          # paths relative to `root`


def _walk(root: Path) -> list[str]:
    out = []
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith(".")]
        rel = Path(d).relative_to(root)
        out += [str(rel / f) if str(rel) != "." else f for f in files]
    return out


def source_files(root: Path) -> list[str]:
    root = Path(root)
    files = _git_files(root)
    if files is None:
        files = _walk(root)
    keep = []
    for f in files:
        parts = Path(f).parts
        if any(p in SKIP_DIRS for p in parts[:-1]) or Path(f).suffix.lower() not in CODE_EXT:
            continue
        keep.append(f.replace(os.sep, "/"))
    return sorted(keep)


def is_test(path: str) -> bool:
    return bool(TEST_PATH.search(path.lower()))


def scan(root: Path) -> list[Citation]:
    """Every `<feature>/<id>` citation in the source files; bare ids count only after a feature on the same line."""
    root = Path(root)
    out = []
    for rel in source_files(root):
        p = root / rel
        try:
            if p.stat().st_size > MAX_BYTES:
                continue
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if "FR-" not in text and "SC-" not in text:
            continue
        kind = "test" if is_test(rel) else "code"
        cls = fn = ""
        for n, line in enumerate(text.splitlines(), 1):
            if rel.endswith(".py"):                          # the enclosing test, so a run can target it alone
                if line and not line[0].isspace():
                    if (m := PY_CLASS.match(line)):
                        cls, fn = m.group(1), ""
                    elif (m := PY_TEST.match(line)):
                        cls, fn = "", m.group(2)
                    elif not line.startswith(("#", "@", ")", "]", "}")):
                        cls = fn = ""
                elif cls and (m := PY_TEST.match(line)):
                    fn = m.group(2)
            current = None
            for m in CITE.finditer(line):
                if m.group(1):
                    current = m.group(1)
                if current is None:
                    continue
                node = "::".join(x for x in (rel, cls, fn) if x) if fn and kind == "test" else ""
                out.append(Citation(rel, n, kind, current, m.group(2), node))
    return out


# ---------------------------------------------------------------------------------------------- records (hash-chained)
def _canon(e: dict) -> str:
    return sha(json.dumps({k: v for k, v in e.items() if k != "hash"}, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def read_record(root: Path, name: str) -> list[dict]:
    p = Path(root) / DIR / name
    if not p.is_file():
        return []
    out = []
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                raise ValueError(f"{p}:{n}: línea inválida") from None
    return out


def check_record(root: Path, name: str) -> dict:
    prev, entries = "genesis", read_record(root, name)
    for e in entries:
        if e.get("prev") != prev:
            return {"ok": False, "count": len(entries), "broken_at": e.get("id"), "reason": "la cadena no enlaza con la entrada anterior (¿se borró o reordenó algo?)"}
        if e.get("hash") != _canon(e):
            return {"ok": False, "count": len(entries), "broken_at": e.get("id"), "reason": "el contenido no coincide con su hash (¿se editó?)"}
        prev = e["hash"]
    return {"ok": True, "count": len(entries), "broken_at": None, "reason": ""}


def append_record(root: Path, name: str, entry: dict, prefix: str) -> dict:
    with _lock:
        log = read_record(root, name)
        chk = check_record(root, name)
        if not chk["ok"]:
            raise ValueError(f"el registro {name} está roto en {chk['broken_at']}: {chk['reason']}")
        e = {"v": 1, "id": f"{prefix}_{len(log) + 1:06d}", **entry,
             "at": entry.get("at") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "prev": log[-1]["hash"] if log else "genesis"}
        e["hash"] = _canon(e)
        p = Path(root) / DIR / name
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(e, ensure_ascii=False) + "\n")
    return e


def append_records(root: Path, name: str, entries: list[dict], prefix: str) -> list[dict]:
    """Several entries in one write, chained like `append_record` (030: one JUnit report records every rule)."""
    with _lock:
        log = read_record(root, name)
        chk = check_record(root, name)
        if not chk["ok"]:
            raise ValueError(f"el registro {name} está roto en {chk['broken_at']}: {chk['reason']}")
        prev, out = (log[-1]["hash"] if log else "genesis"), []
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for n, entry in enumerate(entries, len(log) + 1):
            e = {"v": 1, "id": f"{prefix}_{n:06d}", **entry, "at": entry.get("at") or now, "prev": prev}
            e["hash"] = _canon(e)
            prev = e["hash"]
            out.append(e)
        p = Path(root) / DIR / name
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as fh:
            fh.write("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in out))
    return out


def text_hash(text: str) -> str:
    return sha(re.sub(r"\s+", " ", text).strip())[:16]


# ---------------------------------------------------------------------------------------------- the ledger
_STATUS = re.compile(r"^\*\*Status\*\*:\s*(.+)$", re.M | re.I)


def _feature_state(root: Path, key: str, d: Path, feat) -> FeatureState:
    raw = (d / "spec.md").read_text(encoding="utf-8")
    m = _STATUS.search(raw)
    status = m.group(1).strip() if m else ""
    by = "status" if status.lower().startswith(("implemented", "implementada", "done", "shipped")) else ""
    if not by and feat.tasks and all(t.done for t in feat.tasks):
        by = "tasks"
    try:
        st = approval_status(root, key, d)
        approval, current = st.state, st.state.startswith("approved") and not st.stale
    except ValueError:
        approval, current = "none", False
    return FeatureState(key, (feat.spec.title if feat.spec else "") or key, status, bool(by), by, approval, current)


def _number(key: str) -> str:
    return key.split("-", 1)[0]


def build(root: Path, citations: list[Citation] | None = None) -> dict:
    """The whole ledger as a dict: features, intents, counts by state and orphan evidence."""
    root = Path(root).resolve()
    feats = discover_features(root)
    cites = scan(root) if citations is None else citations
    by_ref: dict[tuple[str, str], list[Citation]] = {}
    for c in cites:
        by_ref.setdefault((c.feature, c.id), []).append(c)
    runs: dict[str, dict] = {}
    errors: dict[str, dict] = {}
    for r in read_record(root, RUNS_FILE):
        if r.get("error"):
            errors[r["ref"]] = r                              # 030/FR-002: an error never replaces the evidence before it
            continue
        runs[r["ref"]] = r                                    # the latest run per requirement wins
        errors.pop(r["ref"], None)
    features, intents, used = [], [], set()
    src = strength.Sources(root)
    numbers: dict[str, list[str]] = {}
    for key in feats:
        numbers.setdefault(_number(key), []).append(key)
    for key, d in sorted(feats.items()):
        feat = load_feature(d)
        fs = _feature_state(root, key, d, feat)
        features.append(asdict(fs))
        if not feat.spec:
            continue
        findings = run_all(feat, Context())
        unique_number = len(numbers[_number(key)]) == 1
        for r in feat.spec.requirements + feat.spec.success_criteria:
            mine = by_ref.get((key, r.id), []) + (by_ref.get((_number(key), r.id), []) if unique_number else [])
            used.update((c.file, c.line, c.id) for c in mine)
            tests = [c for c in mine if c.kind == "test"]
            code = [c for c in mine if c.kind == "code"]
            th = text_hash(r.text)
            ref = f"{key}/{r.id}"
            run = runs.get(ref)
            last, stale = (run, None) if run and run.get("text_hash") == th else (None, run)
            edited = []
            if last and last.get("test_hashes"):               # 032/FR-002..FR-005: the run proved the tests as they were then
                edited = strength.changed(last["test_hashes"], strength.fingerprints(src, [asdict(c) for c in tests])) or []
                if edited:
                    last, stale = None, last
            if not fs.implemented:
                state = "decided" if fs.approval_current else "proposed"
            elif last:
                state = "verified" if last.get("passed") else "failing"
            else:
                state = "covered" if tests else "built"
            issues = sorted({f.rule for f in findings if r.id in f.ids})
            intents.append(Intent(ref, key, r.id, r.kind, r.text, str(r.loc), th, state, tests, code,
                                  _run_summary(last), _run_summary(stale), issues, last_error=_run_summary(errors.get(ref)),
                                  evidence=strength.evidence_kind(src, [asdict(c) for c in tests]), changed_tests=edited))
    _apply_values(root, intents)
    _run_ages(root, intents)
    orphans = [asdict(c) for c in cites if (c.file, c.line, c.id) not in used]
    counts = {s: sum(1 for i in intents if i.state == s) for s in STATES}
    return {"root": str(root), "features": features, "intents": [i.to_dict() for i in intents], "counts": counts,
            "total": len(intents), "orphans": orphans, "verify_command": verify_command(root),
            "records": {"verifications": check_record(root, RUNS_FILE), "intent": check_record(root, INTENT_FILE)}}


def _apply_values(root: Path, intents: list[Intent]) -> None:
    """029/FR-002, FR-005: a drift or a broken binding makes the rule failing, whatever its tests say."""
    cfg = decided.config(root)
    if not cfg:
        return
    rows = [{"ref": i.ref, "feature": i.feature, "id": i.id, "text": i.text} for i in intents]
    by_ref = {i.ref: i for i in intents}

    def resolve(ref: str) -> tuple[str, str]:
        hit = find({"intents": rows}, ref)
        return hit["ref"], hit["text"]

    from .product import fixed_by, load_product
    ctx = load_product(root)
    for ref, bs in decided.bindings_for(root, cfg, resolve).items():
        i = by_ref.get(ref)
        if i is None:
            continue
        i.values = [b.to_dict() for b in bs]
        bad = [b for b in bs if b.status != "ok"]
        if bad and i.state in TODAY:
            i.state = "failing"
            i.reason = "; ".join(b.reason for b in bad)
            decs = fixed_by(ctx, i.feature, i.id)
            if decs:                                          # 031/FR-003: the number is not only in the spec, someone decided it
                i.reason += " · lo fijó " + ", ".join(f"{rec.id} («{rec.title}»)" for rec, _ in decs)
                for v in i.values:
                    v["decisions"] = [{"id": rec.id, "title": rec.title, "number": num} for rec, num in decs]


def _run_ages(root: Path, intents: list[Intent]) -> None:
    """029/FR-007: how many commits ago the last run of each rule ran."""
    commits = {i.last_run["commit"] for i in intents if i.last_run and i.last_run.get("commit")}
    if not commits:
        return
    ages: dict[str, int | None] = {}
    for c in commits:
        r = _git(root, "rev-list", "--count", f"{c}..HEAD")
        ages[c] = int(r.stdout.strip()) if r.returncode == 0 and r.stdout.strip().isdigit() else None
    for i in intents:
        if i.last_run and i.last_run.get("commit"):
            i.run_age = ages.get(i.last_run["commit"])


def _run_summary(r: dict | None) -> dict | None:
    return None if r is None else {k: r.get(k) for k in ("id", "passed", "at", "commit", "command", "exit_code", "tests", "error", "why")}


def what_it_does(ledger: dict) -> list[dict]:
    """FR-005: the rules the software has today, by feature, with their evidence."""
    titles = {f["key"]: f["title"] for f in ledger["features"]}
    out: dict[str, dict] = {}
    for i in ledger["intents"]:
        if i["state"] not in TODAY:
            continue
        g = out.setdefault(i["feature"], {"feature": i["feature"], "title": titles.get(i["feature"], i["feature"]), "rules": []})
        g["rules"].append({"id": i["id"], "text": i["text"], "state": i["state"], "label": i["label"], "strength": i.get("evidence"),
                           "evidence": [f"{c['file']}:{c['line']}" for c in i["tests"]][:5],
                           **({"why": i["reason"], "changed_by": next((v["changed_by"] for v in i["values"] if v.get("changed_by")), None)}
                              if i.get("reason") else {})})
    return list(out.values())


def find(ledger: dict, ref: str) -> dict:
    """Resolve `028/FR-002`, `028-intent-ledger/FR-002` or `028 FR-002` to one intent."""
    m = re.match(r"^\s*([\w-]+)[\s/:#]+((?:FR|SC)-\d+)\s*$", ref or "", re.I)
    if not m:
        raise ValueError(f"referencia inválida {ref!r}: usá <feature>/<id>, p. ej. 028/FR-002")
    feat, rid = m.group(1), m.group(2).upper()
    hits = [i for i in ledger["intents"] if i["id"] == rid and (i["feature"] == feat or _number(i["feature"]) == feat
                                                              or i["feature"].startswith(feat + "-"))]
    if len(hits) != 1:
        raise ValueError(f"{ref}: " + ("ambigua: " + ", ".join(h["ref"] for h in hits) if hits else "no existe ese requisito"))
    return hits[0]


# ---------------------------------------------------------------------------------------------- verify (FR-006..FR-009)
def _head(root: Path) -> str:
    r = subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def expand(command: str, intent: dict) -> list[str]:
    files = sorted({c["file"] for c in intent["tests"]})
    nodes = sorted({c["node"] or c["file"] for c in intent["tests"]})
    argv = []
    for tok in shlex.split(command):
        argv += files if tok == "{files}" else nodes if tok == "{nodes}" else [tok]
    return argv


def verify(root: Path, ref: str, by: str = "", via: str = "cli", timeout: int = 300) -> dict:
    root = Path(root).resolve()
    led = build(root)
    intent = find(led, ref)
    cmd = led["verify_command"]
    if not cmd:
        return {"ran": False, "ref": intent["ref"],
                "reason": "No hay comando de verificación. Agregá en specreview.toml:\n[ledger]\nverify = \"python -m pytest -q {nodes}\"\n"
                          "({nodes} = los tests que citan el requisito; {files} = sus archivos)"}
    if not intent["tests"]:
        return {"ran": False, "ref": intent["ref"],
                "reason": f"Ningún test cita {intent['ref']}. Citalo en el test como {_number(intent['feature'])}/{intent['id']}."}
    argv = expand(cmd, intent)
    try:
        p = subprocess.run(argv, cwd=root, capture_output=True, text=True, timeout=timeout)
        code, output = p.returncode, (p.stdout + p.stderr)
    except subprocess.TimeoutExpired:
        code, output = -1, f"se cortó después de {timeout} s"
    except OSError as e:
        code, output = -2, f"no se pudo ejecutar {argv[0]!r}: {e}"
    passed, error, why = outcome(root, code, output)
    entry = append_record(root, RUNS_FILE, {
        "ref": intent["ref"], "text_hash": intent["text_hash"], "text": intent["text"], "commit": _head(root),
        "command": shlex.join(argv), "tests": sorted({c["node"] or c["file"] for c in intent["tests"]}),
        "test_hashes": strength.fingerprints(strength.Sources(root), intent["tests"]),       # 032/FR-001
        "passed": passed, **({"error": True} if error else {}), "exit_code": code, "output_tail": output[-2000:], "why": why,
        "by": {"name": by or "anónimo", "via": via}}, "v")
    return {"ran": True, "ref": intent["ref"], "passed": passed, "error": error, "exit_code": code, "entry": entry["id"],
            "command": entry["command"], "output_tail": output[-2000:], "why": why,
            "state": intent["state"] if error else "verified" if passed else "failing"}


def outcome(root: Path, code: int, output: str) -> tuple[bool, bool, str]:
    """(passed, error, why). 030/FR-001: a run that could not start, or that ran no test, is an error, not a broken rule."""
    if code == -2 or NO_RUNNER.search(output):
        return False, True, "no corrió ningún test: el ejecutable o el runner no está disponible (es un problema del entorno, no de la regla)"
    pat = passed_pattern(root)
    if code == 0 and pat and not re.search(pat, output):
        return False, True, f"salió con 0 pero la salida no contiene {pat!r}: no corrió ningún test"
    return code == 0, False, ""


# ---------------------------------------------------------------------------------------------- draft and change (FR-010..FR-013)
def _slug(title: str) -> str:
    plain = unicodedata.normalize("NFKD", title.lower()).encode("ascii", "ignore").decode()     # «Límites» -> limites
    s = re.sub(r"[^a-z0-9]+", "-", plain).strip("-")
    return "-".join(s.split("-")[:5]) or "feature"


def _bullet(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _review(d: Path) -> dict:
    f = load_feature(d)
    return to_dict(build_report(f, run_all(f, Context())))


def draft_feature(root: Path, title: str, requirements: list[str], description: str = "", success_criteria: list[str] | None = None,
                  goals: list[str] | None = None, decisions: list[str] | None = None, by: str = "", via: str = "mcp",
                  reason: str = "", today: str | None = None) -> dict:
    root = Path(root).resolve()
    title = _bullet(title or "")
    reqs = [_bullet(r) for r in requirements or [] if r and r.strip()]
    if not title:
        raise ValueError("falta `title`")
    if not reqs:
        raise ValueError("hace falta al menos un requisito: el qué de la feature")
    specs = root / "specs"
    nums = [int(m.group(1)) for p in (specs.iterdir() if specs.is_dir() else []) if (m := re.match(r"^(\d{3})-", p.name))]
    key = f"{(max(nums) + 1) if nums else 1:03d}-{_slug(title)}"
    d = specs / key
    if d.exists():
        raise ValueError(f"{d} ya existe")
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sc = [_bullet(s) for s in success_criteria or [] if s and s.strip()]
    head = [f"# Feature Specification: {title}", "", f"**Feature Branch**: `{key}`", "", f"**Created**: {today}", "", "**Status**: Draft", ""]
    if goals:
        head += [f"**Goals**: {', '.join(goals)}", ""]
    if decisions:
        head += [f"**Decisions**: {', '.join(decisions)}", ""]
    head += [f"**Input**: User description: \"{_bullet(description) or title}\"", "",
             "## Requirements *(mandatory)*", "", "### Functional Requirements", ""]
    head += [f"- **FR-{n:03d}**: {r}" for n, r in enumerate(reqs, 1)]
    if sc:
        head += ["", "## Success Criteria *(mandatory)*", "", "### Measurable Outcomes", ""]
        head += [f"- **SC-{n:03d}**: {s}" for n, s in enumerate(sc, 1)]
    d.mkdir(parents=True)
    path = d / "spec.md"
    path.write_text("\n".join(head) + "\n", encoding="utf-8")
    rel = str(path.relative_to(root))
    log = append_record(root, INTENT_FILE, {"action": "draft", "feature": key, "ref": key, "before": None,
                                            "after": "\n".join(reqs + sc), "reason": reason, "by": {"name": by or "anónimo", "via": via}}, "i")
    rep = _review(d)
    return {"feature": key, "wrote": [rel], "record": log["id"], "verdict": rep["decision"]["verdict"],
            "findings": [{k: f[k] for k in ("rule", "severity", "ids", "message", "fix")} for f in rep["findings"]],
            "next_step": "Es una propuesta (Draft): una persona la aprueba. Seguí con plan.md y tasks.md, o corregí los requisitos con change_requirement."}


_REQ_LINE = re.compile(r"^(\s*[-*]\s*\*\*)((?:FR|SC)-\d{3})(\*\*\s*:?\s*)(.*)$")


def change_requirement(root: Path, feature: str, text: str, rid: str | None = None, kind: str = "FR", reason: str = "",
                       by: str = "", via: str = "mcp") -> dict:
    """Reword `rid`, or add a new requirement when `rid` is None. Writes only that spec.md."""
    root = Path(root).resolve()
    text = _bullet(text or "")
    if not text:
        raise ValueError("falta `text`: el requisito como debe quedar")
    feats = discover_features(root)
    match = [n for n in feats if n == feature or n.startswith(feature + "-") or _number(n) == feature]
    if len(match) != 1:
        raise ValueError(f"feature {feature!r} " + ("ambigua: " + ", ".join(match) if match else "no existe"))
    key, d = match[0], feats[match[0]]
    path = d / "spec.md"
    before_approval = approval_status(root, key, d)
    lines = path.read_text(encoding="utf-8").splitlines()
    spec = parse_spec(path, str(path.relative_to(root)))
    reqs: dict[str, Requirement] = {r.id: r for r in spec.requirements + spec.success_criteria}
    if rid:
        rid = rid.upper()
        if rid not in reqs:
            raise ValueError(f"{key} no tiene {rid}; existen: {', '.join(reqs)}")
        idx = next((i for i, l in enumerate(lines) if (m := _REQ_LINE.match(l)) and m.group(2) == rid), None)
        if idx is None:
            raise ValueError(f"no encontré la línea de {rid} en {path.name}")
        before = reqs[rid].text
        m = _REQ_LINE.match(lines[idx])
        lines[idx] = f"{m.group(1)}{rid}{m.group(3) if m.group(3).strip() else '**: '}{text}"
        action = "change"
    else:
        kind = (kind or "FR").upper()
        if kind not in ("FR", "SC"):
            raise ValueError("kind debe ser FR o SC")
        same = [i for i, l in enumerate(lines) if (m := _REQ_LINE.match(l)) and m.group(2).startswith(kind)]
        n = max([int(r.split("-")[1]) for r in reqs if r.startswith(kind)] or [0]) + 1
        rid, before, action = f"{kind}-{n:03d}", None, "add"
        new = f"- **{rid}**: {text}"
        if same:
            lines.insert(same[-1] + 1, new)
        else:
            header = "### Functional Requirements" if kind == "FR" else "### Measurable Outcomes"
            at = next((i for i, l in enumerate(lines) if l.strip().lower() == header.lower()), None)
            if at is None:
                lines += ["", header, ""]
                at = len(lines) - 1
            lines.insert(at + 1, "")
            lines.insert(at + 2, new)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    rep = _review(d)
    rel = str(path.relative_to(root))
    log = append_record(root, INTENT_FILE, {"action": action, "feature": key, "ref": f"{key}/{rid}", "before": before,
                                            "after": text, "reason": reason, "by": {"name": by or "anónimo", "via": via}}, "i")
    approved_before = before_approval.state.startswith("approved") and not before_approval.stale
    touches = {"bindings": [], "rules": [], "decisions": []}
    if before:
        cfg = decided.config(root)
        rows = [{"ref": f"{key}/{r.id}", "feature": key, "id": r.id, "text": r.text} for r in reqs.values()]
        touches = decided.impact(root, before, text, {k: v for k, v in cfg.items() if _same_rule(k, key, rid)},
                                 [(x["ref"], x["text"]) for x in rows if x["id"] != rid])
        from .product import fixed_by, load_product
        from .values import _norm, numbers
        now = numbers(text)
        touches["decisions"] = [{"id": rec.id, "title": rec.title, "number": num, "loc": str(rec.loc)}
                                for rec, num in fixed_by(load_product(root), key, rid) if _norm(num) not in now]     # 031/FR-004
    return {"ref": f"{key}/{rid}", "action": action, "touches": touches, "wrote": [rel], "record": log["id"], "before": before, "after": text,
            "moved": [{"from": a, "to": b} for a, b in moved_values(before, text)] if before else [],
            "findings": [{k: f[k] for k in ("rule", "severity", "ids", "message", "fix")} for f in rep["findings"] if rid in f["ids"]],
            "verdict": rep["decision"]["verdict"],
            "approval": ("La aprobación de esta feature ya no cubre la spec: una persona tiene que volver a decidir." if approved_before
                         else None),
            "decision": (" ".join(f"{d['id']} fijó {d['number']} para esta regla: una persona tiene que decidir de nuevo (una decisión que reemplace a "
                                  f"{d['id']}), o la regla vuelve a {d['number']}." for d in touches["decisions"]) or None)}


def _same_rule(cfg_ref: str, key: str, rid: str) -> bool:
    m = re.match(r"^\s*([\w-]+)[\s/:#]+((?:FR|SC)-\d+)\s*$", cfg_ref, re.I)
    return bool(m) and m.group(2).upper() == rid and (m.group(1) == key or m.group(1) == _number(key) or key.startswith(m.group(1) + "-"))


# ---------------------------------------------------------------------------------------------- history (FR-014..FR-016)
def _git(root: Path, *a) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(root), *a], capture_output=True, text=True)


def _parse_text(text: str, name: str) -> dict[str, str]:
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "spec.md"
        p.write_text(text, encoding="utf-8")
        s = parse_spec(p, name)
    return {r.id: r.text for r in s.requirements + s.success_criteria}


def history(root: Path, ref: str) -> dict:
    root = Path(root).resolve()
    led = build(root)
    intent = find(led, ref)
    key, rid = intent["feature"], intent["id"]
    spec_path = discover_features(root)[key] / "spec.md"
    events: list[dict] = []
    available = _git(root, "rev-parse", "--is-inside-work-tree").returncode == 0
    if available:
        top = Path(_git(root, "rev-parse", "--show-toplevel").stdout.strip())
        rel = str(spec_path.resolve().relative_to(top.resolve()))
        log = _git(root, "log", "--follow", "--name-only", "--format=\x1e%H\x1f%an\x1f%aI\x1f%s", "--", rel).stdout
        commits = []
        for chunk in log.split("\x1e")[1:]:
            head, *rest = chunk.strip("\n").split("\n")
            h, author, date, subject = head.split("\x1f")
            path = next((x for x in rest if x.strip()), rel)
            commits.append((h, author, date, subject, path))
        prev = None
        for h, author, date, subject, path in reversed(commits):
            shown = _git(top, "show", f"{h}:{path}")
            cur = _parse_text(shown.stdout, path).get(rid) if shown.returncode == 0 else None
            kind = _kind(prev, cur)
            if kind:
                events.append({"type": "version", "kind": kind, "at": date, "by": author, "commit": h[:7], "subject": subject,
                               "text": cur, "before": prev})
            prev = cur
        now = intent["text"]
        if _kind(prev, now):
            events.append({"type": "version", "kind": _kind(prev, now), "at": None, "by": None, "commit": None,
                           "subject": "", "uncommitted": True, "text": now, "before": prev})
    else:
        events.append({"type": "version", "kind": "current", "at": None, "by": None, "commit": None, "subject": "", "text": intent["text"],
                       "before": None})
    for a in reversed(approval_history(root, key)):
        events.append({"type": "approval", "at": a["at"], "by": a["by"].get("name"), "decision": a["decision"],
                       "reason": a.get("reason", ""), "entry": a["id"]})
    for e in read_record(root, INTENT_FILE):
        if e.get("ref") == intent["ref"] or (e["action"] == "draft" and e.get("ref") == key):
            events.append({"type": "intent", "at": e["at"], "by": e["by"].get("name"), "via": e["by"].get("via"), "action": e["action"],
                           "before": e.get("before"), "after": e.get("after") if e["action"] != "draft" else None,
                           "reason": e.get("reason", ""), "entry": e["id"]})
    for r in read_record(root, RUNS_FILE):
        if r["ref"] == intent["ref"]:
            events.append({"type": "verification", "at": r["at"], "by": r["by"].get("name"), "passed": r["passed"], "commit": r.get("commit"),
                           "current_text": r.get("text_hash") == intent["text_hash"], "entry": r["id"]})
    order = {"version": 0, "intent": 1, "approval": 2, "verification": 3}
    events.sort(key=lambda e: (e["at"] is None, _utc(e["at"]), order[e["type"]]))
    return {"ref": intent["ref"], "text": intent["text"], "state": intent["state"], "label": intent["label"],
            "git": available, "note": "" if available else "Sin historial de git: sólo se muestra la versión actual.", "timeline": events}


def _utc(at: str | None) -> str:
    if not at:
        return ""
    try:
        return datetime.fromisoformat(at.replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return at


def _kind(before: str | None, after: str | None) -> str | None:
    if before is None and after is None:
        return None
    if before is None:
        return "added"
    if after is None:
        return "removed"
    return "changed" if re.sub(r"\s+", " ", before).strip() != re.sub(r"\s+", " ", after).strip() else None


# ---------------------------------------------------------------------------------------------- rendering (FR-017)
def render_text(led: dict, verbose: bool = False) -> str:
    c = led["counts"]
    out = [f"El qué: {led['total']} reglas en {len(led['features'])} features",
           "  " + " · ".join(f"{LABEL[s]} {c[s]}" for s in STATES), ""]
    broken = [i for i in led["intents"] if i["state"] == "failing"]
    if broken:
        out.append(f"Rotas ({len(broken)}): el software ya no hace lo que dice la regla")
        out += [f"  {i['ref']}: {why(i)}" for i in broken] + [""]
    edited = [i for i in led["intents"] if i.get("changed_tests")]
    if edited:
        out.append(f"Tests editados desde su última corrida ({len(edited)}): la verificación anterior ya no cuenta")
        out += [f"  {i['ref']}: {', '.join(i['changed_tests'][:3])}" for i in edited] + [""]
    by_feat: dict[str, list[dict]] = {}
    for i in led["intents"]:
        by_feat.setdefault(i["feature"], []).append(i)
    titles = {f["key"]: f for f in led["features"]}
    for key, items in by_feat.items():
        f = titles[key]
        tag = "implementada" if f["implemented"] else ("aprobada" if f["approval_current"] else "propuesta")
        out.append(f"{key} · {f['title']} ({tag})")
        for i in items:
            ev = f"  ← {', '.join(t['file'] + ':' + str(t['line']) for t in i['tests'][:2])}" if i["tests"] and verbose else ""
            label = i["label"] + (f" · {strength.KINDS[i['evidence']]}" if i.get("evidence") and i["state"] in ("covered", "verified", "failing") else "")
            out.append(f"  [{label:<20}] {i['id']}: {_short(i['text'])}{ev}")
        out.append("")
    if led["orphans"]:
        out.append(f"Evidencia huérfana ({len(led['orphans'])}): citas a requisitos que no existen")
        out += [f"  {o['file']}:{o['line']} → {o['feature']}/{o['id']}" for o in led["orphans"][:20]]
    for name, chk in led["records"].items():
        if not chk["ok"]:
            out.append(f"⚠ registro {name} roto en {chk['broken_at']}: {chk['reason']}")
    return "\n".join(out).rstrip() + "\n"


def render_markdown(led: dict) -> str:
    c = led["counts"]
    out = ["## El qué", "", f"**{led['total']}** reglas en **{len(led['features'])}** features.", "",
           "| " + " | ".join(LABEL[s] for s in STATES) + " |", "|" + "---|" * len(STATES), "| " + " | ".join(str(c[s]) for s in STATES) + " |", ""]
    by_feat: dict[str, list[dict]] = {}
    for i in led["intents"]:
        by_feat.setdefault(i["feature"], []).append(i)
    for key, items in by_feat.items():
        out += [f"### `{key}`", ""]
        out += [f"- **{i['id']}** _{i['label']}_: {_short(i['text'], 140)}" + (f" ← `{i['tests'][0]['file']}:{i['tests'][0]['line']}`" if i["tests"] else "")
                for i in items]
        out.append("")
    if led["orphans"]:
        out += ["### Evidencia huérfana", ""] + [f"- `{o['file']}:{o['line']}` cita {o['feature']}/{o['id']}, que no existe" for o in led["orphans"]]
    return "\n".join(out).rstrip() + "\n"


def why(i: dict) -> str:
    """One line for a failing rule: the drift and who changed it (029/FR-002, FR-003), or the failed run."""
    if i.get("reason"):
        who = next((v["changed_by"] for v in i.get("values", []) if v.get("changed_by")), None)
        tail = ""
        if who and who.get("commit"):
            tail = f" · cambiado en {who['commit']} por {who['author']} el {(who['date'] or '')[:10]} («{who['subject']}»)"
        elif who:
            tail = " · cambio sin commitear"
        return i["reason"] + tail
    run = i.get("last_run") or {}
    age = i.get("run_age")
    return f"falló su última corrida ({run.get('id', '?')}, commit {run.get('commit') or '?'}" + (f", hace {age} commits" if age else "") + ")"


def _short(s: str, n: int = 100) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def strict_problems(led: dict) -> list[str]:
    """FR-018: what makes `--strict` fail."""
    return [f"{i['ref']}: {i['label']}" + (f" ({why(i)})" if i["state"] == "failing" else "")
            for i in led["intents"] if i["state"] in ("built", "failing")]
