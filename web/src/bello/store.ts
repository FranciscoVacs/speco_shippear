import { useSyncExternalStore } from "react";
import { EVENT_SEED, REG_CHANGES, REQUIREMENTS, type RegChange, type Requirement, type Spec, type Status, type TraceEventSeed } from "./data";
import { analyzeSpec, buildSpec, type SpecDraft } from "./analysis";

export interface StoredEvent extends TraceEventSeed {
  seq?: number;
  prev?: string;
  /** hash sealed by the database when the event was written */
  hash?: string;
}

/** "live": state comes from Neon · "offline": API unreachable, changes stay in this tab */
export type Sync = "loading" | "live" | "offline" | "saving";

interface State {
  requirements: Requirement[];
  events: StoredEvent[];
  regChanges: RegChange[];
  /** the person acting in the demo */
  me: string;
  sync: Sync;
  error: string | null;
}

interface Remote {
  requirements: Requirement[];
  events: StoredEvent[];
  regChanges: RegChange[];
}

let state: State = { requirements: REQUIREMENTS, events: EVENT_SEED, regChanges: REG_CHANGES, me: "lfernandez", sync: "loading", error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBello(): State {
  return useSyncExternalStore(subscribe, () => state);
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/bello/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new Error("offline");
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "Error del servidor");
  return data as T;
}

const apply = (d: Remote) => set({ requirements: d.requirements, events: d.events, regChanges: d.regChanges, sync: "live", error: null });

export async function refresh() {
  try {
    apply(await call<Remote>("state", "GET"));
  } catch {
    set({ sync: "offline" });
  }
}

if (typeof window !== "undefined") void refresh();

/** Runs the mutation on the server when it is reachable; otherwise applies the local fallback so the demo keeps working. */
async function mutate<T extends Remote>(path: string, method: string, body: unknown, local: () => void): Promise<T | null> {
  if (state.sync === "offline") {
    local();
    return null;
  }
  set({ sync: "saving" });
  try {
    const d = await call<T>(path, method, body);
    apply(d);
    return d;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "offline") {
      set({ sync: "offline" });
      local();
      return null;
    }
    set({ sync: "live", error: msg });
    return null;
  }
}

export const allSpecs = (reqs: Requirement[]): Spec[] => reqs.flatMap((r) => r.specs);

export function requirementStatus(r: Requirement): Status {
  const s = r.specs.map((x) => x.status);
  if (!s.length) return "pending";
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

function localRecord(actor: string, action: string, target: string, detail: string) {
  set({ events: [...state.events, { at: new Date().toISOString(), actor, action, target, detail }] });
}

export function addRequirement(req: Requirement) {
  return mutate("requirements", "POST", { requirement: req, actor: state.me }, () => {
    set({ requirements: [{ ...req, isNew: true }, ...state.requirements] });
    localRecord(state.me, "creó requerimiento", req.id, req.title);
    localRecord("agent", "redactó specs EARS", req.id, `${req.specs.length} specs · ${new Set(req.specs.flatMap((s) => s.rules)).size} reglas aplicadas`);
  });
}

export interface NewSpecInput extends SpecDraft {
  newRequirementTitle?: string;
}

/** Creates a spec (and its requirement when it is new). Resolves with the id of the created spec. */
export async function addSpec(input: NewSpecInput): Promise<string | null> {
  let createdId: string | null = null;
  const d = await mutate<Remote & { spec: string }>("specs", "POST", { ...input, actor: state.me }, () => {
    let req = state.requirements.find((r) => r.id === input.requirementId);
    let reqs = state.requirements;
    if (!req) {
      req = { id: nextRequirementId(reqs), title: input.newRequirementTitle ?? input.title, goal: input.title, requestedBy: state.me, createdAt: new Date().toISOString().slice(0, 10), specs: [], isNew: true };
      reqs = [req, ...reqs];
    }
    const analysis = analyzeSpec({ ...input, requirementId: req.id }, state.requirements);
    const spec = buildSpec(input, req, analysis);
    createdId = spec.id;
    const flag = new Set(analysis.toReverify);
    set({
      requirements: reqs.map((r) => ({
        ...r,
        specs: (r.id === req!.id ? [...r.specs, spec] : r.specs).map((s) => (flag.has(s.id) ? { ...s, status: "risk" as Status } : s)),
      })),
    });
    localRecord(state.me, "creó spec", spec.id, spec.title);
    localRecord("agent", "analizó impacto", spec.id, `${analysis.summary} · riesgo ${analysis.risk}/100`);
    for (const id of flag) localRecord("agent", "marcó en riesgo", id, `Posible contradicción con ${spec.id}`);
  });
  return d?.spec ?? createdId;
}

export function setSpecStatus(specId: string, status: Status, actor: string, action: string, detail: string) {
  return mutate("specs", "PATCH", { specId, status, actor, action, detail }, () => {
    set({
      requirements: state.requirements.map((r) => ({
        ...r,
        specs: r.specs.map((s) => (s.id === specId ? { ...s, status, approvedBy: status === "verified" ? actor : s.approvedBy } : s)),
      })),
    });
    localRecord(actor, action, specId, detail);
  });
}

export const specsAffectedBy = (change: RegChange, reqs: Requirement[]): Spec[] => allSpecs(reqs).filter((s) => s.rules.includes(change.ruleId));

/** Flags every verified spec reinforced by the changed rule as "en riesgo" so it must be re-verified, and chains the events. */
export function analyzeRegChange(id: string) {
  const change = state.regChanges.find((c) => c.id === id);
  if (!change || change.state === "analizado") return;
  return mutate("reg-changes", "POST", { id, actor: state.me }, () => {
    const affected = specsAffectedBy(change, state.requirements);
    const toFlag = new Set(affected.filter((s) => s.status === "verified").map((s) => s.id));
    set({
      regChanges: state.regChanges.map((c) => (c.id === id ? { ...c, state: "analizado" } : c)),
      requirements: state.requirements.map((r) => ({ ...r, specs: r.specs.map((s) => (toFlag.has(s.id) ? { ...s, status: "risk" as Status } : s)) })),
    });
    localRecord("agent", "detectó cambio normativo", change.ruleId, `${change.id} · ${change.after}`);
    localRecord(state.me, "analizó impacto", change.id, `${affected.length} specs alcanzadas · ${toFlag.size} a re-verificar`);
    for (const sid of toFlag) localRecord("agent", "marcó en riesgo", sid, `Re-verificar por ${change.id}`);
  });
}

export function resetDemo() {
  return mutate("reset", "POST", {}, () => set({ requirements: REQUIREMENTS, events: EVENT_SEED, regChanges: REG_CHANGES }));
}

export const setMe = (me: string) => set({ me });

export function nextRequirementId(reqs: Requirement[]): string {
  const max = Math.max(100, ...reqs.map((r) => Number(r.id.split("-")[1]) || 100));
  return `BEL-${max + 1}`;
}
