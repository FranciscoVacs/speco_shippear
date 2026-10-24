import { api } from "./cloud/api";
import { cloudEnabled } from "./cloud/config";
import type { Bundle, FeatureInfo, Rule, RuleCatalog } from "./types";

export type Mode = "embedded" | "server" | "samples" | "cloud";

/** Why a server-mode loader has nothing to show (never a raw error). */
export type Issue = "no-features" | "api-error" | null;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("json")) throw new Error(`${url}: respuesta no JSON`);
  return (await r.json()) as T;
}

/** True when the page carries its own report (exported HTML / hosted artifact). */
export function isEmbedded(): boolean {
  const emb = typeof window !== "undefined" ? window.__SPECREVIEW__ : null;
  return !!(emb && emb.report);
}

export interface Loader {
  mode: Mode;
  features: FeatureInfo[];
  issue: Issue;
  /** Rule catalog, or null when it is not available (the UI degrades gracefully). */
  rules: RuleCatalog | null;
  load: (id: string) => Promise<Bundle>;
  /** cloud: the company whose features these are */
  orgId?: string;
  /** cloud: a version that is not in the list (the one a pull request proposes, `<feature>~<version>`) */
  resolve?: (id: string) => FeatureInfo | undefined;
}

function normalizeFeatures(raw: unknown): FeatureInfo[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { features?: unknown }).features)
      ? (raw as { features: unknown[] }).features
      : [];
  return arr.map((x) => {
    if (typeof x === "string") return { id: x, feature: x };
    const o = x as Partial<FeatureInfo> & { name?: string };
    const id = String(o.id ?? o.feature ?? o.name ?? "");
    return { id, feature: String(o.feature ?? o.name ?? id), summary: o.summary, repo: typeof o.repo === "string" && o.repo ? o.repo : undefined, demo: o.demo === true };
  });
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Accepts anything; returns a well-formed catalog or null. */
export function normalizeRules(raw: unknown): RuleCatalog | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { questions?: unknown; rules?: unknown };
  if (!Array.isArray(o.rules)) return null;
  const rules: Rule[] = [];
  for (const r of o.rules) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const id = str(x.id).trim();
    if (!id) continue;
    rules.push({
      id,
      name: str(x.name),
      family: str(x.family) || id.slice(0, 3),
      question: str(x.question),
      severity: str(x.severity),
      what: str(x.what),
      why: str(x.why),
      fix: str(x.fix),
      bad: str(x.bad),
      good: str(x.good),
      caveat: str(x.caveat),
    });
  }
  const questions: Record<string, string> = {};
  if (o.questions && typeof o.questions === "object") {
    for (const [k, v] of Object.entries(o.questions as Record<string, unknown>)) if (typeof v === "string") questions[k] = v;
  }
  return rules.length ? { questions, rules } : null;
}

async function tryRules(url: string): Promise<RuleCatalog | null> {
  try {
    return normalizeRules(await getJson<unknown>(url));
  } catch {
    return null;
  }
}

type Probe = { kind: "none" } | { kind: "ok"; features: FeatureInfo[] } | { kind: "error" };

/** Is there a Spec Reviewer server behind /api? Distinguishes "no server" (static host, dev server) from "server with a problem". */
async function probeServer(): Promise<Probe> {
  let r: Response;
  try {
    r = await fetch("/api/features", { headers: { Accept: "application/json" } });
  } catch {
    return { kind: "none" }; // file://, offline, or no server at all
  }
  const json = (r.headers.get("content-type") ?? "").includes("json");
  if (!json) return { kind: "none" }; // static host: 404 page or SPA fallback HTML
  if (!r.ok) return { kind: "error" };
  try {
    return { kind: "ok", features: normalizeFeatures(await r.json()) };
  } catch {
    return { kind: "error" };
  }
}

interface CloudFeature {
  id: string;
  feature: string;
  repo: string;
  summary?: FeatureInfo["summary"];
}

/** The real features of one company, read through the service as the signed-in person (spec 027). Nothing here is a sample. */
async function createCloudLoader(orgId: string): Promise<Loader> {
  const [list, rules] = await Promise.all([api<CloudFeature[]>(`/api/orgs/${orgId}/features`), tryRules("/samples/rules.json")]);
  const features: FeatureInfo[] = list.map((f) => ({ id: f.id, feature: f.feature, summary: f.summary, repo: f.repo }));
  return {
    mode: "cloud",
    orgId,
    features,
    issue: null,
    rules,
    resolve: (id) => {
      const [base, version] = id.split("~");
      if (!version) return undefined;
      const known = features.find((f) => f.id === base);
      return { id, feature: known?.feature ?? id, repo: known?.repo };
    },
    load: async (id) => {
      const r = await api<Bundle>(`/api/orgs/${orgId}/features/${encodeURIComponent(id)}/review`);
      return { report: r.report, sources: r.sources, source: r.source };
    },
  };
}

export async function createLoader(cloudOrg?: string): Promise<Loader> {
  if (cloudOrg && cloudEnabled()) return createCloudLoader(cloudOrg);
  const emb = window.__SPECREVIEW__;
  if (emb && emb.report) {
    const b: Bundle = { report: emb.report, sources: emb.sources ?? {} };
    return {
      mode: "embedded",
      features: [{ id: b.report.feature, feature: b.report.feature, summary: b.report.summary, repo: "local" }],
      issue: null,
      rules: normalizeRules(emb.rules),
      load: async () => b,
    };
  }
  const probe = await probeServer();
  if (probe.kind !== "none") {
    const rules = await tryRules("/api/rules");
    const base = { mode: "server" as const, rules };
    if (probe.kind === "error") {
      return { ...base, features: [], issue: "api-error", load: () => Promise.reject(new Error("api-error")) };
    }
    if (probe.features.length === 0) {
      return { ...base, features: [], issue: "no-features", load: () => Promise.reject(new Error("no-features")) };
    }
    return {
      ...base,
      features: probe.features.map((f) => ({ ...f, repo: f.repo ?? "local" })),
      issue: null,
      load: async (id) => {
        const q = encodeURIComponent(id);
        const [report, sources] = await Promise.all([
          getJson<Bundle["report"]>(`/api/review?feature=${q}`),
          getJson<Bundle["sources"]>(`/api/sources?feature=${q}`).catch(() => ({})),
        ]);
        return { report, sources };
      },
    };
  }
  const [features, rules] = await Promise.all([getJson<unknown>("/samples/index.json").then(normalizeFeatures), tryRules("/samples/rules.json")]);
  return {
    mode: "samples",
    features: features.map((f) => ({ ...f, repo: f.repo ?? "local" })),
    issue: null,
    rules,
    load: async (id) => {
      const [report, sources] = await Promise.all([
        getJson<Bundle["report"]>(`/samples/${id}.report.json`),
        getJson<Bundle["sources"]>(`/samples/${id}.sources.json`).catch(() => ({})),
      ]);
      return { report, sources };
    },
  };
}
