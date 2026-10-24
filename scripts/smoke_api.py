"""After a deploy: does the service answer every GET route that cloud/speco_cloud/app.py declares? (docs/35)

    python scripts/smoke_api.py https://speco-api.vercel.app

A route that exists answers 401 without a token, or 200; one the deployed code lacks answers 404. A 404 means the service is older than
the code (the failure of 2026-10-24: the web called /features and the service did not have it). Waits for the new deployment to serve,
up to --wait seconds. Standard library only."""
from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "cloud" / "speco_cloud" / "app.py"
ZERO = "00000000-0000-0000-0000-000000000000"


def routes() -> list[str]:
    found = sorted(set(re.findall(r'@app\.get\("([^"]+)"', APP.read_text(encoding="utf-8"))))
    return [re.sub(r"\{[a-z_]+\}", "x", r.replace("{org_id}", ZERO)) for r in found]


def status(url: str) -> int:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("base", help="the service's URL, e.g. https://speco-api.vercel.app")
    ap.add_argument("--wait", type=int, default=120, help="seconds to keep retrying while some route is missing")
    args = ap.parse_args()
    base, paths = args.base.rstrip("/"), routes()
    deadline = time.monotonic() + args.wait
    while True:
        missing = [p for p in paths if status(base + p) == 404]
        if not missing:
            print(f"ok: the {len(paths)} GET routes of app.py exist at {base}")
            return 0
        if time.monotonic() > deadline:
            print(f"the deployed service lacks {len(missing)} route(s) of app.py:", *missing, sep="\n  ", file=sys.stderr)
            return 1
        time.sleep(10)


if __name__ == "__main__":
    raise SystemExit(main())
