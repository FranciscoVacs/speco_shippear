"""Subcommands: `specreview init | baseline | waive`. Kept apart so the flat `specreview <path>` CLI stays as it was."""
from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

from . import suppress
from .analyzers import Context, run_all
from .parser import load_feature
from .parser.loader import FeatureNotFound, discover_features, no_features_hint
from .report import build_report
from .templates import (AGENT_RULES, AGENT_RULES_BEGIN, AGENT_RULES_END, AGENT_TARGETS, CONFIG_TEMPLATE, GIT_HOOK,
                        GIT_HOOK_MARK, WORKFLOW_TEMPLATE)


def run_subcommand(name: str, argv: list[str]) -> int:
    try:
        return {"demo": _demo, "init": _init, "baseline": _baseline, "waive": _waive, "mcp": _mcp, "gate": _gate, "diff": _diff, "product": _product, "member": _member, "approvals": _approvals, "notify": _notify, "jira": _jira, "ledger": _ledger, "verification": _verification}[name](argv)
    except (ValueError, FeatureNotFound) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


def _root(path: str) -> Path:
    from .cli import _repo_root
    return _repo_root(path)


def _reports(root: Path):
    feats = discover_features(root)
    if not feats:
        raise ValueError(f"no encontré features (specs/*/spec.md) en {root}{no_features_hint(root)}")
    cfg = suppress.load_config(root)
    for n, d in feats.items():
        if n in cfg.ignore_features:
            continue
        f = load_feature(d)
        yield build_report(f, run_all(f, Context()))


def _demo(argv: list[str]) -> int:
    """Review a bundled sample feature so a new user sees a result with zero setup (no repo, no network, no API key)."""
    import shutil
    import tempfile
    from importlib.resources import as_file, files

    ap = argparse.ArgumentParser(prog="specreview demo", description="Revisar una feature de ejemplo incluida (wire-transfers): tu primer hallazgo en segundos, sin repo propio.")
    ap.add_argument("--dir", help="copiar el ejemplo acá (debe no existir o estar vacía) en vez de a una carpeta temporal")
    ap.add_argument("--all-findings", action="store_true", help="mostrar también advertencias y sugerencias (por defecto sólo los bloqueantes)")
    ap.add_argument("--color", choices=["auto", "always", "never"], default="auto")
    a = ap.parse_args(argv)
    src = files("specreview").joinpath("demo_data", "wire-transfers")
    if not src.is_dir():
        raise ValueError("este paquete no incluye el ejemplo (¿instalación incompleta?); probá con examples/wire-transfers del repo")
    if a.dir:
        dest = Path(a.dir)
        if dest.exists() and any(dest.iterdir()):
            raise ValueError(f"{dest} ya existe y no está vacía; elegí otra carpeta con --dir")
        dest.mkdir(parents=True, exist_ok=True)
    else:
        dest = Path(tempfile.mkdtemp(prefix="specreview-demo-"))
    with as_file(src) as real:
        shutil.copytree(real, dest, dirs_exist_ok=True)
    shown = str(dest)
    print(f"Ejemplo: una spec de transferencias bancarias con problemas reales (copiada a {shown})\n")
    from .cli import main
    args = [shown, "-v", "--color", a.color] + ([] if a.all_findings else ["--min-severity", "blocker"])
    main(args)                                      # exit code of the review is irrelevant here: the demo is meant to have findings
    print(f"""
Qué viste: dos bloqueantes que hoy cuestan minutos y, después de implementar, semanas.
Seguí con:
  specreview {shown}
      todos los hallazgos de este ejemplo
  specreview mcp {shown}
      el servidor MCP sobre este ejemplo, para conectarlo a tu agente
  specreview --explain COV001
      qué significa una regla (--rules las lista)
  specreview .
      sobre tus propias specs, parado en la raíz de tu repo""")
    return 0


