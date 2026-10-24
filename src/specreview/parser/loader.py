"""Locate a Spec Kit feature on disk and parse all its artifacts into a `Feature`."""
from __future__ import annotations

import json
import os
from pathlib import Path

from ..model import Feature
from .plan import parse_plan, plan_items_from_data_model
from .spec import parse_spec
from .tasks import parse_tasks


class FeatureNotFound(Exception):
    pass


def resolve_feature_dir(target: Path) -> tuple[Path, Path]:
    """Return (repo_root, feature_dir) from any of: feature dir, specs/ dir, repo root.

    Mirrors Spec Kit: a feature dir is one containing spec.md. For a repo root, honor
    .specify/feature.json, else take the highest-numbered dir under specs/.
    """
    target = target.resolve()
    if not target.exists():
        raise FeatureNotFound(f"No existe: {target}")
    if (target / "spec.md").is_file():
        return _repo_root(target), target
    specs = target / "specs" if (target / "specs").is_dir() else (target if target.name == "specs" else None)
    root = target if specs and specs.parent == target else (target.parent if specs else target)
    fj = root / ".specify" / "feature.json"
    if fj.is_file():
        try:
            fd = json.loads(fj.read_text(encoding="utf-8")).get("feature_directory")
        except json.JSONDecodeError:
            fd = None
        if fd and (root / fd / "spec.md").is_file():
            return root, (root / fd)
    if specs:
        cands = sorted(d for d in specs.iterdir() if (d / "spec.md").is_file())
        if cands:
            return root, cands[-1]
    raise FeatureNotFound(f"No encontré un spec.md en {target} (ni en specs/*/)." + no_features_hint(target))


def _repo_root(feature_dir: Path) -> Path:
    for p in [feature_dir, *feature_dir.parents]:
        if (p / ".specify").is_dir():
            return p
    return feature_dir.parent.parent if feature_dir.parent.name == "specs" else feature_dir.parent


def load_feature(target: str | Path) -> Feature:
    root, fdir = resolve_feature_dir(Path(target))
    rel = lambda p: str(p.relative_to(fdir))  # noqa: E731
    feat = Feature(root=root, dir=fdir, name=fdir.name)
    feat.spec = parse_spec(fdir / "spec.md", "spec.md")

    if (fdir / "plan.md").is_file():
        feat.plan = parse_plan(fdir / "plan.md", "plan.md")
    else:
        feat.warnings.append("No hay plan.md (¿corriste /speckit.plan?)")

    for name in ("research.md", "data-model.md", "quickstart.md"):
        p = fdir / name
        if p.is_file():
            feat.artifacts[name] = p.read_text(encoding="utf-8")
    if (fdir / "contracts").is_dir():
        for p in sorted((fdir / "contracts").rglob("*")):
            if p.is_file():
                feat.artifacts[rel(p)] = p.read_text(encoding="utf-8", errors="replace")
    if feat.plan and "data-model.md" in feat.artifacts:
        feat.plan.items += plan_items_from_data_model(feat.artifacts["data-model.md"], "data-model.md",
                                                      len(feat.plan.items))

    tp = fdir / "tasks.md"
    feat.has_tasks_file = tp.is_file()
    if feat.has_tasks_file:
        feat.tasks = parse_tasks(tp, "tasks.md", feat.warnings)
    else:
        feat.warnings.append("No hay tasks.md (¿corriste /speckit.tasks?)")

    const = root / ".specify" / "memory" / "constitution.md"
    if const.is_file():
        feat.constitution = const.read_text(encoding="utf-8")
    return feat


def discover_features(root: Path) -> dict[str, Path]:
    """Feature name -> directory, in name order. `root` may be a repo root, a specs/ dir, or a feature dir itself."""
    root = Path(root).resolve()
    if (root / "spec.md").is_file():
        return {root.name: root}
    specs = root / "specs" if (root / "specs").is_dir() else (root if root.name == "specs" else None)
    if specs is None:
        return {}
    return {d.name: d for d in sorted(specs.iterdir()) if d.is_dir() and (d / "spec.md").is_file()}


_SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".tox"}


def _display(p: Path) -> str:
    try:
        return os.path.relpath(p) if not os.path.relpath(p).startswith("..") else str(p)
    except ValueError:                                                      # different drive on Windows
        return str(p)


def find_repos_below(root: Path, max_depth: int = 3, limit: int = 5) -> list[Path]:
    """Directories under `root` (at most `max_depth` levels down) that hold specs/*/spec.md."""
    found: list[Path] = []
    base_depth = len(root.parts)
    for dirpath, dirnames, _ in os.walk(root):
        d = Path(dirpath)
        dirnames[:] = sorted(n for n in dirnames if n not in _SKIP_DIRS and not n.startswith("."))
        if len(d.parts) - base_depth >= max_depth:
            dirnames[:] = []
        if d.name != "specs" and (d / "specs").is_dir() and discover_features(d):
            found.append(d)
            dirnames[:] = [n for n in dirnames if n != "specs"]            # a repo's specs/ are its features, not more repos
            if len(found) >= limit:
                break
    return found


def no_features_hint(target: str | Path) -> str:
    """What to try next when `target` holds no Spec Kit feature. Starts with a space-less newline so it can be appended to a message."""
    t = Path(target).resolve()
    if not t.exists():
        return f"\n  La ruta no existe: {t}"
    lines: list[str] = []
    below = find_repos_below(t)
    if below:
        lines.append("  Encontré features en: " + ", ".join(_display(p) for p in below))
        lines.append(f"  Probá: specreview {_display(below[0])}")
    else:
        for parent in t.parents:
            if (parent / "specs").is_dir() and discover_features(parent):
                lines.append(f"  Estás dentro de un repo con features: {_display(parent)}")
                lines.append(f"  Probá: specreview {_display(parent)}")
                break
    if not lines:
        lines.append("  ¿Es un repo con Spec Kit? Las features se crean con /speckit.specify y viven en specs/NNN-nombre/spec.md.")
        lines.append("  Para ver la herramienta sin repo propio: specreview demo")
    return "\n" + "\n".join(lines)
