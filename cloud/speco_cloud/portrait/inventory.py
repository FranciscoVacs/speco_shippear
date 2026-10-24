"""What a repository holds, by kind of file. Decided from the file NAMES alone: no content is read for the inventory (FR-001)."""
from __future__ import annotations

import re

SKIP_DIRS = ("node_modules/", "vendor/", "dist/", "build/", ".git/", "__pycache__/", ".venv/", "target/", ".next/")
CODE_EXT = (".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rb", ".java", ".kt", ".cs", ".php", ".rs", ".swift", ".scala")

KINDS = ("specs", "docs", "api", "tests", "database", "config", "code", "other")


def kind_of(path: str) -> str:
    p = path.lower()
    name = p.rsplit("/", 1)[-1]
    if re.match(r"^specs/[^/]+/(spec|plan|tasks|data-model)\.md$", p) or p.startswith("product/"):
        return "specs"
    if re.search(r"(openapi|swagger)[^/]*\.(ya?ml|json)$", name) or name.endswith((".proto", ".graphql", ".gql")):
        return "api"
    if re.search(r"(^|/)(tests?|__tests__|spec)/|(\.|_)(test|spec)\.[a-z]+$|^test_", p) or name.startswith("test_"):
        return "tests"
    if "migrations/" in p or name.endswith(".sql") or name in ("schema.rb", "schema.prisma"):
        return "database"
    if name.endswith((".md", ".rst", ".adoc")) or p.startswith(("docs/", "doc/", "adr/")):
        return "docs"
    if name.endswith((".toml", ".yml", ".yaml", ".ini", ".env.example")) or name in ("dockerfile", "makefile", "package.json", "pyproject.toml"):
        return "config"
    if name.endswith(CODE_EXT):
        return "code"
    return "other"


def build_inventory(tree: list[dict]) -> dict:
    counts = {k: 0 for k in KINDS}
    total = 0
    for e in tree:
        if e["type"] != "blob" or any(f"/{d}" in f"/{e['path']}" for d in SKIP_DIRS):
            continue
        counts[kind_of(e["path"])] += 1
        total += 1
    return {"counts": counts, "total_files": total}
