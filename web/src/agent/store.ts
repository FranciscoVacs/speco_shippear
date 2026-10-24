// The conversation store shared by the root page and the side panel (FR-007). It lives at module level, outside React,
// and is deliberately small: it is part of the first-view bundle. The heavy part (assistant-ui runtime, simulated
// engine, tool cards) is loaded lazily from "./agent-runtime" and talks to this store through `attachApi`/`syncThread`.
import { cloudAssistantInfo, installCloudAssistant } from "../cloud/assistant";
import { cloudEnabled } from "../cloud/config";
import { useSyncExternalStore } from "react";
import { isEmbedded, type Loader } from "../data";
import type { Lang } from "../i18n";
import type { AssistantInfo, Effort, Focus, ModelOption } from "../types";
import type { AgentContext, Variant } from "./types";

export type Engine = "pending" | "backend" | "demo";

export interface AgentState {
  /** which engine answers: the local server with a model, or the simulated agent in the browser (FR-018/FR-019) */
  engine: Engine;
  info: AssistantInfo | null;
  /** the thread has messages (or a first message is waiting for the runtime): the home page shows the chat layout */
  started: boolean;
  running: boolean;
  /** someone asked for the heavy runtime chunk (first interaction) */
  runtimeWanted: boolean;
  /** the runtime is mounted and its API is attached */
  hostReady: boolean;
  /** composer text, shared by the home page and the panel */
  text: string;
  /** the next mounted/updated composer must take the keyboard focus (after "Preguntar al asistente") */
  focusReq: boolean;
  /** finding the next request is about (sent as `focus`) */
  focus: Focus | null;
  /** feature the next request is about, set together with `focus` (overrides the page's feature once) */
  overrideFeature: string | null;
  /** feature picked in the home page control (null = all features) */
  homeFeature: string | null;
  /** repository the home page narrows the feature list to (null = all repositories) */
  scopeRepo: string | null;
  /** model and effort picked in the composer; null model = the engine's own default */
  model: string | null;
  effort: Effort;
  /** the panel's page context is detached (FR-006) */
  detached: boolean;
  /** first message sent before the runtime chunk arrived */
  queued: string | null;
  /** DOM nodes where each slot wants the thread rendered (portals from the runtime host) */
  mounts: Record<Variant, HTMLElement | null>;
  /** the thread of that slot is on screen (before that, the slot shows a placeholder) */
  shown: Record<Variant, boolean>;
}

// model and effort are per-person conveniences: remembered in this browser only (storage may be blocked)
const PREFS_KEY = "sr-agent-prefs-v1";
const EFFORTS: Effort[] = ["low", "medium", "high"];
function loadPrefs(): { model: string | null; effort: Effort } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { model?: unknown; effort?: unknown };
    return {
      model: typeof p.model === "string" ? p.model : null,
      effort: EFFORTS.includes(p.effort as Effort) ? (p.effort as Effort) : "medium",
    };
  } catch {
    return { model: null, effort: "medium" };
  }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ model: state.model, effort: state.effort }));
  } catch {
    /* private window or blocked storage: the choice just lasts for this page */
  }
}

/** The simulated agent has no real models; these let the demo show the composer exactly as it will look with a server that offers a choice. */
export const DEMO_MODELS: ModelOption[] = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5", tier: "fast" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", tier: "balanced", efforts: EFFORTS },
  { id: "claude-opus-5-5", label: "Opus 5.5", tier: "deep", efforts: EFFORTS },
];

/** What the composer offers for the current engine: the server's list, the demo's, or nothing (a single fixed model). */
export function modelOptions(s: Pick<AgentState, "engine" | "info">): ModelOption[] {
  if (s.engine === "demo") return DEMO_MODELS;
  return s.engine === "backend" ? (s.info?.models ?? []) : [];
}
/** The model that will answer: the person's pick if still on offer, else the balanced one (or the first). */
export function selectedModel(s: Pick<AgentState, "engine" | "info" | "model">): ModelOption | null {
  const opts = modelOptions(s);
  return opts.find((m) => m.id === s.model) ?? opts.find((m) => m.tier === "balanced") ?? opts[0] ?? null;
}

