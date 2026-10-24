"""GitHub as a code provider: an installation token (1 hour, only the repositories the customer chose) does the reading."""
from __future__ import annotations

from ..github_app import GitHubApp


class GitHubReader:
    def __init__(self, app: GitHubApp, full_name: str, installation_id: int):
        self.app, self.full_name = app, full_name
        self.token = app.installation_token(installation_id)

    def resolve_ref(self, ref: str) -> str:
        return self.app.resolve_ref(self.token, self.full_name, ref)

    def get_tree(self, sha: str) -> list[dict]:
        return self.app.get_tree(self.token, self.full_name, sha)

    def get_file(self, path: str, sha: str) -> str:
        return self.app.get_file(self.token, self.full_name, path, sha)

    def get_file_optional(self, path: str, sha: str) -> str | None:
        return self.app.get_file_optional(self.token, self.full_name, path, sha)
