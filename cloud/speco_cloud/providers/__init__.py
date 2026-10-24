"""Code hosts behind one small read only interface (spec 019, D-013). The service asks a host for exactly four things: the commit a branch
points at, the files of a commit, a file, and a file that may not exist. Everything else (reviews, portrait, drift) is the same for any host."""
from __future__ import annotations

from typing import Protocol


class Reader(Protocol):
    """Bound to one repository."""
    full_name: str

    def resolve_ref(self, ref: str) -> str: ...
    def get_tree(self, sha: str) -> list[dict]: ...                      # [{path, type: blob|tree, size}]
    def get_file(self, path: str, sha: str) -> str: ...
    def get_file_optional(self, path: str, sha: str) -> str | None: ...


class Providers:
    """Chooses the reader of a repository from the provider of its connection. `repo` is a row of the worker query:
    {full_name, provider, connection_external_id, credentials (encrypted, bitbucket only)}."""

    def __init__(self, github=None, bitbucket=None, cipher=None):
        self.github, self.bitbucket, self.cipher = github, bitbucket, cipher

    def reader(self, repo: dict) -> Reader:
        provider = repo["provider"]
        if provider == "github":
            from .github import GitHubReader
            return GitHubReader(self.github, repo["full_name"], int(repo["connection_external_id"]))
        if provider == "bitbucket":
            from .bitbucket import BitbucketReader
            if self.cipher is None:
                raise ValueError("CREDENTIALS_KEY is not set: Bitbucket credentials cannot be read")
            return BitbucketReader(self.bitbucket, repo["full_name"], self.cipher.decrypt_json(repo["credentials"]), repo["connection_external_id"])
        raise ValueError(f"unknown provider {provider!r}")


def coerce(code) -> Providers:
    """The worker and the portrait take a Providers; a bare GitHub client is accepted for the GitHub only case."""
    return code if isinstance(code, Providers) else Providers(github=code)


def from_settings(settings) -> Providers:
    from ..github_app import GitHubApp
    from ..credentials import Cipher
    from .bitbucket import BitbucketCloud
    return Providers(github=GitHubApp(settings.github_app_id, settings.github_private_key, settings.github_api),
                     bitbucket=BitbucketCloud(settings.bitbucket_api, settings.bitbucket_auth),
                     cipher=Cipher(settings.credentials_key) if settings.credentials_key else None)
