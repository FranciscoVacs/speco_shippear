"""Bitbucket Cloud as a code provider (spec 019). A workspace admin creates an OAuth consumer with read only access and shares its key and
secret once; we exchange them for short lived accesses (client credentials grant, 2 hours) and never keep an access. Everything here only READS."""
from __future__ import annotations

import time
from urllib.parse import quote, urlsplit

import httpx

# any scope that can change something. Reading is `repository`, `webhook` only lets us manage OUR webhook; nothing here writes code.
WRITE_SUFFIXES = (":write", ":admin")
MAX_TREE_PAGES = 300                                   # 100 entries per page: a repository of more than 30,000 files is refused, not half read


class ProviderError(Exception):
    pass


class ProviderBusy(ProviderError):
    """The host asked us to slow down: the job fails and the worker retries it later (FR-012)."""


def writable_scopes(scopes: str) -> list[str]:
    return sorted(s for s in scopes.split() if s.endswith(WRITE_SUFFIXES))


class BitbucketCloud:
    def __init__(self, api: str = "https://api.bitbucket.org/2.0", auth_url: str = "https://bitbucket.org/site/oauth2/access_token", client: httpx.Client | None = None):
        self.api, self.auth_url = api.rstrip("/"), auth_url
        self._http = client or httpx.Client(timeout=20)
        self._cache: dict[str, tuple[str, float]] = {}

    # ---------------------------------------------------------------------------------------------- accesses
    def access(self, creds: dict) -> tuple[str, str]:
        """key + secret -> (access token, scopes)"""
        r = self._http.post(self.auth_url, data={"grant_type": "client_credentials"}, auth=(creds["key"], creds["secret"]))
        if r.status_code in (400, 401, 403):
            raise ProviderError("Bitbucket did not accept that key and secret")
        self._check(r)
        j = r.json()
        self._cache[creds["key"]] = (j["access_token"], time.time() + int(j.get("expires_in", 7200)) - 120)
        return j["access_token"], j.get("scopes", "")

    def token(self, creds: dict) -> str:
        hit = self._cache.get(creds["key"])
        return hit[0] if hit and hit[1] > time.time() else self.access(creds)[0]

    # ---------------------------------------------------------------------------------------------- http
    @staticmethod
    def _check(r: httpx.Response) -> None:
        if r.status_code == 429:
            raise ProviderBusy(f"Bitbucket asked to slow down (retry after {r.headers.get('Retry-After', '?')}s)")
        r.raise_for_status()

    def _get(self, url: str, token: str, params: dict | None = None) -> httpx.Response:
        r = self._http.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
        self._check(r)
        return r

    def _same_host(self, url: str) -> str:
        if urlsplit(url).netloc != urlsplit(self.api).netloc:                  # never send the token to an address the host did not own
            raise ProviderError("Bitbucket sent a page address outside its API")
        return url

    def pages(self, path: str, token: str, params: dict, limit: int = MAX_TREE_PAGES):
        url, first = self.api + path, True
        for _ in range(limit):
            data = self._get(url, token, params if first else None).json()      # the next page address already carries its query
            first = False
            yield from data.get("values", [])
            nxt = data.get("next")
            if not nxt:
                return
            url = self._same_host(nxt)
        raise ProviderError(f"more than {limit} pages: too large to list")

    # ---------------------------------------------------------------------------------------------- workspace
    def workspace(self, token: str, slug: str) -> dict:
        return self._get(f"{self.api}/workspaces/{quote(slug, safe='')}", token).json()

    def list_repositories(self, token: str, slug: str) -> list[dict]:
        """-> [{external_id (uuid with braces), full_name, default_branch}]"""
        params = {"pagelen": 100, "fields": "next,values.uuid,values.full_name,values.mainbranch.name"}
        return [{"external_id": v["uuid"], "full_name": v["full_name"], "default_branch": (v.get("mainbranch") or {}).get("name") or "main"}
                for v in self.pages(f"/repositories/{quote(slug, safe='')}", token, params)]

    def create_webhook(self, token: str, slug: str, url: str, secret: str) -> str:
        r = self._http.post(f"{self.api}/workspaces/{quote(slug, safe='')}/hooks", headers={"Authorization": f"Bearer {token}"},
                            json={"description": "Speco", "url": url, "active": True, "secret": secret, "events": ["repo:push"]})
        self._check(r)
        return r.json()["uuid"]

    def delete_webhook(self, token: str, slug: str, uuid: str) -> None:
        r = self._http.delete(f"{self.api}/workspaces/{quote(slug, safe='')}/hooks/{quote(uuid, safe='')}", headers={"Authorization": f"Bearer {token}"})
        if r.status_code != 404:
            self._check(r)

    # ---------------------------------------------------------------------------------------------- one repository
    def resolve_ref(self, token: str, full_name: str, ref: str) -> str:
        return self._get(f"{self.api}/repositories/{full_name}/refs/branches/{quote(ref, safe='')}", token).json()["target"]["hash"]

    def get_tree(self, token: str, full_name: str, sha: str) -> list[dict]:
        params = {"max_depth": 30, "pagelen": 100, "fields": "next,values.path,values.type,values.size"}
        kind = {"commit_file": "blob", "commit_directory": "tree"}
        return [{"path": v["path"], "type": kind.get(v["type"], "other"), "size": v.get("size", 0)} for v in self.pages(f"/repositories/{full_name}/src/{sha}/", token, params)]

    def get_file_optional(self, token: str, full_name: str, path: str, sha: str) -> str | None:
        r = self._http.get(f"{self.api}/repositories/{full_name}/src/{sha}/{quote(path, safe='/')}", headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 404:
            return None
        self._check(r)
        return r.text

    def get_file(self, token: str, full_name: str, path: str, sha: str) -> str:
        text = self.get_file_optional(token, full_name, path, sha)
        if text is None:
            raise ProviderError(f"{path} is not in {full_name} at {sha[:8]}")
        return text


class BitbucketReader:
    def __init__(self, api: BitbucketCloud, full_name: str, creds: dict, workspace: str = ""):
        self.api, self.full_name = api, full_name
        self.token = api.token(creds)

    def resolve_ref(self, ref: str) -> str:
        return self.api.resolve_ref(self.token, self.full_name, ref)

    def get_tree(self, sha: str) -> list[dict]:
        return self.api.get_tree(self.token, self.full_name, sha)

    def get_file(self, path: str, sha: str) -> str:
        return self.api.get_file(self.token, self.full_name, path, sha)

    def get_file_optional(self, path: str, sha: str) -> str | None:
        return self.api.get_file_optional(self.token, self.full_name, path, sha)