def _init(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="specreview init", description="Dejar el repo listo para correr specreview en cada PR.")
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("--force", action="store_true", help="sobrescribir archivos existentes")
    ap.add_argument("--no-workflow", action="store_true", help="no escribir el workflow de GitHub Actions")
    ap.add_argument("--agents", nargs="?", const="all", metavar="DESTINOS",
                    help="escribir las instrucciones para el agente (spec-review) en: " + ", ".join(AGENT_TARGETS) + " o all; separados por coma")
    a = ap.parse_args(argv)
    root = _root(a.path)
    if not discover_features(root):
        raise ValueError(f"no encontré features Spec Kit (specs/*/spec.md) en {root}: ¿es la raíz del repo?{no_features_hint(root)}")
    wrote, skipped = [], []
    if a.agents:
        for rel, state in _write_agent_rules(root, a.agents):
            print(f"{state:<10} {rel}")
    targets = [(root / "specreview.toml", CONFIG_TEMPLATE)]
    if not a.no_workflow:
        targets.append((root / ".github" / "workflows" / "specreview.yml", WORKFLOW_TEMPLATE))
    for p, body in targets:
        if p.exists() and not a.force:
            skipped.append(p)
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
        wrote.append(p)
    for p in wrote:
        print(f"creado   {p.relative_to(root)}")
    for p in skipped:
        print(f"existe   {p.relative_to(root)} (usar --force para sobrescribir)")
    print("\nSiguiente paso: si el repo ya tiene deuda, `specreview baseline` para que el PR sólo hable de lo nuevo.")
    return 0


def _write_agent_rules(root: Path, spec: str) -> list[tuple[str, str]]:
    """Put the spec-review instructions where each agent reads them. The block is delimited by markers, so re-running updates it
    and never touches what the team wrote around it. Returns [(relative path, creado|actualizado|igual)]."""
    names = list(AGENT_TARGETS) if spec == "all" else [n.strip() for n in spec.split(",") if n.strip()]
    unknown = [n for n in names if n not in AGENT_TARGETS]
    if unknown:
        raise ValueError(f"destino desconocido: {', '.join(unknown)} (opciones: all, {', '.join(AGENT_TARGETS)})")
    block = f"{AGENT_RULES_BEGIN}\n{AGENT_RULES}{AGENT_RULES_END}\n"
    out = []
    for n in names:
        rel, front = AGENT_TARGETS[n]
        p = root / rel
        old = p.read_text(encoding="utf-8") if p.exists() else None
        if old is None:
            new, state = front + block, "creado"
        elif AGENT_RULES_BEGIN in old and AGENT_RULES_END in old:
            head, rest = old.split(AGENT_RULES_BEGIN, 1)
            new, state = head + block + rest.split(AGENT_RULES_END, 1)[1].lstrip("\n"), "actualizado"
        else:
            new, state = old.rstrip("\n") + "\n\n" + block, "actualizado"
        if new == old:
            state = "igual"
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(new, encoding="utf-8")
        out.append((rel, state))
    return out


def _install_git_hook(root: Path, name: str) -> str:
    """Append the gate to .git/hooks/<name> (pre-commit or pre-push) without clobbering an existing hook."""
    git = root / ".git"
    if not git.is_dir():
        raise ValueError(f"{root} no es la raíz de un repo git (no hay .git/): no hay dónde instalar el hook")
    p = git / "hooks" / name
    p.parent.mkdir(exist_ok=True)
    old = p.read_text(encoding="utf-8") if p.exists() else ""
    if GIT_HOOK_MARK in old:
        return f"ya estaba instalado en .git/hooks/{name}"
    p.write_text((old.rstrip("\n") + "\n\n" if old else "#!/bin/sh\n") + GIT_HOOK, encoding="utf-8")
    p.chmod(p.stat().st_mode | 0o111)
    return f"instalado en .git/hooks/{name}"


def _baseline(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="specreview baseline", description="Registrar los hallazgos actuales como deuda conocida.")
    ap.add_argument("path", nargs="?", default=".")
    a = ap.parse_args(argv)
    root = _root(a.path)
    p, n = suppress.write_baseline(root, list(_reports(root)))
    print(f"baseline: {n} hallazgos registrados en {p.relative_to(root)}")
    print("De ahora en más specreview sólo reporta hallazgos nuevos. Commiteá el archivo.")
    return 0


