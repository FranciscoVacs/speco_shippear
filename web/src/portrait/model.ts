// Initial portrait (spec 014): the rules the software already enforces, proposed by a model or read from implemented specs,
// and decided by a person. These types mirror the cloud API (rules, evidence, baselines, drift findings).
export type Category = "money" | "permissions" | "limits" | "notifications" | "data" | "other";
export type Risk = "high" | "medium" | "low";
export type Origin = "spec" | "code";
export type Confidence = "low" | "medium" | "high";
export type RuleStatus = "proposed" | "confirmed" | "rejected";
export type Action = "confirm" | "correct" | "reject";

/** repository content is not translated: seeded statements carry both languages, edited ones are plain text */
export type Text = string | { es: string; en: string };

export interface Evidence {
  path: string;
  start_line: number;
  end_line: number;
  excerpt: string;
}

export interface Rule {
  id: string;
  code: string;
  statement: Text;
  category: Category;
  risk: Risk;
  origin: Origin;
  confidence: Confidence;
  status: RuleStatus;
  repo: string;
  evidence: Evidence[];
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface Drift {
  id: string;
  ruleId: string;
  kind: "evidence_changed" | "evidence_removed";
  detail: Text;
  commit: string;
  at: string;
  status: "open" | "acknowledged";
  ackNote?: string;
}

export interface Baseline {
  id: string;
  name: string;
  at: string;
  by: string;
  count: number;
  hash: string;
}

export interface RepoInfo {
  /** service id: needed to change the permission or ask for a portrait (absent in the demo) */
  id?: string;
  name: string;
  counts: Record<"specs" | "docs" | "api" | "tests" | "database" | "config" | "code" | "other", number>;
  total: number;
  /** the company agreed that this repository's code may be analyzed by a model (NFR-001) */
  consent: boolean;
}

export interface PortraitState {
  v: number;
  rules: Rule[];
  drift: Drift[];
  baselines: Baseline[];
  repos: RepoInfo[];
}

export const text = (t: Text, lang: "es" | "en"): string => (typeof t === "string" ? t : t[lang]);
