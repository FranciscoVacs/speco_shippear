export type AgentPage = "home" | "reviews" | "review" | "rules" | "rule" | "docs" | "other";

export interface AgentContext {
  page: AgentPage;
  /** id of the feature when the page is /reviews/:featureId, else null/undefined */
  featureId?: string | null;
  /** id of the rule when the page is /rules/:ruleId, else null/undefined */
  ruleId?: string | null;
}

export type Variant = "home" | "panel";
