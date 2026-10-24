#!/usr/bin/env bash
# Deploys the PR bot (docs/32) to the Vercel project `speco-prbot`. Usage: scripts/deploy_prbot.sh [git-ref] [extra `vercel deploy` options]
exec "$(dirname "$0")/deploy_vercel_bundle.sh" vercel-prbot speco-prbot "$@"