def _waive(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="specreview waive", description="Aceptar un hallazgo con motivo y autor.")
    ap.add_argument("fingerprint", help="el fingerprint del hallazgo (aparece en -f json y en el check del PR)")
    ap.add_argument("--reason", required=True, help="por qué se acepta")
    ap.add_argument("--author", default=None, help="quién lo acepta (default: usuario del sistema)")
    ap.add_argument("--expires", metavar="YYYY-MM-DD", help="fecha en la que el waiver deja de valer")
    ap.add_argument("--path", default=".")
    a = ap.parse_args(argv)
    root = _root(a.path)
    known = {suppress.fingerprint(r.feature, f) for r in _reports(root) for f in r.findings}
    if a.fingerprint not in known:
        raise ValueError(f"ningún hallazgo actual tiene el fingerprint {a.fingerprint!r} (¿ya se arregló o está en baseline?)")
    e = suppress.add_waiver(root, a.fingerprint, a.reason, a.author or _whoami(), expires=a.expires)
    print(f"waiver registrado: {e['fingerprint']} por {e['author']} el {e['date']}: {e['reason']}")
    return 0


def _whoami() -> str:
    try:
        return getpass.getuser()
    except Exception:
        return "unknown"


def _mcp(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="specreview mcp", description="Servidor MCP (stdio) para agentes de código.")
    ap.add_argument("root", nargs="?", default=".")
    a = ap.parse_args(argv)
    from .mcp import serve
    return serve(_root(a.root))


def _git_base_copy(root: Path, base: str, dest: Path) -> None:
    """Writes the spec and product files of the merge base of `base` and HEAD into `dest`, without touching the working tree."""
    import subprocess

    def git(*a):
        return subprocess.run(["git", "-C", str(root), *a], capture_output=True, text=True, encoding="utf-8")
    top = git("rev-parse", "--show-toplevel")
    if top.returncode != 0:
        raise ValueError(f"diff necesita un repositorio git ({root})")
    mb = git("merge-base", base, "HEAD")
    rev = mb.stdout.strip() if mb.returncode == 0 else base
    prefix = Path(root).resolve().relative_to(Path(top.stdout.strip()).resolve()).as_posix()
    prefix = "" if prefix == "." else prefix + "/"
    ls = git("ls-tree", "-r", "--name-only", rev, "--", f"{prefix}specs", f"{prefix}product")
    if ls.returncode != 0:
        raise ValueError(f"no pude leer {base!r}: ¿existe la rama o el commit?\n{ls.stderr.strip()}")
    for name in ls.stdout.splitlines():
        if not name.endswith(".md"):
            continue
        out = dest / name[len(prefix):]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(git("show", f"{rev}:{name}").stdout, encoding="utf-8")


def _diff(argv: list[str]) -> int:
    """What the current specs change in the business against BASE: the comment the GitHub App posts on a PR (docs/32)."""
    import json
    import tempfile
    from dataclasses import asdict

    from . import values
    from .intent_diff import MARKER, diff_product, diff_trees, render_comment
    ap = argparse.ArgumentParser(prog="specreview diff", description="Qué cambia en el negocio respecto de BASE (el comentario de la PR, en la terminal).")
    ap.add_argument("base", nargs="?", default="origin/main", help="rama o commit contra el que comparar (default: origin/main, desde donde se separó tu rama)")
    ap.add_argument("--path", default=".", help="raíz del repo (default: .)")
    ap.add_argument("-f", "--format", choices=["text", "markdown", "json"], default="text")
    a = ap.parse_args(argv)
    root = _root(a.path)
    with tempfile.TemporaryDirectory(prefix="specreview-base-") as tmp:
        _git_base_copy(root, a.base, Path(tmp))
        diffs = diff_trees(Path(tmp), root)
        product = diff_product(Path(tmp), root)
    from .verification import annotate
    annotate(diffs, root)
    moved = values.introduced(root, lambda path: _git_show(root, a.base, path))
    from . import ledger, strength
    edited = strength.edited_tests(ledger.build(root), lambda path: _git_show(root, a.base, path))      # 032/FR-006
    if a.format == "json":
        print(json.dumps([asdict(d) for d in diffs], ensure_ascii=False, indent=1, default=str))
    else:
        body = render_comment(diffs, subject="Este cambio" if a.format == "text" else "Esta PR", product=product, values=moved, edited=edited)
        print(body if a.format == "markdown" else body.removeprefix(MARKER + "\n"), end="")
    return 1 if any(d.new_blockers for d in diffs) or moved else 0


