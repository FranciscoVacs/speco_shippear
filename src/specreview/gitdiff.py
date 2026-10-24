"""`--diff <base>`: only the features a pull request touched."""
from __future__ import annotations

import subprocess
from pathlib import Path


def changed_files(root: Path, base: str) -> list[str]:
    """Paths (relative to the git top level) changed between `base` and the working tree, via the merge base."""
    def git(*a):
        return subprocess.run(["git", "-C", str(root), *a], capture_output=True, text=True)
    top = git("rev-parse", "--show-toplevel")
    if top.returncode != 0:
        raise ValueError(f"--diff necesita un repositorio git ({root})")
    for rng in (f"{base}...HEAD", f"{base}..HEAD"):          # three dots needs a merge base; shallow clones may lack it
        r = git("diff", "--name-only", rng)
        if r.returncode == 0:
            names = r.stdout.split()
            wt = git("diff", "--name-only", "HEAD").stdout.split() + git("ls-files", "--others", "--exclude-standard").stdout.split()
            return sorted({*names, *wt})
    raise ValueError(f"no pude comparar con {base!r}: ¿existe la rama/commit? (en CI usá fetch-depth: 0)\n{r.stderr.strip()}")


def filter_changed(features: dict[str, Path], root: Path, base: str) -> dict[str, Path]:
    top = Path(subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                              check=True).stdout.strip()).resolve()
    changed = [(top / c).resolve() for c in changed_files(root, base)]
    # Anything under the feature dir counts, and so does the constitution / config that applies to every feature.
    shared = [top / ".specify", top / "specreview.toml", top / ".specreview"]
    all_changed = any(c == s or s in c.parents for c in changed for s in shared)
    return {n: d for n, d in features.items() if all_changed or any(c == d or d in c.parents for c in changed)}
