// Activation progress (spec 012): which milestones the person has done and whether the checklist is closed. Persisted in
// browser storage when it works; with storage blocked it lives in memory for the session (NFR-002).
import { useSyncExternalStore } from "react";
import { readJSON, storage } from "../shell/storage";

export const ACTIVATION_KEY = "sr-activation";

export const MILESTONES = ["decisions", "review", "decide", "ask"] as const;
export type MilestoneId = (typeof MILESTONES)[number];

export interface ActivationState {
  done: MilestoneId[];
  /** the person closed the checklist (or had already seen the old introduction) */
  dismissed: boolean;
  /** expanded card vs. the small pill */
  open: boolean;
}

function initial(): ActivationState {
  const saved = readJSON<Partial<ActivationState>>(ACTIVATION_KEY);
  if (saved) {
    return {
      done: (saved.done ?? []).filter((m): m is MilestoneId => (MILESTONES as readonly string[]).includes(m)),
      dismissed: !!saved.dismissed,
      open: saved.open ?? false,
    };
  }
  // someone who already closed the old introduction is not a first visit
  const seen = storage.get("sr-onboarded") === "1";
  return { done: [], dismissed: seen, open: !seen };
}

let state: ActivationState = initial();
const subs = new Set<() => void>();

function set(next: ActivationState) {
  state = next;
  storage.set(ACTIVATION_KEY, JSON.stringify(next));
  subs.forEach((f) => f());
}

export const activation = {
  get: () => state,
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  /** idempotent: marking a milestone twice changes nothing */
  markDone(id: MilestoneId) {
    if (state.done.includes(id)) return;
    set({ ...state, done: [...state.done, id] });
  },
  setOpen(open: boolean) {
    if (state.open !== open) set({ ...state, open });
  },
  dismiss() {
    set({ ...state, dismissed: true, open: false });
  },
  /** from the Help menu */
  reopen() {
    set({ ...state, dismissed: false, open: true });
  },
  /** tests only */
  reset() {
    state = initial();
    subs.forEach((f) => f());
  },
};

export const useActivation = (): ActivationState => useSyncExternalStore(activation.subscribe, activation.get, activation.get);
