// Pure impact analysis for a new spec. Shared by the browser (live preview while typing) and the API (persisted result).
import { MODULES, RULES, type Level, type Requirement, type Spec, type Status } from "./data.js";

export interface SpecDraft {
  requirementId: string;
  title: string;
  ears: string;
  modules: string[];
  owner: string;
}

export interface RelatedSpec {
  id: string;
  title: string;
  status: Status;
  relation: "contradicción" | "comparte regla" | "comparte módulo";
  sharedModules: string[];
  sharedRules: string[];
  note: string;
}

export interface SpecAnalysis {
  rules: string[];
  impacts: { module: string; level: Level; note: string }[];
  related: RelatedSpec[];
  gaps: { ruleId: string; control: string; text: string }[];
  earsOk: boolean;
  earsHint: string;
  risk: number;
  testsSuggested: number;
  toReverify: string[];
  summary: string;
  analyzedAt: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const KEYWORD_RULES: { words: string[]; rules: string[]; modules: string[] }[] = [
  { words: ["transfer", "pago", "pagar", "debito", "monto", "saldo", "limite", "dinero"], rules: ["BCRA-SNP", "BEL-MNY-02", "BEL-ARCH-01"], modules: ["payments-api", "core-ledger"] },
  { words: ["tarjeta", "card", "pan", "cvv"], rules: ["PCI-DSS", "BEL-SEC-03"], modules: ["cards-svc"] },
  { words: ["kyc", "onboarding", "alta", "identidad", "sancion", "lavado", "monitoreo"], rules: ["UIF-14"], modules: ["onboarding-svc", "risk-engine"] },
  { words: ["pep", "expuesta", "politicamente"], rules: ["UIF-PEP", "UIF-14"], modules: ["onboarding-svc", "risk-engine"] },
  { words: ["tasa", "tna", "tea", "comision", "costo", "reclamo", "comprobante"], rules: ["BCRA-PUSF"], modules: [] },
  { words: ["dato personal", "datos personales", "consentimiento", "privacidad", "email", "telefono", "domicilio"], rules: ["LEY-25326"], modules: ["onboarding-svc"] },
  { words: ["login", "clave", "contrasena", "2fa", "factor", "otp", "biometr", "sesion", "dispositivo"], rules: ["BCRA-7724", "ISO-27001"], modules: ["app-mobile"] },
  { words: ["log", "auditor", "registro", "traza"], rules: ["SOC2", "BEL-OBS-04"], modules: [] },
  { words: ["interes", "plazo fijo", "inversion", "rendimiento", "informe", "regimen"], rules: ["BEL-MNY-02", "BCRA-7724"], modules: ["core-ledger", "reporting"] },
];

const MODULE_RULES: Record<string, string[]> = {
  "core-ledger": ["BEL-ARCH-01", "BEL-MNY-02"],
  "payments-api": ["BCRA-SNP", "BEL-MNY-02"],
  "risk-engine": ["UIF-14"],
  "onboarding-svc": ["UIF-14", "UIF-PEP", "LEY-25326"],
  "cards-svc": ["PCI-DSS", "BEL-SEC-03"],
  "app-mobile": ["BEL-UX-05"],
  "web-banking": ["BEL-UX-05"],
  reporting: ["BCRA-7724"],
};

const ALWAYS = ["SPC-EARS", "SPC-COV", "BEL-OBS-04"];
const HIGH_RISK_RULES = new Set(["PCI-DSS", "BCRA-SNP", "UIF-14", "BCRA-7724"]);

const EARS_RE = /^(when|while|if|where|cuando|mientras|si|donde)\b.*\b(must|shall|debe|deberá|debera)\b/i;

export function analyzeSpec(draft: SpecDraft, requirements: Requirement[]): SpecAnalysis {
  const text = norm(`${draft.title} ${draft.ears}`);
  const matched = KEYWORD_RULES.filter((k) => k.words.some((w) => text.includes(w)));
  const moduleIds = [...new Set([...draft.modules, ...matched.flatMap((m) => m.modules)])].filter((id) => MODULES.some((m) => m.id === id));

  const known = new Set(RULES.map((r) => r.id));
  const rules = [...new Set([...matched.flatMap((m) => m.rules), ...moduleIds.flatMap((m) => MODULE_RULES[m] ?? []), ...ALWAYS])].filter((id) => known.has(id));

  const impacts = moduleIds.map((id) => {
    const explicit = draft.modules.includes(id);
    const mod = MODULES.find((m) => m.id === id)!;
    const sensitive = (MODULE_RULES[id] ?? []).some((r) => HIGH_RISK_RULES.has(r));
    const level: Level = explicit && sensitive ? "alto" : explicit || sensitive ? "medio" : "bajo";
    return {
      module: id,
      level,
      note: explicit ? `Cambio directo en ${mod.repo}.` : `Inferido por el texto de la spec: ${mod.repo} participa del flujo.`,
    };
  });

  const numbers = (s: string) => (s.match(/\d[\d.,]{2,}/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
  const ownNumbers = numbers(draft.ears);
  const existing = requirements.flatMap((r) => r.specs);
  const related: RelatedSpec[] = existing
    .map((s): RelatedSpec | null => {
      const sharedModules = s.impacts.map((i) => i.module).filter((m) => moduleIds.includes(m));
      const sharedRules = s.rules.filter((r) => rules.includes(r) && !ALWAYS.includes(r));
      if (!sharedModules.length && !sharedRules.length) return null;
      const theirNumbers = numbers(s.ears);
      const contradicts = sharedRules.length > 0 && ownNumbers.length > 0 && theirNumbers.length > 0 && !ownNumbers.some((n) => theirNumbers.includes(n));
      const relation = contradicts ? "contradicción" : sharedRules.length ? "comparte regla" : "comparte módulo";
      const note = contradicts
        ? `Define valores distintos (${ownNumbers.join(", ")} vs ${theirNumbers.join(", ")}) bajo ${sharedRules.join(", ")}.`
        : sharedRules.length
          ? `Reforzadas por ${sharedRules.join(", ")}: un cambio en una puede romper la otra.`
          : `Ambas tocan ${sharedModules.join(", ")}.`;
      return { id: s.id, title: s.title, status: s.status, relation, sharedModules, sharedRules, note };
    })
    .filter((x): x is RelatedSpec => x !== null)
    .sort((a, b) => rank(a.relation) - rank(b.relation) || b.sharedRules.length - a.sharedRules.length)
    .slice(0, 8);

  const gaps = rules.flatMap((id) => {
    const r = RULES.find((x) => x.id === id)!;
    return r.controls.filter((c) => !c.ok).map((c) => ({ ruleId: id, control: c.id, text: c.text }));
  });

  const earsOk = EARS_RE.test(draft.ears.trim());
  const contradictions = related.filter((r) => r.relation === "contradicción");
  const toReverify = contradictions.filter((r) => r.status === "verified").map((r) => r.id);

  const risk = Math.min(
    100,
    impacts.reduce((acc, i) => acc + (i.level === "alto" ? 22 : i.level === "medio" ? 12 : 5), 0) +
      rules.filter((r) => HIGH_RISK_RULES.has(r)).length * 8 +
      gaps.length * 6 +
      contradictions.length * 15 +
      (earsOk ? 0 : 10),
  );

  const summary = [
    `${impacts.length} módulos impactados`,
    `${rules.length} reglas aplicadas`,
    related.length ? `${related.length} specs relacionadas` : "sin specs relacionadas",
    contradictions.length ? `${contradictions.length} posibles contradicciones` : null,
    gaps.length ? `${gaps.length} controles sin cubrir` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    rules,
    impacts,
    related,
    gaps,
    earsOk,
    earsHint: earsOk ? "Cumple el patrón EARS (disparador + obligación)." : "Usá el patrón EARS: «When <evento>, the system MUST <respuesta>».",
    risk,
    testsSuggested: Math.max(2, rules.length + impacts.length),
    toReverify,
    summary,
    analyzedAt: new Date().toISOString(),
  };
}

const rank = (r: RelatedSpec["relation"]) => (r === "contradicción" ? 0 : r === "comparte regla" ? 1 : 2);

export function nextSpecId(req: Requirement): string {
  const max = req.specs.reduce((m, s) => Math.max(m, Number(s.id.split("FR-")[1]) || 0), 0);
  return `${req.id}/FR-${String(max + 1).padStart(3, "0")}`;
}

export function buildSpec(draft: SpecDraft, req: Requirement, analysis: SpecAnalysis): Spec {
  return {
    id: nextSpecId(req),
    title: draft.title.trim(),
    ears: draft.ears.trim(),
    status: analysis.earsOk ? "pending" : "risk",
    owner: draft.owner,
    rules: analysis.rules,
    impacts: analysis.impacts,
    files: [],
    tests: { passed: 0, total: analysis.testsSuggested },
    updatedAt: new Date().toISOString().slice(0, 10),
    analysis,
  };
}
