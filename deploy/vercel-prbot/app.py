"""Vercel entrypoint of the PR bot (docs/32). Not deployable from this folder alone: scripts/deploy_prbot.sh copies the engine
to ./engine and the cloud package to ./cloud next to it, which is what requirements.txt installs.
Vercel sets VERCEL=1, which makes the bot review before answering (BotSettings.inline)."""
from speco_cloud.prbot import create

app = create()