const initial: AgentState = {
  engine: "pending",
  info: null,
  started: false,
  running: false,
  runtimeWanted: false,
  hostReady: false,
  text: "",
  focusReq: false,
  focus: null,
  overrideFeature: null,
  homeFeature: null,
  scopeRepo: null,
  ...loadPrefs(),
  detached: false,
  queued: null,
  mounts: { home: null, panel: null },
  shown: { home: false, panel: false },
};

let state: AgentState = initial;
const listeners = new Set<() => void>();

function set(p: Partial<AgentState>) {
  let changed = false;
  for (const k of Object.keys(p) as (keyof AgentState)[]) if (state[k] !== p[k]) changed = true;
  if (!changed) return;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const getAgentState = () => state;
/** Select primitives or stable references only. */
export function useAgent<T>(sel: (s: AgentState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

// ---------------------------------------------------------------- non-reactive environment (read at send time)
export const env = {
  /** the page the user is on, kept up to date by the mounted slot */
  ctx: { page: "home" } as AgentContext,
  lang: "es" as Lang,
  loader: null as Loader | null,
  navigate: (to: string) => {
    window.location.assign(to);
  },
};

let loaderWaiters: ((l: Loader) => void)[] = [];
export function setLoader(l: Loader | null) {
  env.loader = l;
  if (l) {
    loaderWaiters.forEach((w) => w(l));
    loaderWaiters = [];
  }
}
export function getLoader(): Promise<Loader> {
  return env.loader ? Promise.resolve(env.loader) : new Promise((resolve) => loaderWaiters.push(resolve));
}

/** In the exported single file there is no agent at all; in the hosted demo page the simulated agent works on the embedded report. */
export function agentEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const hosted = !!(window as { __SR_MEMORY_ROUTER__?: boolean }).__SR_MEMORY_ROUTER__;
  return hosted || (!isEmbedded() && window.location.protocol !== "file:");
}

/** Feature the next request is about: explicit override, then the page's feature (unless detached), then the home pick. */
export function effectiveFeature(): string | null {
  const c = env.ctx;
  const features = env.loader?.features ?? [];
  const known = (id: string | null | undefined) => (id && features.some((f) => f.id === id) ? id : null);
  // the embedded report is routed as /reviews/report but its feature id is the report's own
  const page = c.featureId ? (known(c.featureId) ?? (isEmbedded() ? (features[0]?.id ?? null) : null)) : null;
  const base = c.page === "home" ? known(state.homeFeature) : state.detached ? null : (page ?? known(state.homeFeature));
  return known(state.overrideFeature) ?? base;
}

/** Rule the next request is about (the rule page's rule, unless the context was detached). */
export function effectiveRule(): string | null {
  return state.detached ? null : (env.ctx.ruleId ?? null);
}

// ---------------------------------------------------------------- lazy runtime
type RuntimeModule = typeof import("./agent-runtime");
let runtimePromise: Promise<RuntimeModule> | null = null;
export function loadRuntime(): Promise<RuntimeModule> {
  return (runtimePromise ??= import("./agent-runtime"));
}
export function wantRuntime() {
  set({ runtimeWanted: true });
  void loadRuntime().catch(() => {
    runtimePromise = null; // a failed download can be retried on the next interaction
  });
}

/** Download the runtime when the browser is idle, so the first message does not wait (never on data saver, never where there is no agent). */
export function prefetchWhenIdle(): () => void {
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (!agentEnabled() || conn?.saveData) return () => {};
  let idle: number | undefined;
  const run = () => void loadRuntime().catch(() => (runtimePromise = null));
  // wait out the first paint and the data requests, then use idle time (3 s at most)
  const t = window.setTimeout(() => {
    const w = window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) idle = w.requestIdleCallback(run, { timeout: 3000 });
    else idle = window.setTimeout(run, 3000);
  }, 2000);
  return () => {
    window.clearTimeout(t);
    if (idle !== undefined) {
      const w = window as { cancelIdleCallback?: (n: number) => void };
      w.cancelIdleCallback?.(idle);
      window.clearTimeout(idle);
    }
  };
}

// ---------------------------------------------------------------- engine detection (FR-018, FR-019)
let enginePromise: Promise<void> | null = null;
/** GET /api/assistant once. A static host answers index.html (not JSON) or 404: that means "no backend", not an error. */
export function detectEngine(): Promise<void> {
  return (enginePromise ??= (async () => {
    if (!agentEnabled() || !!(window as { __SR_MEMORY_ROUTER__?: boolean }).__SR_MEMORY_ROUTER__) return set({ engine: "demo" });
    if (cloudEnabled()) {                              // spec 020: the company's assistant in the service, charged to its credits
      const info = await cloudAssistantInfo();
      if (!info) return set({ engine: "demo" });
      installCloudAssistant();
      return set({ engine: "backend", info });
    }
    try {
      const r = await fetch("/api/assistant", { headers: { Accept: "application/json" } });
      if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
        const a = (await r.json()) as Partial<AssistantInfo>;
        if (a && a.available === true) {
          return set({
            engine: "backend",
            info: { available: true, provider: typeof a.provider === "string" ? a.provider : null, model: typeof a.model === "string" ? a.model : null, demo: a.demo === true, ...(Array.isArray(a.models) ? { models: a.models } : {}) },
          });
        }
      }
    } catch {
      /* no server */
    }
    set({ engine: "demo" });
  })());
}
export const engineReady = (): Promise<void> => detectEngine();

