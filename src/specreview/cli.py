from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .analyzers import ANALYZERS, Context, run_all
from .findings import Severity
from .parser import load_feature
from .parser.loader import FeatureNotFound
from .report import build_report, filter_min_severity, render_json, render_markdown, render_text
from . import suppress

LEVELS = {"blocker": Severity.BLOCKER, "warning": Severity.WARNING, "suggestion": Severity.SUGGESTION}


def make_llm(name: str, model: str | None):
    """Build the optional model client; raises SystemExit(2)-style errors as ValueError with a clear message."""
    if name == "none":
        return None
    if name == "demo":
        from .llm import DemoClient
        return DemoClient()
    if name == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise ValueError("--llm anthropic requiere la variable de entorno ANTHROPIC_API_KEY")
        try:
            from .llm import AnthropicClient
            return AnthropicClient(model) if model else AnthropicClient()
        except ImportError:
            raise ValueError("falta el SDK: pip install 'specreview[anthropic]'") from None
    raise ValueError(f"proveedor desconocido: {name}")


SUBCOMMANDS = ("demo", "diff", "init", "baseline", "waive", "mcp", "gate", "product", "member", "approvals", "notify", "jira", "ledger", "verification")


def _repo_root(path) -> Path:
    from .parser.loader import _repo_root as feature_root
    p = Path(path).resolve()
    if (p / "spec.md").is_file():
        return feature_root(p)
    return p.parent if p.name == "specs" and p.is_dir() else p


def _version() -> str:
    try:
        from importlib.metadata import version
        return version("specreview")
    except Exception:
        return "0.0.0"


def _setup(args, root: Path) -> tuple[suppress.Config, dict, dict]:
    """Merge repo config under the flags (flags win), and load baseline + waivers."""
    cfg = suppress.load_config(root) if not args.no_config else suppress.Config()
    args.fail_on = args.fail_on or cfg.fail_on or "blocker"
    args.min_severity = args.min_severity or cfg.min_severity or "suggestion"
    if args.threshold is None:
        args.threshold = cfg.threshold
    for opt, allowed in (("fail_on", [*LEVELS, "never"]), ("min_severity", list(LEVELS))):
        if getattr(args, opt) not in allowed:
            raise ValueError(f"{cfg.path or 'config'}: {opt} = {getattr(args, opt)!r} no es válido (opciones: {', '.join(allowed)})")
    baseline = {} if args.no_baseline else suppress.load_baseline(root, Path(args.baseline) if args.baseline else None)
    return cfg, baseline, suppress.load_waivers(root)


