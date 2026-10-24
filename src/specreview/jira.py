"""Jira: bring epics and issues in as product context (`product/jira.json`), then check specs against them (PRD006).

    specreview jira sync --project PROJ          # env: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN

Read-only: it only calls the search endpoint (`GET /rest/api/3/search/jql`, paginated by `nextPageToken`) and writes a cache
file. Reviews stay offline and deterministic (constitution I): they read the cache, never the network. A spec links to Jira
with a header line `**Jira**: PROJ-12`.
"""
from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

CACHE = "jira.json"
FIELDS = "summary,status,issuetype,parent"


def _get(url: str, auth: str, timeout: float) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:                      # noqa: S310 (scheme checked by the caller)
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        hint = {401: "revisá JIRA_EMAIL y JIRA_API_TOKEN", 403: "ese usuario no tiene permiso sobre el proyecto", 404: "revisá JIRA_BASE_URL"}.get(e.code, "")
        raise ValueError(f"Jira respondió {e.code}" + (f": {hint}" if hint else "")) from None
    except urllib.error.URLError as e:
        raise ValueError(f"no pude llegar a Jira: {e.reason}") from None


def sync(base_url: str, email: str, token: str, project: str, out_dir: Path, jql: str | None = None, timeout: float = 20.0,
         max_pages: int = 20, today: date | None = None) -> tuple[Path, int]:
    if not base_url.startswith(("https://", "http://127.0.0.1", "http://localhost")):
        raise ValueError("JIRA_BASE_URL debe ser https:// (http sólo para pruebas locales)")
    if not project.isalnum() and not jql:
        raise ValueError(f"proyecto inválido {project!r}")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    q = jql or f"project = {project} ORDER BY created DESC"
    issues, page_token = [], None
    for _ in range(max_pages):
        params = {"jql": q, "fields": FIELDS, "maxResults": "100"}
        if page_token:
            params["nextPageToken"] = page_token
        data = _get(f"{base_url.rstrip('/')}/rest/api/3/search/jql?{urllib.parse.urlencode(params)}", auth, timeout)
        for i in data.get("issues", []):
            f = i.get("fields", {})
            st = f.get("status") or {}
            issues.append({"key": i["key"], "summary": f.get("summary", ""), "type": (f.get("issuetype") or {}).get("name", ""),
                           "status": st.get("name", ""), "status_category": (st.get("statusCategory") or {}).get("key", ""),
                           "parent": (f.get("parent") or {}).get("key", "")})
        page_token = data.get("nextPageToken")
        if not page_token or data.get("isLast", True) and not page_token:
            break
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / CACHE
    p.write_text(json.dumps({"synced_at": (today or date.today()).isoformat(), "base_url": base_url.rstrip("/"), "project": project,
                             "issues": sorted(issues, key=lambda x: x["key"])}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return p, len(issues)


def load_cache(product_dir: Path) -> dict | None:
    p = product_dir / CACHE
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
