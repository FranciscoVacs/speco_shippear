import importlib.util, os, sys
from decimal import Decimal as D
import pytest

RUN = os.environ["WIRES_DIR"]
sys.path.insert(0, RUN)
spec = importlib.util.spec_from_file_location("wires_under_test", os.path.join(RUN, "wires.py"))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

def close(a, b):
    return abs(float(a) - float(b)) < 0.001

def test_fee_minimum(): assert close(w.fee(D("100")), D("2.00"))
def test_fee_1000(): assert close(w.fee(D("1000")), D("5.00"))
def test_fee_rounding(): assert close(w.fee(D("1001.11")), D("5.01"))
def test_limit_tier1(): assert close(w.daily_limit(1), D("5000"))
def test_limit_tier2(): assert close(w.daily_limit(2), D("25000"))
def test_tier1_over_limit_rejected(): assert w.check_wire(1, D("4000"), D("2000")) == "rejected"
def test_tier1_at_limit_queued(): assert w.check_wire(1, D("0"), D("5000")) == "queued"
def test_tier2_above_10k_held(): assert w.check_wire(2, D("0"), D("12000")) == "held"
def test_tier2_10k_queued(): assert w.check_wire(2, D("0"), D("10000")) == "queued"
def test_refund(): assert close(w.refund(D("1000")), D("1005.00"))
