#!/usr/bin/env bash
# Deploys a Python bundle of deploy/ to its Vercel project, from what is committed at a git ref.
# Vercel only uploads the folder it deploys, so the engine and the cloud package are copied next to the entrypoint first.
# Usage: scripts/deploy_vercel_bundle.sh <bundle> <project> [git-ref] [extra `vercel deploy` options]   (default HEAD, production)
set -euo pipefail
export MSYS_NO_PATHCONV=1
bundle="$1"; project="$2"; shift 2
ref="${1:-HEAD}"; shift || true
root="$(git rev-parse --show-toplevel)"
out="$(mktemp -d)/$project"
mkdir -p "$out/engine"
git -C "$root" archive "$ref" pyproject.toml README.md src | tar -x -C "$out/engine"
git -C "$root" archive "$ref" cloud/pyproject.toml cloud/speco_cloud | tar -x -C "$out"
git -C "$root" archive "$ref" "deploy/$bundle" | tar -x -C "$out" --strip-components=2
cd "$out"
vercel=(npx -y vercel@latest)                      # deploying needs CLI 47.2.2 or later
# In CI there is no `vercel login`: the token and the team come from the environment (.github/workflows/deploy-api.yml)
[[ -n "${VERCEL_TOKEN:-}" ]] && vercel+=(--token "$VERCEL_TOKEN")
[[ -n "${VERCEL_SCOPE:-}" ]] && vercel+=(--scope "$VERCEL_SCOPE")
"${vercel[@]}" link --yes --project "$project" >/dev/null
# A git connection makes every push build the repository root, which is the web app: it replaces the service and webhooks get 405.
"${vercel[@]}" git disconnect --yes >/dev/null 2>&1 || true
"${vercel[@]}" deploy --prod --yes "$@"
