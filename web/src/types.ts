export type Severity = "blocker" | "warning" | "suggestion";

export type Owner = "decision" | "team";
export type Risk = "intent_drift" | "context_decay" | "unverifiable";
export type Verdict = "ready" | "needs_work" | "blocked" | "needs_decision";

/** Report-level translation of the findings into a decision (backend `decision.py`). */
export interface Decision {
  verdict: Verdict;
  can_implement: boolean;
  waiting_on: Record<Owner, number>;
  risks: Record<Risk, number>;
  top_risk: Risk | null;
}

export interface Finding {
  owner?: Owner;
  risk?: Risk;
  rule: string;
  rule_name: string;
  fingerprint?: string;
  severity: Severity;
  ids: string[];
  location: { file: string; line: number } | null;
  message: string;
  fix: string;
  evidence: string[];
}

export interface Metrics {
  requirements?: number | null;
  success_criteria?: number | null;
  user_stories?: number | null;
  tasks?: number | null;
  plan_items?: number | null;
  requirements_with_plan_or_tasks_pct?: number | null;
  requirements_with_acceptance_pct?: number | null;
  tasks_without_requirement?: number | null;
  ears_patterns?: Record<string, number> | null;
}

export interface Report {
  schema_version: number;
  feature: string;
  summary: Partial<Record<Severity, number>>;
  metrics: Metrics | null;
  notes: string[];
  /** absent in reports exported by older versions */
  decision?: Decision;
  findings: Finding[];
}

export type Sources = Record<string, string>;

export interface FeatureInfo {
  id: string;
  feature: string;
  summary?: Partial<Record<Severity, number>>;
  /** repository label ("acme/billing"); "local" for the local server and embedded reports */
  repo?: string;
  /** the sample reviews are demo data */
  demo?: boolean;
}

export interface Bundle {
  report: Report;
  sources: Sources;
  /** cloud only: where this version was first seen. A pull request's version is not on the default branch yet. */
  source?: "branch" | "pr";
}

/** One entry of the rule catalog (single source: backend `rules.py`). Every text field may be "". */
export interface Rule {
  id: string;
  name: string;
  family: string;
  question: string;
  severity: string;
  what: string;
  why: string;
  fix: string;
  bad: string;
  good: string;
  caveat: string;
}

export interface RuleCatalog {
  questions: Record<string, string>;
  rules: Rule[];
}

/** `GET /api/assistant` */
export type Effort = "low" | "medium" | "high";

/** A model the server lets the person pick for a turn. `efforts` empty/absent = the model has no effort setting. */
export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
  /** speed/depth class, shown as the hint when `hint` is absent */
  tier?: "fast" | "balanced" | "deep";
  efforts?: Effort[];
}

export interface AssistantInfo {
  available: boolean;
  provider: string | null;
  model: string | null;
  demo: boolean;
  /** only when the server accepts a per-turn choice; without it the composer shows the single model as a label */
  models?: ModelOption[];
}

/** The finding that motivated a question to the assistant (sent as `focus`). */
export interface Focus {
  rule: string;
  ids: string[];
}

declare global {
  interface Window {
    __SPECREVIEW__?: (Bundle & { rules?: unknown }) | null;
  }
}