def _git_show(root: Path, base: str, path: str) -> str | None:
    """A file as it was at the merge base of `base` and HEAD; None when it did not exist there."""
    import subprocess
    mb = subprocess.run(["git", "-C", str(root), "merge-base", base, "HEAD"], capture_output=True, text=True)
    rev = mb.stdout.strip() if mb.returncode == 0 else base
    r = subprocess.run(["git", "-C", str(root), "show", f"{rev}:./{path}"], capture_output=True, text=True, encoding="utf-8")
    return r.stdout if r.returncode == 0 else None


def _verification(argv: list[str]) -> int:
    """Which requirements a test, a property or a proof cites (docs/37): the trace from what was decided to what checks it."""
    import json
    from dataclasses import asdict

    from .verification import render, summary, trace
    ap = argparse.ArgumentParser(prog="specreview verification", description="Qué requisitos verifica algún test, propiedad o prueba (líneas `verifies[nivel]: 010/FR-003`).")
    ap.add_argument("path", nargs="?", default=".", help="raíz del repo (default: .)")
    ap.add_argument("-f", "--format", choices=["text", "markdown", "json"], default="text")
    a = ap.parse_args(argv)
    t = trace(_root(a.path))
    if a.format == "json":
        print(json.dumps({"summary": summary(t), "features": [asdict(f) for f in t.features], "broken": [asdict(x) for x in t.broken]},
                         ensure_ascii=False, indent=1))
    else:
        print(render(t, markdown=a.format == "markdown"), end="")
    return 1 if t.broken else 0


def _gate(argv: list[str]) -> int:
    """Exit 2 (block) with the blockers on stderr if the newest feature cannot be implemented yet. Used by the plugin hook."""
    ap = argparse.ArgumentParser(prog="specreview gate", description="Frenar la implementación si la spec tiene bloqueantes.")
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--feature")
    ap.add_argument("--install-hook", choices=["pre-commit", "pre-push"], metavar="{pre-commit,pre-push}",
                    help="instalar el gate como hook de git (el enforcement duro fuera de Claude Code) y salir")
    ap.add_argument("--hook", action="store_true",
                    help="modo hook de Claude Code: lee el JSON de stdin y sólo actúa si el prompt pide implementar")
    a = ap.parse_args(argv)
    if a.install_hook:
        print(f"specreview gate: {_install_git_hook(_root(a.root), a.install_hook)}")
        return 0
    if a.hook:
        import json
        try:
            prompt = str(json.loads(sys.stdin.read() or "{}").get("prompt", ""))
        except ValueError:
            return 0
        if "speckit.implement" not in prompt and "/implement" not in prompt:
            return 0
    from .mcp import Server, ToolError
    try:
        res = Server(_root(a.root)).t_get_blockers({"feature": a.feature})
    except ToolError as e:
        print(f"specreview: {e}", file=sys.stderr)
        return 0                                    # no Spec Kit repo / unknown feature: never get in the way
    if res["can_implement"]:
        return 0
    print(f"specreview: {res['feature']} tiene {len(res['blockers'])} bloqueante(s); " + res["next_step"], file=sys.stderr)
    for f in res["blockers"][:10]:
        print(f"  - {f['rule']} {' + '.join(f['ids'])} ({f['location']['file']}:{f['location']['line']}): {f['message']}", file=sys.stderr)
    return 2


