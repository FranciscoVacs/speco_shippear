// Spec 024 from the browser: the price list, the plan of a company with its invoices, and the change of plan (all decided by the service).
import { api } from "./api";

export type PlanId = "hobby" | "pro" | "team";

export interface PlanInfo {
  plan: PlanId;
  rank: number;
  price_cents: number;
  currency: string;
  period_credits: number;
  daily_cap: number;
}
export interface PlansInfo {
  enabled: boolean;
  simulated: boolean;
  plans: PlanInfo[];
}
export interface Invoice {
  id: string;
  number: string;
  kind: "upgrade" | "renewal";
  plan: PlanId;
  amount_cents: number;
  currency: string;
  status: "paid" | "failed";
  failure: string | null;
  simulated: boolean;
  period_start: string;
  period_end: string;
  created_at: string;
}
export interface BillingInfo {
  enabled: boolean;
  simulated: boolean;
  plan: PlanId;
  /** what each higher plan would charge today, in cents (the unused part of the current period is already taken off) */
  quotes: Partial<Record<PlanId, number>>;
  subscription: { plan: PlanId; status: "active" | "past_due"; provider: string; period_start: string; period_end: string; scheduled_plan: PlanId | null } | null;
  invoices: Invoice[];
}
export type PlanResult =
  | { result: "upgraded"; plan: PlanId; amount_cents: number }
  | { result: "scheduled"; plan: PlanId; at: string }
  | { result: "resumed"; plan: PlanId };

/** `decline` only exists for the simulated payment: it shows what a refused card looks like. */
export const changePlan = (orgId: string, plan: PlanId, simulate?: "decline"): Promise<PlanResult> =>
  api<PlanResult>(`/api/orgs/${orgId}/billing/plan`, { body: { plan, ...(simulate ? { simulate } : {}) } });

export const money = (cents: number, currency: string, lang: string): string =>
  new Intl.NumberFormat(lang, { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
