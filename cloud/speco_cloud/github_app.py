"""Talking to GitHub as the App: a short-lived JWT proves who we are, and per-installation tokens (1 hour, only the repositories the
customer chose) do the reading. No long-lived credential per customer is ever stored.
The writes are the PR review comment (spec 026, `pull_requests: write`) and the check that says whether someone decided (spec 027, `checks: write`)."""
from __future__ import annotations

import time

import httpx
import jwt


class GitHubApp:
    def __init__(self, app_id: str, private_key_pem: str, base_url: str = "https://api.github.com", client: httpx.Client | None = None):
        self.app_id, self._key, self.base = app_id, private_key_pem, base_url.rstrip("/")
        self._http = client or httpx.Client(timeout=15)

    def app_jwt(self, now: float | None = None) -> str:
        t = int(now if now is not None else time.time())
        # GitHub: at most 10 minutes; issued a minute in the past to tolerate clock drift
        return jwt.encode({"iat": t - 60, "exp": t + 9 * 60, "iss": self.app_id}, self._key, algorithm="RS256")

    def _get(self, path: str, token: str, params: dict | None = None) -> dict:
        r = self._http.get(self.base + path, headers=self._headers(token), params=params)
        r.raise_for_status()
        return r.json()

    @staticmethod
    def _headers(token: str) -> dict:
        return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}

    def get_installation(self, installation_id: int) -> dict:
        return self._get(f"/app/installations/{installation_id}", self.app_jwt())

    def installation_token(self, installation_id: int) -> str:
        r = self._http.post(f"{self.base}/app/installations/{installation_id}/access_tokens", headers=self._headers(self.app_jwt()))
        r.raise_for_status()
        return r.json()["token"]

    def get_tree(self, token: str, full_name: str, sha: str) -> list[dict]:
        """Every file of the repository at `sha` -> [{path, type, size, sha}]; the blob sha tells two versions apart without reading them"""
        data = self._get(f"/repos/{full_name}/git/trees/{sha}", token, {"recursive": "1"})
        return [{"path": e["path"], "type": e["type"], "size": e.get("size", 0), "sha": e.get("sha")} for e in data.get("tree", [])]

    def resolve_ref(self, token: str, full_name: str, ref: str) -> str:
        """Branch or tag -> the commit sha it points at."""
        return self._get(f"/repos/{full_name}/commits/{ref}", token)["sha"]

    def get_file_optional(self, token: str, full_name: str, path: str, sha: str) -> str | None:
        r = self._http.get(f"{self.base}/repos/{full_name}/contents/{path}", params={"ref": sha}, headers={**self._headers(token), "Accept": "application/vnd.github.raw+json"})
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.text

    def get_file(self, token: str, full_name: str, path: str, sha: str) -> str:
        r = self._http.get(f"{self.base}/repos/{full_name}/contents/{path}", params={"ref": sha}, headers={**self._headers(token), "Accept": "application/vnd.github.raw+json"})
        r.raise_for_status()
        return r.text

    def user_installations(self, user_token: str) -> tuple[dict, list[dict]]:
        """As the signed-in person (the token GitHub gave at sign-in): who they are, and this App's installations they can see.
        GitHub answers this per person, so it is the proof of access; nothing here is read as the App."""
        me, out, page = self._get("/user", user_token), [], 1
        while True:
            data = self._get("/user/installations", user_token, {"per_page": 100, "page": page})
            out += data.get("installations", [])
            if len(out) >= data.get("total_count", 0) or not data.get("installations"):
                return me, out
            page += 1

    def count_user_installation_repositories(self, user_token: str, installation_id: int) -> int:
        return self._get(f"/user/installations/{installation_id}/repositories", user_token, {"per_page": 1}).get("total_count", 0)

    def list_repositories(self, installation_id: int) -> list[dict]:
        token, out, page = self.installation_token(installation_id), [], 1
        while True:
            data = self._get("/installation/repositories", token, {"per_page": 100, "page": page})
            out += data.get("repositories", [])
            if len(out) >= data.get("total_count", 0) or not data.get("repositories"):
                return out
            page += 1

    def _by_this_app(self, comment: dict) -> bool:
        """Anyone can paste the marker into a comment; only one this App wrote may be edited."""
        return str((comment.get("performed_via_github_app") or {}).get("id")) == str(self.app_id)

    def upsert_comment(self, token: str, full_name: str, number: int, body: str, marker: str) -> tuple[int, bool]:
        """One comment per PR, found by `marker` and edited in place on every push. -> (comment id, created)"""
        page = 1
        while True:
            r = self._http.get(f"{self.base}/repos/{full_name}/issues/{number}/comments", headers=self._headers(token), params={"per_page": 100, "page": page})
            r.raise_for_status()
            batch = r.json()
            mine = next((c for c in batch if (c.get("body") or "").startswith(marker) and self._by_this_app(c)), None)
            if mine:
                u = self._http.patch(f"{self.base}/repos/{full_name}/issues/comments/{mine['id']}", headers=self._headers(token), json={"body": body})
                u.raise_for_status()
                return mine["id"], False
            if len(batch) < 100:
                break
            page += 1
        c = self._http.post(f"{self.base}/repos/{full_name}/issues/{number}/comments", headers=self._headers(token), json={"body": body})
        c.raise_for_status()
        return c.json()["id"], True

    def edit_comment(self, token: str, full_name: str, comment_id: int, body: str) -> None:
        r = self._http.patch(f"{self.base}/repos/{full_name}/issues/comments/{comment_id}", headers=self._headers(token), json={"body": body})
        r.raise_for_status()

    def put_check_run(self, token: str, full_name: str, head_sha: str, name: str, conclusion: str, title: str, summary: str,
                      details_url: str = "", check_run_id: int | None = None) -> int:
        """The check a pull request carries. `conclusion`: success | failure | action_required | neutral. Created for a commit, edited in place after."""
        body = {"name": name, "status": "completed", "conclusion": conclusion, "output": {"title": title, "summary": summary}}
        if details_url:
            body["details_url"] = details_url
        if check_run_id:
            r = self._http.patch(f"{self.base}/repos/{full_name}/check-runs/{check_run_id}", headers=self._headers(token), json=body)
        else:
            r = self._http.post(f"{self.base}/repos/{full_name}/check-runs", headers=self._headers(token), json={**body, "head_sha": head_sha})
        r.raise_for_status()
        return r.json()["id"]