def _product(argv: list[str]) -> int:
    """Goals -> features: which objectives are covered, which nobody builds, which features answer to no objective."""
    import json
    ap = argparse.ArgumentParser(prog="specreview product", description="Trazabilidad objetivo → feature (capa de producto).")
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("-f", "--format", choices=["text", "json"], default="text")
    ap.add_argument("--fail-on", choices=["warning", "never"], default="never", help="exit 1 si hay objetivos sin feature")
    a = ap.parse_args(argv)
    from .product import product_report
    root = _root(a.path)
    rep = product_report(root, discover_features(root))
    if rep is None:
        raise ValueError(f"no hay carpeta product/ en {root} (goals.md y decisions.md): la capa de producto es opt-in")
    if a.format == "json":
        print(json.dumps(rep, indent=2, ensure_ascii=False))
    else:
        print("Objetivos")
        for g in rep["goals"]:
            mark = "✔" if g["covered"] else "✘"
            print(f"  {mark} {g['id']}  {g['text']}" + (f"  ← {', '.join(g['features'])}" if g["covered"] else "  ← nadie lo construye"))
        if rep["features_without_goal"]:
            print("\nFeatures sin objetivo declarado: " + ", ".join(rep["features_without_goal"]))
        print(f"\nDecisiones registradas: {len(rep['decisions'])}")
    return 1 if a.fail_on == "warning" and rep["findings"] else 0


