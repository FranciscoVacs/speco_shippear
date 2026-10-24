import type { Finding, Severity } from "../../types";
import type {
  AcceptanceResult, Counts, DemoSource, ExplainRuleResult, FeatureRow, Lang, ListFeaturesResult, PrioritizeResult,
  ReviewCardResult, RewriteResult, DraftSpecResult,
} from "./types";

const ORDER: Severity[] = ["blocker", "warning", "suggestion"];
const rank = (s: Severity) => ORDER.indexOf(s);

export const counts = (s?: Partial<Record<Severity, number>>): Counts => ({
  blocker: s?.blocker ?? 0, warning: s?.warning ?? 0, suggestion: s?.suggestion ?? 0,
});

export const bySeverity = (a: Finding, b: Finding): number => rank(a.severity) - rank(b.severity);

/** health score used to rank features: blockers weigh most */
export const score = (c: Counts): number => c.blocker * 100 + c.warning * 10 + c.suggestion;

export async function featureRows(src: DemoSource): Promise<FeatureRow[]> {
  return (await src.features()).map((f) => ({ id: f.id, repo: f.repo ?? "local", summary: counts(f.summary), demo: f.demo === true }));
}

export async function listFeatures(src: DemoSource): Promise<ListFeaturesResult> {
  return { rows: await featureRows(src) };
}

export async function reviewCard(src: DemoSource, featureId: string): Promise<ReviewCardResult> {
  const [report, feats] = await Promise.all([src.report(featureId), src.features()]);
  return {
    featureId,
    repo: feats.find((f) => f.id === featureId)?.repo ?? "local",
    summary: counts(report.summary),
    total: report.findings.length,
    metrics: report.metrics,
    top: [...report.findings].sort(bySeverity).slice(0, 4),
  };
}

export async function explainRule(src: DemoSource, ruleId: string): Promise<ExplainRuleResult | null> {
  const cat = await src.rules();
  const rule = cat?.rules.find((r) => r.id === ruleId);
  return rule ? { rule } : null;
}

