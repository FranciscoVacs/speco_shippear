// The credits of the current company as the whole app sees them (spec 020 FR-015): one small store so the top bar, the chat and the
// usage page agree, and so the chat can update it the moment a turn is charged or refused.
import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api";

export type Level = "ok" | "near" | "full";
export type Refusal = "no_credits" | "daily_cap" | "budget";

export interface CreditsStatus {
  metered: boolean;
  free_plan: boolean;
  plan: string;
  balance: number;
  granted: number;
  level: Level;
  next_renewal: string;
  turn_cost: number;
  can_upgrade: boolean;
  /** spec 024: paid plans can be bought (the upgrade leads to the plans, not only to a recorded wish) */
  billing?: boolean;
}
interface State {
  orgId: string | null;
  status: CreditsStatus | null;
  /** why the last turn was refused: it says more than the level does (the day, the pause of the free plan) */
  refusal: Refusal | null;
  /** the "near" warning the person closed; it comes back if the level changes */
  nearDismissed: boolean;
}

let state: State = { orgId: null, status: null, refusal: null, nearDismissed: false };
const subs = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

export const useCredits = (): State => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state, () => state);

const REFUSALS: Refusal[] = ["no_credits", "daily_cap", "budget"];
export const isRefusal = (code: string): code is Refusal => (REFUSALS as string[]).includes(code);

/** Loads the summary of a company. A viewer (403) or a failure shows no indicator rather than a wrong one. */
export async function refreshCredits(orgId: string): Promise<void> {
  if (state.orgId !== orgId) set({ orgId, status: null, refusal: null, nearDismissed: false });
  try {
    const status = await api<CreditsStatus>(`/api/orgs/${orgId}/credits/status`);
    if (state.orgId !== orgId) return;                       // the person switched company while this was loading
    set({ status, refusal: status.level === "full" ? state.refusal : null, nearDismissed: status.level === state.status?.level ? state.nearDismissed : false });
  } catch (e) {
    if (state.orgId === orgId && e instanceof ApiError) set({ status: null });
  }
}

/** The service says how it stands after every answer. */
export function applyStatus(raw: Record<string, unknown>): void {
  const status = raw as unknown as CreditsStatus;
  if (typeof status.balance !== "number" || !status.level) return;
  set({ status, refusal: status.level === "full" ? state.refusal : null, nearDismissed: status.level === state.status?.level ? state.nearDismissed : false });
}

/** A turn was refused (402): the limit is reached whatever the last summary said. */
export function markRefusal(code: Refusal): void {
  set({ refusal: code, status: state.status ? { ...state.status, level: "full" } : state.status });
}

export const dismissNear = (): void => set({ nearDismissed: true });

export const daysUntil = (iso: string, now = Date.now()): number => Math.max(1, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
