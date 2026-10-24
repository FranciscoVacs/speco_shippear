"""web/vercel.json must keep the deploy contract of docs/09-deploy-vercel.md (spec 005, FR-016/FR-017)."""
import json
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
CFG = json.loads((WEB / "vercel.json").read_text())
PKG = json.loads((WEB / "package.json").read_text())


def test_static_output_matches_the_vite_build():
    # verifies 005/FR-017
    assert CFG["outputDirectory"] == "dist" and CFG["framework"] == "vite"
    assert CFG["buildCommand"] == "npm run build" and "build" in PKG["scripts"]
    # the normal build must not write somewhere else than `dist`
    assert 'outDir: single ? "dist-single" : "dist"' in (WEB / "vite.config.ts").read_text()


def test_deep_links_rewrite_to_the_index_page():
    # verifies 005/FR-016
    assert {"source": "/(.*)", "destination": "/index.html"} in CFG["rewrites"]


def test_no_server_functions_or_secrets_are_required():
    # verifies 005/FR-017
    assert not (WEB / "api").exists(), "la demo pública no debe exponer un endpoint que llame a un modelo"
    assert "env" not in CFG


def test_index_declares_an_inline_icon_so_no_favicon_request_404s():
    html = (WEB / "index.html").read_text()
    assert 'rel="icon"' in html and 'href="data:image/svg+xml,' in html


# ---- the repository root is a Python project (pyproject.toml): importing it into Vercel with the default root
# directory autodetects the "python" preset and fails with "No python entrypoint found". The root vercel.json must
# force a static build of web/ so the import works WITHOUT touching Root Directory.
ROOT_CFG = json.loads((WEB.parent / "vercel.json").read_text())


def test_root_vercel_json_overrides_the_python_preset_with_a_static_build_of_web():
    # verifies 005/FR-017, FR-016
    assert (WEB.parent / "pyproject.toml").exists()                       # the reason this file is needed
    assert ROOT_CFG["framework"] is None                                  # "Other": beats the autodetected python preset
    assert ROOT_CFG["installCommand"] == "cd web && npm ci"
    assert ROOT_CFG["buildCommand"] == "cd web && npm run build"
    assert ROOT_CFG["outputDirectory"] == "web/dist"
    assert {"source": "/(.*)", "destination": "/index.html"} in ROOT_CFG["rewrites"]


def test_root_and_web_configs_agree_on_headers_and_rewrites():
    assert ROOT_CFG["rewrites"] == CFG["rewrites"]
    assert ROOT_CFG["headers"] == CFG["headers"]
    assert not (WEB.parent / "api").exists() and "env" not in ROOT_CFG
