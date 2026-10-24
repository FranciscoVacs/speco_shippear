import re
from pathlib import Path

import pytest

from specreview.cli import main
from specreview.rules import BY_ID, QUESTIONS, RULES, explain
from conftest import EXAMPLE

SRC = Path(__file__).parent.parent / "src" / "specreview"


def test_every_rule_emitted_by_the_code_is_documented():
    # verifies 001/SC-002
    emitted = set()
    for p in SRC.glob("*.py"):
        if p.name != "rules.py":
            emitted |= set(re.findall(r'"((?:COV|QUA|CON|PRD)\d{3})"', p.read_text()))
    assert emitted - set(BY_ID) == set(), "regla emitida sin explicación en rules.py"
    assert set(BY_ID) - emitted == set(), "regla documentada que el código ya no emite"


def test_catalog_entries_are_complete():
    for r in RULES:
        assert r.what and r.why and r.fix and r.severity, r.id
        assert r.question in QUESTIONS and r.family == r.id[:3]
    assert len({r.id for r in RULES}) == len(RULES)


def test_rules_with_examples_have_both_sides_or_a_caveat():
    for r in RULES:
        if r.bad:
            assert r.good or r.caveat, f"{r.id}: ejemplo malo sin contraparte ni aclaración"


def test_explain_and_cli(capsys):
    assert "Ejemplo que la dispara" in explain("cov001")
    assert main(["--explain", "COV001"]) == 0 and "Requisito sin plan" in capsys.readouterr().out
    assert main(["--rules"]) == 0 and "QUA006" in capsys.readouterr().out
    assert main(["--explain", "XXX999"]) == 2 and "no existe la regla" in capsys.readouterr().err


def test_cli_without_path_is_a_friendly_error(capsys):
    assert main([]) == 2
    assert "specreview demo" in capsys.readouterr().err


def test_rules_endpoint_and_export_embed_catalog(tmp_path):
    import json, threading, urllib.request
    from specreview.server import make_server
    srv = make_server(EXAMPLE, port=0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        d = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{srv.server_address[1]}/api/rules").read())
    finally:
        srv.shutdown()
    assert len(d["rules"]) == len(RULES) and set(d["questions"]) == set(QUESTIONS)

    from specreview.export import MARKER
    tpl = tmp_path / "t.html"
    tpl.write_text(f"{MARKER}")
    out = tmp_path / "o.html"
    main([str(EXAMPLE), "-f", "html", "--template", str(tpl), "-o", str(out), "--fail-on", "never"])
    assert '"rules": {"questions"' in out.read_text() and "COV001" in out.read_text()