/** `- **FR-006**: text` lines of spec.md -> { "FR-006": "text" } */
export function requirementTexts(specMd: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of specMd.split("\n")) {
    const m = /^\s*[-*]\s+\*\*((?:FR|SC)-\d+)\*\*\s*:\s*(.+)$/.exec(line);
    if (m && m[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export async function rewriteRequirement(src: DemoSource, featureId: string, reqId: string, lang: Lang): Promise<RewriteResult | null> {
  const [sources, report] = await Promise.all([src.sources(featureId), src.report(featureId)]);
  const original = requirementTexts(sources["spec.md"] ?? "")[reqId];
  if (!original) return null;
  const mine = report.findings.filter((f) => f.ids.includes(reqId));
  const rules = [...new Set(mine.map((f) => f.rule))];
  const questions: string[] = [];
  const L = (es: string, en: string) => (lang === "es" ? es : en);
  const clarification = /\[NEEDS CLARIFICATION:\s*(.*?)\]/i.exec(original);
  let body = original.replace(/\s*\[NEEDS CLARIFICATION:.*?\]/i, "").trim();
  let proposal: string;

  const actor = /^(\w[\w ]*?)\s+MUST be able to\s+(.+)$/i.exec(body);
  const eventForm = /^when\s+.+?,\s*the system MUST\s+.+$/i.test(body);
  if (actor && actor[1] && actor[2]) {
    proposal = `System MUST allow ${actor[1].toLowerCase()} to ${actor[2]}`;
  } else if (eventForm) {
    proposal = body;
  } else {
    const action = body.replace(/^(the )?system MUST\s+/i, "");
    proposal = `When [${L("evento que dispara el comportamiento", "event that triggers the behavior")}], the system MUST ${lc(action)}`;
    questions.push(L("¿Cuál es el evento que dispara este comportamiento?", "What event triggers this behavior?"));
  }

  const vague = mine.find((f) => f.rule === "QUA002" || f.rule === "QUA001");
  if (vague) {
    const words = [...vague.message.matchAll(/«([^»]+)»/g)].map((m) => m[1]).filter(Boolean) as string[];
    for (const w of words) {
      proposal = proposal.replace(new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i"), `[${L("valor medible", "measurable value")}]`);
      questions.push(L(`¿Qué significa «${w}» en números (por ejemplo p95 < [N] ms con [M] filas)?`, `What does "${w}" mean in numbers (for example p95 < [N] ms for [M] rows)?`));
    }
    if (!/\[/.test(proposal.split("MUST")[1] ?? "")) proposal += ` ${L("dentro de [N] segundos", "within [N] seconds")}`;
  }
  if (clarification && clarification[1]) {
    questions.push(L(`Pregunta abierta en la spec: ${clarification[1]}`, `Open question in the spec: ${clarification[1]}`));
    proposal += ` [${L("pendiente de respuesta", "pending an answer")}]`;
  }
  const conflict = mine.find((f) => f.rule === "CON001");
  if (conflict) {
    const other = conflict.ids.find((i) => i !== reqId);
    questions.push(L(`${reqId} se contradice con ${other}: decidí cuál valor vale y eliminá el otro requisito.`, `${reqId} contradicts ${other}: decide which value holds and remove the other requirement.`));
  }
  return { featureId, reqId, original, proposal, questions, rules };
}

export async function draftAcceptance(src: DemoSource, featureId: string, reqId: string, lang: Lang): Promise<AcceptanceResult | null> {
  const sources = await src.sources(featureId);
  const requirement = requirementTexts(sources["spec.md"] ?? "")[reqId];
  if (!requirement) return null;
  const L = (es: string, en: string) => (lang === "es" ? es : en);
  const m = /^when\s+(.+?),\s*the system MUST\s+(.+)$/i.exec(requirement);
  const result = (m?.[2] ?? requirement.replace(/^(the )?system MUST\s+/i, "")).replace(/\s*\[NEEDS CLARIFICATION:.*?\]/i, "").trim();
  const trigger = m?.[1] ?? L("[acción del usuario que dispara el comportamiento]", "[user action that triggers the behavior]");
  return {
    featureId, reqId, requirement,
    scenarios: [
      {
        title: L("Camino feliz", "Happy path"),
        given: L("[estado inicial: usuario y datos necesarios]", "[initial state: user and required data]"),
        when: trigger,
        then: L(`el sistema ${lc(result)}`, `the system ${lc(result)}`),
      },
      {
        title: L("Caso límite o error", "Edge or error case"),
        given: L("[estado inicial con un dato inválido o ausente]", "[initial state with invalid or missing data]"),
        when: trigger,
        then: L("[el sistema rechaza la acción y muestra qué corregir]", "[the system rejects the action and shows what to fix]"),
      },
    ],
  };
}

const firstSentence = (s: string) => (/^.*?[.!?](?=\s|$)/.exec(s)?.[0] ?? s).trim();

export async function prioritize(src: DemoSource, featureId: string | undefined, rules: Record<string, string>): Promise<PrioritizeResult> {
  if (!featureId) {
    const ranking = (await featureRows(src)).sort((a, b) => score(b.summary) - score(a.summary));
    return { steps: [], ranking };
  }
  const report = await src.report(featureId);
  const sorted = [...report.findings].sort(bySeverity);
  const seen = new Set<string>();
  const steps: PrioritizeResult["steps"] = [];
  for (const f of sorted) {
    const key = `${f.rule}:${f.ids.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({ rank: steps.length + 1, ids: f.ids, rule: f.rule, severity: f.severity, message: f.message, why: firstSentence(rules[f.rule] ?? "") });
    if (steps.length === 5) break;
  }
  return { featureId, steps };
}


// ---------------------------------------------------------------- draft a spec from a business need (spec 012, FR-005/FR-007)
const STRIP_NEED = /^(quiero que|quiero|queremos que|queremos|necesito que|necesito|necesitamos que|necesitamos|me gustaria que|me gustaria|nos gustaria que|nos gustaria|i want|we want|i need|we need|i would like)\s+/i;
const SUBJECTIVE = /\b(rapid[oa]s?|rapido|pronto|facil(es)?|simple(s)?|seguro|segura|intuitiv[oa]|fast|quick(ly)?|easy|simple|secure|soon)\b/i;

const fold2 = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Deterministic draft: no model is involved, so it works offline (D-003). It restates the need and turns the
 * questions every spec must answer into decisions for the person; vague words become a question about the number.
 */
export function draftSpec(need: string, lang: Lang): DraftSpecResult {
  const L = (es: string, en: string) => (lang === "es" ? es : en);
  const core = need.replace(STRIP_NEED, "").trim();
  const sentence = core.charAt(0).toUpperCase() + core.slice(1);
  const words = core.split(/\s+/);
  const title = words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : "");
  const decisions = [
    L("¿Quién puede hacerlo? (qué roles y qué pasa con el resto)", "Who can do it? (which roles, and what happens for everyone else)"),
    L("¿Hay límites? (cantidad, tiempo, costo o plan)", "Are there limits? (amount, time, cost or plan)"),
    L("¿Qué debería pasar cuando no se puede completar o alguien lo rechaza?", "What should happen when it cannot be completed or someone rejects it?"),
    L("¿Choca con algo que ya decidimos? (reglas actuales, planes, permisos)", "Does it clash with something we already decided? (current rules, plans, permissions)"),
    L("¿Cómo sabemos que funciona? (un número o un resultado que se pueda verificar)", "How do we know it works? (a number or an outcome we can verify)"),
  ];
  const vague = SUBJECTIVE.exec(fold2(core));
  if (vague) decisions.unshift(L(`«${vague[0]}» no se puede verificar tal cual: ¿cuál es el número? (por ejemplo, en cuántos segundos)`, `"${vague[0]}" cannot be verified as written: what is the number? (for example, within how many seconds)`));
  const intents = [sentence];
  const pending = L("DECISIÓN PENDIENTE", "PENDING DECISION");
  const markdown = [
    `# Feature Specification: ${title}`,
    "",
    "## User Scenarios & Testing",
    "",
    `### User Story 1 (Priority: P1)`,
    sentence + ".",
    "",
    "**Acceptance Scenarios**:",
    "1. **Given** [estado inicial], **When** [acción], **Then** [resultado verificable]",
    "",
    "## Requirements",
    "",
    `- **FR-001**: The system MUST ${core.charAt(0).toLowerCase() + core.slice(1)} [${pending}]`,
    ...decisions.map((d, i) => `- **FR-00${i + 2}**: [${pending}] ${d}`),
    "",
    "## Success Criteria",
    "",
    `- **SC-001**: [${pending}] ${decisions[decisions.length - 1]}`,
  ].join("\n");
  return { need, title, intents, decisions, markdown };
}