def _ledger(argv: list[str]) -> int:
    """The intent ledger (spec 028): every rule, its state and its evidence; plus verify and history of one rule."""
    import json
    import subprocess
    from . import ledger
    ap = argparse.ArgumentParser(prog="specreview ledger", description="El qué: cada regla de las specs, cuánta evidencia la respalda y cómo llegó acá.")
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("-f", "--format", choices=["text", "json", "markdown"], default="text")
    ap.add_argument("-v", "--verbose", action="store_true", help="mostrar dónde la cita cada test")
    ap.add_argument("--today", action="store_true", help="sólo lo que el software hace hoy (construido, con test, verificado o roto)")
    ap.add_argument("--strict", action="store_true", help="exit 1 si una regla construida no tiene test o una verificación falló")
    ap.add_argument("--verify", metavar="REF", help="correr los tests que citan REF (p. ej. 028/FR-002) con el comando de [ledger] verify")
    ap.add_argument("--history", metavar="REF", help="versiones, aprobaciones, cambios y verificaciones de REF, en orden")
    ap.add_argument("--junit", metavar="FILE", help="registrar todas las reglas desde un reporte JUnit (pytest --junitxml) del commit actual")
    ap.add_argument("--verify-all", action="store_true", help="correr una vez la suite de [ledger] suite (con {junit}) y registrar todas las reglas")
    ap.add_argument("--no-record", action="store_true", help="con --junit/--verify-all: sólo decir qué reglas rompe la corrida, sin registrarla")
    ap.add_argument("--suggest-values", action="store_true", help="proponer el bloque [values]: reglas con un número y la línea de código que lo guarda")
    ap.add_argument("--shape", action="store_true", help="cuántos requisitos son invariantes, condicionales o no formalizables (docs/37 §7)")
    a = ap.parse_args(argv)
    root = _root(a.path)
    if a.shape:
        from . import strength
        sh = strength.shapes(ledger.build(root))
        print(json.dumps(sh, indent=2, ensure_ascii=False) if a.format == "json" else strength.render_shapes(sh), end="" if a.format != "json" else "\n")
        return 0
    if a.verify:
        git_name = subprocess.run(["git", "-C", str(root), "config", "user.name"], capture_output=True, text=True).stdout.strip()
        r = ledger.verify(root, a.verify, by=git_name or _whoami(), via="cli")
        if a.format == "json":
            print(json.dumps(r, indent=2, ensure_ascii=False))
        elif not r["ran"]:
            print(r["reason"])
        else:
            verdict = "ERROR, no cuenta" if r.get("error") else "verificada" if r["passed"] else "ROTA"
            print(f"{r['ref']}: {verdict} ({r['command']}) · registro {r['entry']}")
            if r.get("why"):
                print(r["why"])
            if not r["passed"]:
                print(r["output_tail"])
        return 0 if r.get("passed") else 2 if r.get("error") else 1
    if a.suggest_values:
        from . import evidence
        found = evidence.suggest_values(root)
        if a.format == "json":
            print(json.dumps(found, indent=2, ensure_ascii=False))
        elif found:
            print(f"# {len(found)} propuestas para {len({f['ref'] for f in found})} reglas. Revisalas: no se escribió nada.\n" + evidence.to_toml(found), end="")
        else:
            print("Ninguna regla con un número tiene una línea de código que lo guarde junto a un nombre parecido.")
        return 0
    if a.junit or a.verify_all:
        return _ledger_suite(root, a, git_name=subprocess.run(["git", "-C", str(root), "config", "user.name"], capture_output=True, text=True).stdout.strip())
    if a.history:
        h = ledger.history(root, a.history)
        if a.format == "json":
            print(json.dumps(h, indent=2, ensure_ascii=False))
            return 0
        print(f"{h['ref']} · {h['label']}\n  «{h['text']}»\n")
        if h["note"]:
            print(h["note"])
        for e in h["timeline"]:
            when = (e["at"] or "ahora")[:10]
            if e["type"] == "version":
                print(f"  {when}  {e['kind']:<8} {e['commit'] or '-':<8} {e['by'] or ''} · {'sin commitear' if e.get('uncommitted') else e['subject']}\n            «{e['text']}»")
            elif e["type"] == "intent":
                print(f"  {when}  {e['action']:<8} {e['entry']:<8} {e['by']} ({e['via']}) · {e['reason'] or 'sin motivo'}")
            elif e["type"] == "approval":
                print(f"  {when}  {e['decision']:<8} {e['entry']:<8} {e['by']} · {e['reason']}")
            else:
                print(f"  {when}  {'pasó' if e['passed'] else 'falló':<8} {e['entry']:<8} {e['by']}" + ("" if e["current_text"] else " · sobre otro texto"))
        return 0
    led = ledger.build(root)
    if a.today:
        today = ledger.what_it_does(led)
        if a.format == "json":
            print(json.dumps(today, indent=2, ensure_ascii=False))
        else:
            for g in today:
                print(f"{g['feature']} · {g['title']}")
                print("\n".join(f"  [{r['label']}] {r['id']}: {r['text']}" + (f"\n      ↳ {r['why']}" if r.get("why") else "")
                                for r in g["rules"]) + "\n")
    elif a.format == "json":
        print(json.dumps(led, indent=2, ensure_ascii=False))
    else:
        print(ledger.render_markdown(led) if a.format == "markdown" else ledger.render_text(led, a.verbose), end="")
    problems = ledger.strict_problems(led)
    if a.strict and problems:
        print(f"\n--strict: {len(problems)} reglas sin respaldo:\n  " + "\n  ".join(problems[:30]), file=sys.stderr)
        return 1
    return 0


