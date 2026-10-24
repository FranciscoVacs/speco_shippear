"""Entry point: `uvicorn --factory speco_cloud.main:create`. Reads the environment (see Settings.from_env)."""
from __future__ import annotations

from .app import create_app
from .config import Settings


def create():
    return create_app(Settings.from_env())
