import type { FeatureInfo } from "../../types";
import type { AgentContext } from "./types";

export type Intent =
  | { kind: "review"; featureId: string }
  | { kind: "list" }
  | { kind: "explain"; ruleId: string }
  | { kind: "rewrite"; featureId: string; reqId: string }
  | { kind: "acceptance"; featureId: string; reqId: string }
  | { kind: "prioritize"; featureId?: string }
  | { kind: "falsepositive"; ruleId?: string }
  /** the request needs a feature and none could be determined (or several matched) */
  | { kind: "ask-feature"; action: "review" | "rewrite" | "acceptance"; candidates: string[]; reqId?: string }
  | { kind: "ask-requirement"; action: "rewrite" | "acceptance"; featureId: string }
  /** a business need in plain words: the person wants a spec drafted from it */
  | { kind: "draft"; need: string }
  /** «what does the software do today?»: the answer lives in the intent ledger (spec 028) */
  | { kind: "today" }
  | { kind: "help" };

/** lowercase, no accents, so "Revisá" and "revisa" match the same keyword */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const RULE_RE = /\b(cov|qua|con)\s?-?\s?(\d{3})\b/i;
const REQ_RE = /\b(fr|sc)\s?-?\s?(\d{1,3})\b/i;

export const findRuleRef = (text: string): string | null => {
  const m = RULE_RE.exec(text);
  return m && m[1] && m[2] ? `${m[1].toUpperCase()}${m[2]}` : null;
};

export const findReqRef = (text: string): string | null => {
  const m = REQ_RE.exec(text);
  return m && m[1] && m[2] ? `${m[1].toUpperCase()}-${m[2].padStart(3, "0")}` : null;
};

const STOP_WORDS = new Set(["review", "features", "feature", "first", "agent", "spec", "app", "specs", "team", "all"]);

/** Features the text refers to (full id, slug or a distinctive slug word). Empty = none; several = ambiguous. */
export function matchFeatures(text: string, features: FeatureInfo[]): string[] {
  // "FR-002" / "COV001" are requirement and rule references, not the number of a feature
  const t = fold(text).replace(/\b(?:fr|sc|cov|qua|con)\s?-?\s?\d{1,3}\b/g, " ");
  const hits = new Set<string>();
  const wordCount = new Map<string, number>();
  const slugWords = (f: FeatureInfo) => fold(f.id.replace(/^\d+-/, "")).split("-").filter((w) => w.length >= 5 && !STOP_WORDS.has(w));
  for (const f of features) for (const w of new Set(slugWords(f))) wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
  for (const f of features) {
    const id = fold(f.id);
    const slug = id.replace(/^\d+-/, "");
    if (t.includes(id) || t.includes(slug)) {
      hits.add(f.id);
      continue;
    }
    for (const w of slugWords(f)) {
      if (wordCount.get(w) === 1 && new RegExp(`\\b${w}\\b`).test(t)) hits.add(f.id);
    }
  }
  if (hits.size === 0) {                                  // "001-..." style numeric references, ambiguous across repos
    const num = /\b0\d{2}\b/.exec(t)?.[0];
    if (num) for (const f of features) if (fold(f.id).startsWith(num + "-")) hits.add(f.id);
  }
  // "invoice-exports" also contains "exports": prefer the most specific (longest id) when one hit contains the others
  return [...hits];
}

const has = (t: string, re: RegExp) => re.test(t);

const NEED_RE = /^(quiero|queremos|necesito|necesitamos|me gustaria|nos gustaria|armame|arma una|redacta|escribi una spec|i want|we want|i need|we need|i would like|draft a spec|write a spec)\b/;
const MIN_NEED_WORDS = 3;

/** "quiero que los clientes puedan invitar a su equipo" -> the need, or null when the message is not one */
export function parseNeed(message: string): string | null {
  const t = fold(message).trim();
  if (!NEED_RE.test(t) || findRuleRef(message) || findReqRef(message)) return null;
  const need = message.trim().replace(/[.!\s]+$/, "");
  return need.split(/\s+/).length >= MIN_NEED_WORDS + 1 ? need : null;
}

export function parseIntent(message: string, ctx: AgentContext, features: FeatureInfo[]): Intent {
  const t = fold(message);
  const rule = findRuleRef(message);
  const req = findReqRef(message);
  const named = matchFeatures(message, features);
  const need = parseNeed(message);
  if (need) return { kind: "draft", need };
  const featureId = named.length === 1 ? named[0] : named.length === 0 ? ctx.featureId : undefined;

  const wantsExplain = has(t, /(que significa|que quiere decir|que es |explic|what does|what is|explain|meaning|means)/);
  const wantsRewrite = has(t, /(reescrib|rewrite|reformul|\bears\b|mejora|improve|redact)/);
  const wantsAcceptance = has(t, /(criterio|aceptacion|acceptance|escenario|scenario|given|gherkin)/);
  const wantsFalsePos = has(t, /(falso positivo|false positive|esta mal|is this wrong|no es real|not real)/);
  const wantsPriority = has(t, /(primero|priorid|prioritiz|where to start|por donde|empez|start with|first\b|que arreglo|what should i fix|what to fix)/);
  const wantsReview = has(t, /(revis|analiz|review|audit|chequea|check|evalua|evaluate|como esta|how is|salud|health|estado de)/);
  const wantsToday = has(t, /(que hace hoy|que hace el (software|producto|sistema)|que hace mi (software|producto|app)|what does (it|the software|the product|my software|my product) do|what it does today|\bel que\b|the what\b|que falta construir|what is left to build)/);
  const wantsList = has(t, /(que features|lista|listar|list |which features|cuantas|todas las features|show features|mostra|repos|what features|que hay)/);

  if (rule && (wantsExplain || wantsFalsePos || !req)) return wantsFalsePos ? { kind: "falsepositive", ruleId: rule } : { kind: "explain", ruleId: rule };
  if (wantsRewrite && (req || /requisit|requirement/.test(t))) {
    if (!featureId) return { kind: "ask-feature", action: "rewrite", candidates: named.length ? named : features.map((f) => f.id), ...(req ? { reqId: req } : {}) };
    return req ? { kind: "rewrite", featureId, reqId: req } : { kind: "ask-requirement", action: "rewrite", featureId };
  }
  if (wantsAcceptance && (req || /requisit|requirement|faltan|missing/.test(t))) {
    if (!featureId) return { kind: "ask-feature", action: "acceptance", candidates: named.length ? named : features.map((f) => f.id), ...(req ? { reqId: req } : {}) };
    return req ? { kind: "acceptance", featureId, reqId: req } : { kind: "ask-requirement", action: "acceptance", featureId };
  }
  if (rule) return { kind: "explain", ruleId: rule };       // a rule reference with nothing more specific asked: explain it
  if (wantsFalsePos) return { kind: "falsepositive", ...(ctx.ruleId ? { ruleId: ctx.ruleId } : {}) };
  if (wantsPriority) return featureId ? { kind: "prioritize", featureId } : named.length > 1 ? { kind: "ask-feature", action: "review", candidates: named } : { kind: "prioritize" };
  if (wantsReview || (named.length === 1 && t.trim().length <= 60)) {
    if (featureId) return { kind: "review", featureId };
    return { kind: "ask-feature", action: "review", candidates: named.length ? named : features.map((f) => f.id) };
  }
  if (wantsToday) return { kind: "today" };
  if (wantsList) return { kind: "list" };
  if (ctx.ruleId && wantsExplain) return { kind: "explain", ruleId: ctx.ruleId };
  return { kind: "help" };
}