def _ledger_suite(root: Path, a, git_name: str = "") -> int:
    """030/FR-006, FR-007: one run of the suite (or its report) for every rule; exit 1 when the run breaks a rule."""
    import json
    import shlex
    import subprocess
    import tempfile

    from . import evidence, ledger
    by = git_name or _whoami()
    if a.junit:
        report = Path(a.junit)
        r = evidence.import_junit(root, report, by=by, record=not a.no_record)
    else:
        cmd = ledger.suite_command(root)
        if not cmd:
            print("No hay comando de suite. Agregá en specreview.toml:\n[ledger]\nsuite = \"python -m pytest -q --junitxml {junit}\"")
            return 2
        with tempfile.TemporaryDirectory(prefix="specreview-suite-") as tmp:
            report = Path(tmp) / "junit.xml"
            argv = [str(report) if t == "{junit}" else t.replace("{junit}", str(report)) for t in shlex.split(cmd)]
            try:
                p = subprocess.run(argv, cwd=root, capture_output=True, text=True, timeout=3600)
            except (OSError, subprocess.TimeoutExpired) as e:
                print(f"No se pudo correr la suite ({argv[0]}): {e}. Es un problema del entorno: no se registró nada.")
                return 2
            if not report.is_file():
                print("La suite no escribió el reporte JUnit: no se registró nada (¿falta {junit} en el comando?).\n" + (p.stdout + p.stderr)[-1500:])
                return 2
            r = evidence.import_junit(root, report, by=by, record=not a.no_record)
    if a.format == "json":
        print(json.dumps(r, indent=2, ensure_ascii=False))
    else:
        print(f"{r['cases']} tests en el reporte · {r['recorded']} reglas con evidencia en {r['commit'] or 'este árbol'} · "
              f"{r['verified']} verificadas · {len(r['broken'])} rotas" + ("" if r["recorded_to"] else " · sin registrar"))
        if r["broken"]:
            print("\nEsta corrida rompe lo que dicen estas reglas:")
            for b in r["broken"]:
                print(f"  {b['ref']}: «{b['text']}»\n      ↳ falló: {', '.join(b['failed'][:3])}")
    return 1 if r["broken"] else 0