def _utf8_streams() -> None:
    # Windows consoles default to cp1252, which cannot encode «↳», «·» or accents in rule text.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure") and (stream.encoding or "").lower().replace("-", "") != "utf8":
            stream.reconfigure(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    _utf8_streams()
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] in SUBCOMMANDS:
        from .cli_sub import run_subcommand
        return run_subcommand(argv[0], argv[1:])
    ap = argparse.ArgumentParser(prog="specreview", description="Code review para specs de Spec Kit.")
    ap.add_argument("path", nargs="?", help="carpeta de la feature (specs/NNN-x) o raíz del repo")
    ap.add_argument("--rules", action="store_true", help="listar todas las reglas y qué detectan")
    ap.add_argument("--explain", metavar="ID", help="explicar una regla en detalle (p. ej. COV001)")
    ap.add_argument("-f", "--format", choices=["text", "json", "markdown", "html", "sarif"], default="text")
    ap.add_argument("-v", "--verbose", action="store_true", help="incluir sugerencia de arreglo y evidencia")
    ap.add_argument("--min-severity", choices=list(LEVELS), default=None,
                    help="ocultar hallazgos menos severos que este (default: mostrar todos)")
    ap.add_argument("--fail-on", choices=[*LEVELS, "never"], default=None,
                    help="severidad mínima que produce exit code 1 (default: blocker)")
    ap.add_argument("--only", nargs="+", choices=list(ANALYZERS), help="correr sólo estos analizadores")
    ap.add_argument("--threshold", type=float, default=None, help="umbral de similitud para cobertura (default 0.35)")
    ap.add_argument("--llm", choices=["none", "anthropic", "demo"], default="none",
                    help="modelo opcional: juez de huecos/scope colado y asistente de --serve (default: none, todo offline). "
                         "demo = respuestas de ejemplo para ver la UI, sólo con --serve")
    ap.add_argument("--model", default=None, help="modelo del proveedor --llm")
    ap.add_argument("--models", default=os.environ.get("SPECO_MODELS", ""),
                    help="con --serve --llm anthropic: modelos que el chat puede elegir por mensaje, separados por coma "
                         "(claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5). Vacío: sin elección (default; env SPECO_MODELS)")
    ap.add_argument("--color", choices=["auto", "always", "never"], default="auto")
    ap.add_argument("-o", "--output", help="archivo de salida (por defecto stdout; recomendado para -f html)")
    ap.add_argument("--template", help="UI compilada para -f html (default: web/dist-single/index.html)")
    ap.add_argument("--all", action="store_true", help="revisar todas las features de specs/ y mostrar una tabla resumen")
    ap.add_argument("--serve", action="store_true", help="levantar la UI web local (path = raíz del repo)")
    ap.add_argument("--llm-review", action="store_true",
                    help="con --serve: usar también el modelo como juez del análisis (gasta más llamadas)")
    ap.add_argument("--diff", metavar="BASE", help="revisar sólo las features que cambiaron respecto de BASE (rama o commit); implica --all")
    ap.add_argument("--baseline", metavar="FILE", help="ignorar los hallazgos de este baseline (default: .specreview/baseline.json si existe)")
    ap.add_argument("--no-baseline", action="store_true", help="no aplicar baseline ni waivers: ver todo")
    ap.add_argument("--no-config", action="store_true", help="ignorar specreview.toml")
    ap.add_argument("--version", action="version", version=f"specreview {_version()}")
    ap.add_argument("--allow-host", action="append", default=[], metavar="HOST",
                    help="con --serve: aceptar también este Host (p. ej. el dominio de un túnel para Slack); repetible")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args(argv)

    if args.rules or args.explain:
        from .rules import explain, render_list
        if args.explain:
            try:
                sys.stdout.write(explain(args.explain))
            except KeyError:
                print(f"error: no existe la regla {args.explain!r}. Usá --rules para verlas todas.", file=sys.stderr)
                return 2
        else:
            sys.stdout.write(render_list())
        return 0
    if not args.path:
        ap.print_usage(sys.stderr)
        print("error: falta la carpeta de la feature o la raíz del repo. Probá: specreview . (o specreview demo para verlo sin repo propio)", file=sys.stderr)
        return 2
    if args.serve:
        return _serve(args)
    if args.diff:
        args.all = True
    if args.all:
        return _run_all(args)
    if args.llm == "demo":
        print("error: --llm demo sólo sirve con --serve (sus respuestas son de ejemplo y no pueden juzgar una spec)", file=sys.stderr)
        return 2
    try:
        feat = load_feature(args.path)
        root = feat.root
        cfg, baseline, waivers = _setup(args, root)
        llm = make_llm(args.llm, args.model)
    except (FeatureNotFound, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    ctx = Context(llm=llm) if args.threshold is None else Context(llm=llm, threshold=args.threshold)
    full = suppress.apply(build_report(feat, run_all(feat, ctx, args.only)), cfg, baseline, waivers)
    report = filter_min_severity(full, LEVELS[args.min_severity])
    out = sys.stdout
    if args.output:
        out = open(args.output, "w", encoding="utf-8")
    try:
        if args.format == "json":
            out.write(render_json(report))
        elif args.format == "markdown":
            out.write(render_markdown(report, verbose=args.verbose))
        elif args.format == "sarif":
            from .sarif import render_sarif
            out.write(render_sarif([report], root, _version()))
        elif args.format == "html":
            from .export import render_html
            try:
                out.write(render_html(report, feat, Path(args.template) if args.template else None))
            except (FileNotFoundError, ValueError) as e:
                print(f"error: {e}", file=sys.stderr)
                return 2
        else:
            color = (args.color == "always" or (args.color == "auto" and out.isatty() and "NO_COLOR" not in os.environ))
            out.write(render_text(report, verbose=args.verbose, color=color))
    finally:
        if args.output:
            out.close()

    worst = full.worst()                       # exit code ignores the display filter on purpose
    if args.fail_on != "never" and worst is not None and worst >= LEVELS[args.fail_on]:
        return 1
    return 0


def _run_all(args) -> int:
    """Review every feature under specs/ (docs/specs/002-review-all-features)."""
    from .parser.loader import discover_features
    from .report import FeatureResult, render_multi_json, render_multi_markdown, render_summary_table

    if args.format == "html":                                                                  # FR-008
        print("error: -f html revisa una feature a la vez (el HTML embebe un solo reporte). "
              "Exportá cada feature por separado o usá -f json con --all.", file=sys.stderr)
        return 2
    root = Path(args.path)
    features = discover_features(root)
    try:
        repo = _repo_root(root)
        cfg, baseline, waivers = _setup(args, repo)
        features = {n: d for n, d in features.items() if n not in cfg.ignore_features}
        if args.diff and features:
            from .gitdiff import filter_changed
            features = filter_changed(features, repo, args.diff)
            if not features:
                print(f"Ninguna feature cambió respecto de {args.diff}.", file=sys.stderr)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if not features and args.diff:
        features = {}
    elif not features:                                                                         # FR-002
        from .parser.loader import no_features_hint
        searched = root if (root.name == "specs" or not root.exists()) else root / "specs"
        print(f"error: no encontré features (specs/*/spec.md) en {searched}{no_features_hint(root)}", file=sys.stderr)
        return 2
    try:
        llm = make_llm(args.llm, args.model)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    ctx = Context(llm=llm) if args.threshold is None else Context(llm=llm, threshold=args.threshold)

    results: list[FeatureResult] = []
    for name, d in features.items():                                                           # FR-001 (name order)
        try:
            feat = load_feature(d)
            results.append(FeatureResult(name, suppress.apply(build_report(feat, run_all(feat, ctx, args.only)), cfg, baseline, waivers)))
        except Exception as e:                                                                 # FR-007: one bad feature must not stop the rest
            results.append(FeatureResult(name, None, f"{type(e).__name__}: {e}"))
    shown = [filter_min_severity(r.report, LEVELS[args.min_severity]) for r in results if r.report]   # FR-009

    out = open(args.output, "w", encoding="utf-8") if args.output else sys.stdout
    try:
        if args.format == "json":                                                              # FR-005
            out.write(render_multi_json(results, shown))
        elif args.format == "markdown":
            out.write(render_multi_markdown(results, shown, args.verbose))
        elif args.format == "sarif":
            from .sarif import render_sarif
            out.write(render_sarif(shown, repo, _version()))
        else:
            color = args.color == "always" or (args.color == "auto" and out.isatty() and "NO_COLOR" not in os.environ)
            for rep in shown:
                out.write(f"{'=' * 12} {rep.feature} {'=' * 12}\n")
                out.write(render_text(rep, verbose=args.verbose, color=color) + "\n")
            out.write(render_summary_table(results, color))                                    # FR-003
    finally:
        if args.output:
            out.close()

    if any(r.report is None for r in results):                                                 # FR-007: an error outranks findings
        return 2
    worst = max((r.report.worst() for r in results if r.report and r.report.worst() is not None), default=None)
    if args.fail_on != "never" and worst is not None and worst >= LEVELS[args.fail_on]:        # FR-006 (unfiltered)
        return 1
    return 0


def _serve(args) -> int:
    from pathlib import Path

    from .server import default_static_dir, discover_features, make_server
    root = Path(args.path)
    if not discover_features(root):
        from .parser.loader import no_features_hint
        print(f"error: no encontré features Spec Kit (specs/*/spec.md) en {root}{no_features_hint(root)}", file=sys.stderr)
        return 2
    try:
        llm = make_llm(args.llm, args.model)
        from .models import parse_models
        models = parse_models(args.models)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    static = default_static_dir()
    srv = make_server(root, args.host, args.port, static, llm, judge=args.llm_review, allow_hosts=set(args.allow_host),
                      slack_signing_secret=os.environ.get("SLACK_SIGNING_SECRET") or None, models=models)
    print(f"Spec Reviewer en http://{args.host}:{srv.server_address[1]}  ({'UI + API' if static else 'sólo API: falta web/dist, correr npm run build en web/'})")
    print("Asistente: " + ({"none": "desactivado (usar --llm anthropic)", "demo": "MODO DEMO (respuestas de ejemplo)"}.get(args.llm, f"activo ({args.llm})")))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
