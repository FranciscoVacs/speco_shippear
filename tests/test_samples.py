"""The demo data shipped with the web app must be what the generator produces from the repo's current specs."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load():
    spec = importlib.util.spec_from_file_location("gen_samples", ROOT / "scripts" / "gen_samples.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_committed_samples_are_up_to_date(tmp_path):
    mod = _load()
    mod.generate(tmp_path)
    committed = ROOT / "web" / "public" / "samples"
    assert sorted(p.name for p in tmp_path.glob("*.json")) == sorted(p.name for p in committed.glob("*.json"))
    stale = [p.name for p in tmp_path.glob("*.json") if p.read_text() != (committed / p.name).read_text()]
    assert not stale, f"samples desactualizados, correr `python scripts/gen_samples.py`: {stale}"


def test_samples_contain_only_own_content():
    import json
    idx = json.loads((ROOT / "web" / "public" / "samples" / "index.json").read_text())
    assert {e["repo"] for e in idx} == {"acme/team-app", "acme/billing", "acme/loyalty", "acme/mobile", "acme/payments", "acme/subscriptions", "speco.ia"}
    assert not any(e["id"].startswith("real-") for e in idx)
