"""Vercel entrypoint of the full service (docs/19, docs/35). Not deployable from this folder alone: scripts/deploy_api.sh copies the engine
to ./engine and the cloud package to ./cloud next to it, which is what requirements.txt installs.
Vercel sets VERCEL=1, which makes the service run queued jobs inside the request that queued them (Settings.inline_jobs)."""
from speco_cloud.main import create

app = create()