// ---------------------------------------------------------------- thread API (attached by the runtime host)
export interface ThreadApi {
  append: (text: string) => void;
  cancel: () => void;
  reset: () => void;
}
let api: ThreadApi | null = null;

export function attachApi(a: ThreadApi | null) {
  api = a;
  set({ hostReady: !!a });
  if (a && state.queued) {
    const q = state.queued;
    set({ queued: null });
    a.append(q);
  }
}
export function syncThread(isEmpty: boolean, isRunning: boolean) {
  set({ started: !isEmpty || state.queued != null, running: isRunning });
}

// ---------------------------------------------------------------- actions
export const agent = {
  setText: (text: string) => set({ text }),
  clearFocusReq: () => set({ focusReq: false }),
  setFocus: (focus: Focus | null) => set({ focus, ...(focus ? {} : { overrideFeature: null }) }),
  setHomeFeature: (id: string | null) => set({ homeFeature: id }),
  /** narrowing to a repository drops a feature pick that belongs to another one */
  setScopeRepo(repo: string | null) {
    const f = env.loader?.features.find((x) => x.id === state.homeFeature);
    set({ scopeRepo: repo, ...(repo && f && (f.repo ?? "local") !== repo ? { homeFeature: null } : {}) });
  },
  setModel(model: string) {
    set({ model });
    savePrefs();
  },
  setEffort(effort: Effort) {
    set({ effort });
    savePrefs();
  },
  setDetached: (detached: boolean) => set({ detached }),
  setMount: (v: Variant, el: HTMLElement | null) => set({ mounts: { ...state.mounts, [v]: el } }),
  setShown: (v: Variant, on: boolean) => set({ shown: { ...state.shown, [v]: on } }),
  /** a request finished well: the one-shot focus is spent */
  spendFocus: () => set({ focus: null, overrideFeature: null }),

  /** Send the composer text, or `raw` (a chip). Ignored while an answer is streaming. */
  send(raw?: string) {
    const text = (raw ?? state.text).trim();
    if (!text || state.running || state.queued != null) return;
    if (raw === undefined) set({ text: "" });
    wantRuntime();
    if (api) api.append(text);
    else set({ queued: text, started: true });
  },
  stop() {
    if (api) api.cancel();
    else if (state.queued != null) set({ queued: null, started: false });
  },
  newConversation() {
    api?.cancel();
    api?.reset();
    set({ queued: null, started: false, running: false, focus: null, overrideFeature: null, text: "" });
  },
  /** "Preguntar al asistente" on a finding: prefill the composer (never send) and remember what it is about. */
  ask(d: { text: string; focus: Focus; featureId: string }) {
    set({ text: d.text, focus: d.focus, overrideFeature: d.featureId || null, focusReq: true, detached: false });
    wantRuntime();
  },
  /** A card's "Preguntar sobre este hallazgo": a focused question sent right away. */
  sendFocused(text: string, focus: Focus, featureId: string) {
    if (state.running) return;
    set({ focus, overrideFeature: featureId });
    agent.send(text);
  },
};
