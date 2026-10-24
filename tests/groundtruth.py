"""Compare findings against examples/invitations/expected.json (shared by all phases)."""
import json

from conftest import EXAMPLE


def check(findings, rule_prefixes):
    exp = json.loads((EXAMPLE / "expected.json").read_text())
    got = {(f.rule, ",".join(f.ids)) for f in findings}
    got_ids = {(f.rule, i) for f in findings for i in f.ids}

    def sel(lst):
        return [e for e in lst if e["rule"].startswith(tuple(rule_prefixes))]

    missing = [e for e in sel(exp["must_find"])
               if (e["rule"], e["location"]) not in got
               and not all((e["rule"], p) in got_ids for p in e["location"].split(","))]
    forbidden = [e for e in sel(exp["must_not_find"]) if (e["rule"], e["location"]) in got_ids]
    return missing, forbidden
