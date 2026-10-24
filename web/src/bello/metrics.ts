import { STATUS_ORDER, type Rule, type Spec, type Status } from "./data";

export function statusCounts(specs: Spec[]): { status: Status; value: number }[] {
  return STATUS_ORDER.map((status) => ({ status, value: specs.filter((s) => s.status === status).length }));
}

export function linkedSpecs(rule: Rule, specs: Spec[]): Spec[] {
  return specs.filter((s) => s.rules.includes(rule.id));
}

/** Compliance of one rule: its controls covered (60%) and the linked specs verified (40%). */
export function ruleCompliance(rule: Rule, specs: Spec[]): number {
  const ctl = rule.controls.length ? rule.controls.filter((c) => c.ok).length / rule.controls.length : 1;
  const linked = linkedSpecs(rule, specs);
  const ver = linked.length ? linked.filter((s) => s.status === "verified").length / linked.length : 1;
  return Math.round((ctl * 0.6 + ver * 0.4) * 100);
}

export function testRatio(specs: Spec[]): { passed: number; total: number } {
  return specs.reduce((a, s) => ({ passed: a.passed + s.tests.passed, total: a.total + s.tests.total }), { passed: 0, total: 0 });
}
