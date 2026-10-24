import json
import threading
import urllib.error
import urllib.request

import pytest

from conftest import EXAMPLE
from specreview.server import discover_features, make_server


@pytest.fixture
def base(tmp_path):
    static = tmp_path / "dist"
    static.mkdir()
    (static / "index.html").write_text("<html>app</html>")
    (tmp_path / "secret.txt").write_text("nope")
    srv = make_server(EXAMPLE, port=0, static_dir=static)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def get(url):
    try:
        with urllib.request.urlopen(url) as r:
            return r.status, r.read().decode(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), e.headers


def test_discovery():
    assert list(discover_features(EXAMPLE)) == ["003-team-invitations"]


def test_features_endpoint(base):
    code, body, _ = get(base + "/api/features")
    data = json.loads(body)
    assert code == 200 and data[0]["id"] == "003-team-invitations" and data[0]["summary"]["blocker"] == 6


def test_review_matches_cli_json_contract(base):
    code, body, h = get(base + "/api/review?feature=003-team-invitations")
    d = json.loads(body)
    assert code == 200 and d["schema_version"] == 1 and d["findings"] and h["Cache-Control"] == "no-store"


def test_sources_endpoint_only_returns_whitelisted_files(base):
    d = json.loads(get(base + "/api/sources?feature=003-team-invitations")[1])
    assert set(d) == {"spec.md", "plan.md", "tasks.md", "data-model.md"}


@pytest.mark.parametrize("feature", ["nope", "../../etc", "..", "003-team-invitations/../..", ""])
def test_unknown_or_malicious_feature_is_404(base, feature):
    assert get(base + "/api/sources?feature=" + feature)[0] == 404
    assert get(base + "/api/review?feature=" + feature)[0] == 404


def test_static_files_and_spa_fallback_without_traversal(base):
    assert get(base + "/")[1] == "<html>app</html>"
    assert get(base + "/some/route")[1] == "<html>app</html>"
    code, body, _ = get(base + "/..%2fsecret.txt")
    assert "nope" not in body


def test_serve_cli_rejects_repo_without_features(tmp_path, capsys):
    from specreview.cli import main
    assert main([str(tmp_path), "--serve"]) == 2
    assert "no encontré features" in capsys.readouterr().err


# ---------- HTML export ----------
def test_html_export_embeds_data_and_escapes_script_end(tmp_path, make_feature):
    from specreview.analyzers import run_all
    from specreview.cli import main
    from specreview.export import MARKER
    from specreview.parser import load_feature
    tpl = tmp_path / "t.html"
    tpl.write_text(f"<html><body>\n{MARKER}\n<script>app()</script></body></html>")
    d = make_feature(spec="# F\n## Requirements\n### Functional Requirements\n- **FR-001**: System MUST show </script><img src=x onerror=alert(1)> text\n")
    out = tmp_path / "out.html"
    assert main([str(d), "-f", "html", "--template", str(tpl), "-o", str(out), "--fail-on", "never"]) == 0
    html = out.read_text()
    assert "window.__SPECREVIEW__ =" in html and MARKER not in html
    assert "</script><img" not in html                       # injected end-tag is neutralised
    payload = html.split("window.__SPECREVIEW__ = ")[1].split(";</script>")[0]
    data = json.loads(payload)                               # \u003c decodes back to the original text
    assert "</script><img" in data["sources"]["spec.md"]


def test_html_export_without_ui_build_is_a_clear_error(tmp_path, capsys, monkeypatch):
    from specreview import export
    from specreview.cli import main
    monkeypatch.setattr(export, "default_template", lambda: None)
    assert main([str(EXAMPLE), "-f", "html"]) == 2
    assert "npm run build:single" in capsys.readouterr().err


def test_review_is_cached_until_files_change(tmp_path):
    import shutil
    import time
    root = tmp_path / "repo"
    shutil.copytree(EXAMPLE, root)
    srv = make_server(root, port=0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        url = base + "/api/review?feature=003-team-invitations"
        first = json.loads(get(url)[1])
        t = time.time(); json.loads(get(url)[1]); cached = time.time() - t
        spec = root / "specs/003-team-invitations/spec.md"
        spec.write_text(spec.read_text().replace("within 60 seconds", "promptly"))
        after = json.loads(get(url)[1])
        assert after != first and cached < 0.5            # edit is picked up on the next request
    finally:
        srv.shutdown()