def _member(argv: list[str]) -> int:
    from . import members
    ap = argparse.ArgumentParser(prog="specreview member", description="Quién puede aprobar (.specreview/members.json).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="agregar un miembro y mostrar su token (una sola vez)")
    add.add_argument("name")
    add.add_argument("--role", choices=members.ROLES, default="member")
    add.add_argument("--email", default="")
    add.add_argument("--slack", default="", help="id de usuario de Slack (U...) para aprobar desde Slack")
    sub.add_parser("list", help="listar miembros")
    rv = sub.add_parser("revoke", help="revocar el acceso de un miembro")
    rv.add_argument("who", help="id o email")
    for p in sub.choices.values():
        p.add_argument("--path", default=".")
    a = ap.parse_args(argv)
    root = _root(a.path)
    if a.cmd == "add":
        m, token = members.add_member(root, a.name, a.role, a.email, a.slack)
        print(f"{m.name} ({m.id}, {m.role}) agregado.\nToken (guardalo ahora, no se vuelve a mostrar):\n  {token}")
        print("Usalo como `Authorization: Bearer <token>` o en SPECREVIEW_TOKEN. Commiteá .specreview/members.json (sólo guarda el hash).")
    elif a.cmd == "list":
        for m in members.list_members(root):
            print(f"{m.id}  {m.role:<9} {m.name}" + (f" <{m.email}>" if m.email else "") + (f"  slack:{m.slack}" if m.slack else ""))
    else:
        m = members.revoke_member(root, a.who)
        print(f"acceso revocado: {m.name} ({m.id})")
    return 0


def _approvals(argv: list[str]) -> int:
    import json
    import os
    from . import approvals, members
    ap = argparse.ArgumentParser(prog="specreview approvals", description="Registro de aprobaciones (.specreview/approvals.jsonl).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    ls = sub.add_parser("list", help="historial, más nuevo primero")
    ls.add_argument("--feature")
    ls.add_argument("-f", "--format", choices=["text", "json"], default="text")
    sub.add_parser("verify", help="comprobar la cadena de hashes (exit 1 si está rota)")
    rec = sub.add_parser("record", help="registrar una decisión (identidad por SPECREVIEW_TOKEN)")
    rec.add_argument("feature")
    rec.add_argument("--decision", required=True, choices=approvals.DECISIONS)
    rec.add_argument("--reason", default="")
    rec.add_argument("--condition", action="append", default=[], dest="conditions")
    rec.add_argument("--delegate-to")
    rec.add_argument("--override", action="store_true", help="aprobar aunque haya bloqueantes (necesita --reason)")
    for p in sub.choices.values():
        p.add_argument("--path", default=".")
    a = ap.parse_args(argv)
    root = _root(a.path)
    if a.cmd == "verify":
        v = approvals.verify(root)
        print(f"registro íntegro: {v['count']} entradas" if v["ok"] else f"REGISTRO ROTO en {v['broken_at']}: {v['reason']}")
        return 0 if v["ok"] else 1
    if a.cmd == "list":
        h = approvals.history(root, a.feature)
        if a.format == "json":
            print(json.dumps(h, indent=2, ensure_ascii=False))
        for e in ([] if a.format == "json" else h):
            extra = f" · {e['reason']}" if e["reason"] else ""
            print(f"{e['at']}  {e['id']}  {e['feature']:<32} {e['decision']:<24} {e['by']['name']} ({e['by']['via']}){extra}")
        return 0
    who = members.authenticate(root, os.environ.get("SPECREVIEW_TOKEN"))
    if who is None:
        raise ValueError("falta un token válido en SPECREVIEW_TOKEN (`specreview member add` lo genera)")
    feats = discover_features(root)
    if a.feature not in feats:
        raise ValueError(f"feature desconocida {a.feature!r}; hay: {', '.join(feats)}")
    feat = load_feature(feats[a.feature])
    from .report import to_dict
    try:
        e = approvals.record(root, a.feature, feats[a.feature], who, a.decision, to_dict(build_report(feat, run_all(feat, Context()))),
                             a.reason, a.conditions, a.delegate_to, a.override, via="cli")
    except approvals.PolicyError as err:
        raise ValueError(str(err)) from None
    print(f"registrado {e['id']}: {e['decision']} · {e['feature']} · {e['by']['name']} · versión {e['spec_hash'][:10]}")
    return 0


def _notify(argv: list[str]) -> int:
    import json
    import os
    from . import approvals, slack
    from .report import to_dict
    ap = argparse.ArgumentParser(prog="specreview notify", description="Avisar a Slack qué espera una decisión.")
    ap.add_argument("channel", choices=["slack"])
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("--base-url", default="", help="URL pública de la app, para enlazar cada feature")
    ap.add_argument("--interactive", action="store_true", help="incluir botones Aprobar / Rechazar (requiere `--serve` con SLACK_SIGNING_SECRET)")
    ap.add_argument("--all", action="store_true", help="todas las features, no sólo las que esperan una decisión")
    ap.add_argument("--dry-run", action="store_true", help="imprimir el mensaje en vez de enviarlo")
    a = ap.parse_args(argv)
    root = _root(a.path)
    rows = []
    for n, d in discover_features(root).items():
        f = load_feature(d)
        rep = to_dict(build_report(f, run_all(f, Context())))
        rows.append({"feature": n, "decision": rep["decision"], "summary": rep["summary"]})
    payload = slack.build_digest(rows, a.base_url, a.interactive, only_pending=not a.all, recorded=len(approvals.history(root)))
    if payload is None:
        print("Nada espera una decisión: no se envía nada.")
        return 0
    if a.dry_run:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        raise ValueError("falta SLACK_WEBHOOK_URL (Incoming Webhook de Slack); probá con --dry-run para ver el mensaje")
    slack.post_webhook(url, payload)
    print(f"enviado a Slack: {payload['text']}")
    return 0


def _jira(argv: list[str]) -> int:
    import os
    from . import jira
    ap = argparse.ArgumentParser(prog="specreview jira", description="Traer epics e issues de Jira como contexto de producto (sólo lectura).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sy = sub.add_parser("sync", help="guardar los issues en product/jira.json")
    sy.add_argument("--project", required=True)
    sy.add_argument("--jql", help="JQL propio en vez de «project = KEY»")
    sy.add_argument("--path", default=".")
    a = ap.parse_args(argv)
    env = {k: os.environ.get(k, "") for k in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN")}
    missing = [k for k, v in env.items() if not v]
    if missing:
        raise ValueError(f"faltan variables de entorno: {', '.join(missing)}")
    root = _root(a.path)
    p, n = jira.sync(env["JIRA_BASE_URL"], env["JIRA_EMAIL"], env["JIRA_API_TOKEN"], a.project, root / "product", a.jql)
    print(f"{n} issues de {a.project} guardados en {p.relative_to(root)}")
    return 0
