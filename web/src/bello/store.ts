import { useSyncExternalStore } from "react";
import { EVENT_SEED, REQUIREMENTS, type Requirement, type Spec, type Status, type TraceEventSeed } from "./data";

interface State {
  requirements: Requirement[];
  events: TraceEventSeed[];
  /** the person acting in the demo */
  me: string;
}

let state: State = { requirements: REQUIREMENTS, events: EVENT_SEED, me: "lfernandez" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBello(): State {
  return useSyncExternalStore(subscribe, () => state);
}

export const allSpecs = (reqs: Requirement[]): Spec[] => reqs.flatMap((r) => r.specs);

export function requirementStatus(r: Requirement): Status {
  const s = r.specs.map((x) => x.status);
  if (s.includes("failing")) return "failing";
  if (s.includes("risk")) return "risk";
  if (s.every((x) => x === "verified")) return "verified";
  if (s.every((x) => x === "pending")) return "pending";
  return "progress";
}

export function verifiedRatio(specs: Spec[]): number {
  if (!specs.length) return 0;
  return Math.round((specs.filter((s) => s.status === "verified").length / specs.length) * 100);
}

export function record(actor: string, action: string, target: string, detail: string) {
  state = { ...state, events: [...state.events, { at: new Date().toISOString(), actor, action, target, detail }] };
  emit();
}

export function addRequirement(req: Requirement) {
  state = { ...state, requirements: [{ ...req, isNew: true }, ...state.requirements] };
  emit();
  record(state.me, "creó requerimiento", req.id, req.title);
  record("agent", "redactó specs EARS", req.id, `${req.specs.length} specs · ${new Set(req.specs.flatMap((s) => s.rules)).size} reglas aplicadas`);
}

export function setSpecStatus(specId: string, status: Status, actor: string, action: string, detail: string) {
  state = {
    ...state,
    requirements: state.requirements.map((r) => ({
      ...r,
      specs: r.specs.map((s) => (s.id === specId ? { ...s, status, approvedBy: status === "verified" ? actor : s.approvedBy } : s)),
    })),
  };
  emit();
  record(actor, action, specId, detail);
}

export function nextRequirementId(reqs: Requirement[]): string {
  const max = Math.max(...reqs.map((r) => Number(r.id.split("-")[1]) || 100));
  return `BEL-${max + 1}`;
}
