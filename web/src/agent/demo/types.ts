// Simulated agent ("demo agent"): pure, framework-free logic. It runs in the browser and never calls a model.
// Review cards are built from REAL review data (the engine's reports); the proposals (EARS rewrite, acceptance
// scenarios) are deterministic templates and are always presented as examples.
import type { Finding, FeatureInfo, Metrics, Report, Rule, RuleCatalog, Severity, Sources } from "../../types";

export type Lang = "es" | "en";

export interface AgentContext {
  page: "home" | "reviews" | "review" | "rules" | "rule" | "docs" | "settings" | "other";
  featureId?: string;
  ruleId?: string;
  lang: Lang;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Where the agent reads its data from (the app's loader in the UI, the file system in tests). */
export interface DemoSource {
  features(): Promise<FeatureInfo[]>;
  report(featureId: string): Promise<Report>;
  sources(featureId: string): Promise<Sources>;
  rules(): Promise<RuleCatalog | null>;
}

export type ToolName =
  | "review_feature"
  | "list_features"
  | "explain_rule"
  | "rewrite_requirement"
  | "draft_acceptance"
  | "prioritize"
  | "draft_spec";

export type Counts = Record<Severity, number>;

export interface ReviewCardResult {
  featureId: string;
  repo: string;
  summary: Counts;
  total: number;
  metrics: Metrics | null;
  /** most serious findings first (blockers, then warnings, then suggestions), at most 4 */
  top: Finding[];
}

export interface FeatureRow {
  id: string;
  repo: string;
  summary: Counts;
  demo: boolean;
}

export interface ListFeaturesResult {
  rows: FeatureRow[];
}

export interface ExplainRuleResult {
  rule: Rule;
}

export interface RewriteResult {
  featureId: string;
  reqId: string;
  original: string;
  proposal: string;
  /** questions the team must answer before the proposal can be final */
  questions: string[];
  /** rule ids of the findings that motivated the rewrite */
  rules: string[];
}

export interface AcceptanceResult {
  featureId: string;
  reqId: string;
  requirement: string;
  scenarios: { title: string; given: string; when: string; then: string }[];
}

export interface PrioritizeResult {
  featureId?: string;
  steps: { rank: number; ids: string[]; rule: string; severity: Severity; message: string; why: string }[];
  ranking?: FeatureRow[];
}

/** A spec draft built from a business need. Nothing is written anywhere: the person copies it (FR-005, FR-006). */
export interface DraftSpecResult {
  need: string;
  title: string;
  /** what the person wants, in business words (the "intents") */
  intents: string[];
  /** the open questions, each one a decision the person has to make */
  decisions: string[];
  /** spec.md skeleton with the decisions marked as pending */
  markdown: string;
}

export type ToolResult =
  | ReviewCardResult
  | ListFeaturesResult
  | ExplainRuleResult
  | RewriteResult
  | AcceptanceResult
  | PrioritizeResult
  | DraftSpecResult;

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool-call"; id: string; name: ToolName; args: Record<string, string> }
  | { type: "tool-result"; id: string; name: ToolName; result: ToolResult }
  /** follow-up prompts the UI can offer as chips */
  | { type: "suggestions"; items: string[] }
  | { type: "done"; demo: true };

export interface PacingOptions {
  /** characters emitted per text event */
  chars?: number;
  /** pause between text events (ms) */
  tickMs?: number;
  /** pause while a "tool" runs (ms) */
  toolMs?: number;
}
