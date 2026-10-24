#!/usr/bin/env bash
# Reproduces Vercel's build locally (no account, no login) for BOTH ways of importing the repo:
#   1. repository root, with the project marked as the "python" preset (what Vercel autodetects from pyproject.toml)
#   2. Root Directory = web
# Uses the same CLI version as the failing deployment log. Usage: scripts/verify_vercel.sh [git-ref]   (default HEAD)
set -euo pipefail
REF="${1:-HEAD}"
CLI="${VERCEL_CLI:-vercel@62.7.0}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
run() {  # $1=dir  $2=framework json  -> builds and checks the output
  local dir="$1" fw="$2"
  mkdir -p "$dir/.vercel"
  printf '{"projectId":"prj_demo","orgId":"team_demo","settings":{"framework":%s,"buildCommand":null,"installCommand":null,"outputDirectory":null,"rootDirectory":null,"nodeVersion":"22.x"}}' "$fw" > "$dir/.vercel/project.json"
  (cd "$dir" && npx --yes "$CLI" build --prod --yes > "$TMP/build.log" 2>&1) || { tail -15 "$TMP/build.log"; echo "FAIL: vercel build"; exit 1; }
  local out="$dir/.vercel/output"
  test -f "$out/static/index.html" || { echo "FAIL: no index.html in the output"; exit 1; }
  test -d "$out/static/samples"    || { echo "FAIL: demo samples missing"; exit 1; }
  test ! -d "$out/functions"       || { echo "FAIL: the build produced serverless functions (the demo must be static)"; exit 1; }
  python3 - "$out/config.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))["routes"]
fs = next(i for i, x in enumerate(r) if x.get("handle") == "filesystem")
rw = next(i for i, x in enumerate(r) if x.get("dest") == "/index.html")
assert fs < rw, "files must be served before the index rewrite"
PY
  if grep -rIlE "podcast|devopsabcs" "$out/static" >/dev/null 2>&1; then echo "FAIL: third-party content in the output"; exit 1; fi
  echo "ok: $(du -sh "$out/static" | cut -f1) static output"
}
echo "== 1. repository root, project preset = python (the default import)"
mkdir "$TMP/root" && git -C "$REPO" archive "$REF" | tar -x -C "$TMP/root"
run "$TMP/root" '"python"'
echo "== 2. Root Directory = web"
mkdir "$TMP/web" && git -C "$REPO" archive "$REF" web | tar -x -C "$TMP/web" && run "$TMP/web/web" '"vite"'
echo "ALL OK ($REF, $CLI)"
