#!/usr/bin/env bash
# Deploys the full service (docs/35) to the Vercel project `speco-api`. Usage: scripts/deploy_api.sh [git-ref] [extra `vercel deploy` options]
exec "$(dirname "$0")/deploy_vercel_bundle.sh" vercel-api speco-api "$@"
