#!/usr/bin/env python3
"""Generate the demo data of the web app (web/public/samples) from content owned by this repository.

    python scripts/gen_samples.py

Only this repo's own specs and examples are used (no third-party repositories), so the output can be committed and
shipped in the public demo deployment. Output is deterministic (no timestamps).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from specreview.analyzers import run_all  # noqa: E402
from specreview.parser import load_feature  # noqa: E402
from specreview.report import build_report, to_dict  # noqa: E402
from specreview.rules import QUESTIONS, rules_as_dicts  # noqa: E402

OUT = ROOT / "web" / "public" / "samples"
SOURCES = ("spec.md", "plan.md", "tasks.md", "data-model.md")

# (repo label shown in the demo, feature directory)
FEATURES = [
    ("acme/team-app", ROOT / "examples" / "invitations" / "specs" / "003-team-invitations"),
    ("acme/billing", ROOT / "examples" / "invoice-exports" / "specs" / "001-invoice-exports"),
    ("acme/subscriptions", ROOT / "examples" / "subscriptions" / "specs" / "003-annual-plans"),
    ("acme/loyalty", ROOT / "examples" / "loyalty-points" / "specs" / "002-loyalty-points"),
    ("acme/payments", ROOT / "examples" / "wire-transfers" / "specs" / "006-wire-transfer-limits"),
    ("acme/mobile", ROOT / "examples" / "push-notifications" / "specs" / "004-push-notifications"),
    *[("speco.ia", d) for d in sorted((ROOT / "specs").iterdir()) if (d / "spec.md").is_file()],
]


def product_samples() -> list[dict]:
    """Goal coverage per repository that keeps a product/ folder (the product layer is opt-in)."""
    from specreview.parser.loader import discover_features
    from specreview.product import product_report
    out = []
    for repo, root in (("acme/subscriptions", ROOT / "examples" / "subscriptions"), ("speco.ia", ROOT)):
        rep = product_report(root, discover_features(root))
        if rep:
            out.append({"repo": repo, "report": rep})
    return out


def approval_samples() -> dict:
    """A believable approval history for the demo, produced by the real `approvals.record` (hash chain included).

    Fixed members, dates and a fixed copy of one spec edited after its approval so the demo shows a *stale* approval.
    """
    import shutil
    import tempfile
    from datetime import datetime, timezone

    from specreview import approvals
    from specreview.members import Member
    members = [Member("m_sofia", "Sofía Ramos", "", "approver"), Member("m_diego", "Diego Pérez", "", "approver"),
               Member("m_alex", "Alex Demo", "", "approver")]
    by_repo = {d.name: d for _, d in FEATURES}
    plan = [  # feature, who, decision, reason, conditions, delegate, iso, edit spec after approving?
        ("001-spec-review-engine", 0, "approved", "", [], None, "2026-10-02T15:10:00", False),
        ("003-conversational-assistant", 0, "approved_with_conditions", "Listo para construir si el asistente no modifica archivos.",
         ["El asistente solo propone texto: no escribe en el repo"], None, "2026-10-05T11:30:00", False),
        ("003-team-invitations", 1, "rejected", "Las dos reglas de expiración se contradicen: resolver cuál manda y volver a pedir revisión.", [], None, "2026-10-08T09:45:00", False),
        ("005-agent-first-app", 0, "approved", "", [], None, "2026-10-12T17:05:00", True),
        ("004-push-notifications", 1, "delegated", "Lo ve Sofía: conoce el contrato con el proveedor de push.", [], "m_sofia", "2026-10-13T10:20:00", False),
    ]
    out = []
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / ".specreview").mkdir()
        (root / ".specreview" / "members.json").write_text(json.dumps({"members": [
            {"id": m.id, "name": m.name, "email": "", "role": m.role} for m in members]}))
        for feature, who, decision, reason, conds, delegate, when, edit in plan:
            src = by_repo[feature]
            if edit:                                   # approve an *older* version: the spec in the repo has changed since
                src = root / "old" / feature
                shutil.copytree(by_repo[feature], src)
                (src / "spec.md").write_text((src / "spec.md").read_text(encoding="utf-8").replace("MUST", "SHOULD", 1), encoding="utf-8")
            rev = to_dict(build_report(load_feature(src), run_all(load_feature(src))))
            approvals.record(root, feature, src, members[who], decision, rev, reason, conds, delegate, override=not rev["decision"]["can_implement"] and decision.startswith("approved"),
                             via="api", now=datetime.fromisoformat(when).replace(tzinfo=timezone.utc))
        out = approvals.read_log(root)
    return {"members": [{"id": m.id, "name": m.name, "role": m.role} for m in members], "me": "m_alex", "entries": out}


def ledger_sample() -> dict:
    """This repository's own intent ledger (spec 028): what Speco does today, by the evidence in its own tests."""
    from specreview import ledger
    led = ledger.build(ROOT)
    led.pop("root", None)                       # an absolute path of whoever ran the script: not deterministic
    for i in led["intents"]:
        i["run_age"] = None                     # commits since the last run: changes with every commit, so the sample would go stale
    return led


def generate(out: Path) -> list[dict]:
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    index = []
    for repo, d in FEATURES:
        feat = load_feature(d)
        rep = to_dict(build_report(feat, run_all(feat)))
        srcs = {n: (d / n).read_text(encoding="utf-8") for n in SOURCES if (d / n).is_file()}
        (out / f"{d.name}.report.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        (out / f"{d.name}.sources.json").write_text(json.dumps(srcs, ensure_ascii=False) + "\n", encoding="utf-8")
        index.append({"id": d.name, "feature": d.name, "repo": repo, "summary": rep["summary"], "demo": not repo.startswith("speco")})
    (out / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "product.json").write_text(json.dumps(product_samples(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "ledger.json").write_text(json.dumps(ledger_sample(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "approvals.json").write_text(json.dumps(approval_samples(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "rules.json").write_text(json.dumps({"questions": QUESTIONS, "rules": rules_as_dicts()}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return index


def main() -> None:
    index = generate(OUT)
    print(f"{len(index)} features -> {OUT.relative_to(ROOT)}")
    for e in index:
        s = e["summary"]
        print(f"  {e['repo']:<14} {e['id']:<30} {s['blocker']}b {s['warning']}w {s['suggestion']}s")


if __name__ == "__main__":
    main()
