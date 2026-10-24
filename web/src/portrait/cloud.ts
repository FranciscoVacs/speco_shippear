// The portrait on the service: loads the company's rules, changes, baselines and inventory, and sends every decision (spec 015).
import { useSyncExternalStore } from "react";
import { api, ApiError } from "../cloud/api";
import type { CloudOrg } from "../cloud/orgs";
import type { Failure, PortraitView } from "./backend";
import type { Action, Baseline, Drift, PortraitState, RepoInfo, Rule } from "./model";

interface ApiRule {
  id: string; code: string; statement: string; category: Rule["category"]; risk: Rule["risk"]; origin: Rule["origin"]; confidence: Rule["confidence"];
  status: Rule["status"]; repo: string; evidence: Rule["evidence"]; decided_by: string | null; decided_at: string | null;
}
interface ApiDrift { id: string; rule_id: string; kind: Drift["kind"]; detail: string; commit_sha: string; created_at: string; status: "open" | "acknowledged"; acknowledge_note: string | null }
interface ApiBaseline { id: string; name: string; frozen_by: string; frozen_at: string; rules_count: number; hash: string }
interface ApiInventory { full_name: string; counts: RepoInfo["counts"]; total_files: number }
interface ApiRepo { id: string; full_name: string; code_consent: boolean }

const ZERO: RepoInfo["counts"] = { specs: 0, docs: 0, api: 0, tests: 0, database: 0, config: 0, code: 0, other: 0 };

interface Store { state: PortraitState | null; loading: boolean; error: string | null; org: string | null; me: string | null; role: string | null }
let store: Store = { state: null, loading: false, error: null, org: null, me: null, role: null };
const subs = new Set<() => void>();
const set = (s: Partial<Store>) => {
  store = { ...store, ...s };
  cached = null;
  subs.forEach((f) => f());
};

let cached: PortraitView | null = null;
const view = (): PortraitView => {
  cached ??= {
    state: store.state, loading: store.loading, error: store.error,
    canDecide: ["owner", "admin", "approver"].includes(store.role ?? ""), canConsent: ["owner", "admin"].includes(store.role ?? ""), retry: () => {},
  };
  return cached;
};

const toRule = (r: ApiRule, me: string | null): Rule => ({
  id: r.id, code: r.code, statement: r.statement, category: r.category, risk: r.risk, origin: r.origin, confidence: r.confidence, status: r.status, repo: r.repo, evidence: r.evidence,
  ...(r.decided_by ? { decidedBy: r.decided_by === me ? "@me" : "@other", decidedAt: r.decided_at ?? "" } : {}),
});

async function load(orgId: string): Promise<void> {
  set({ loading: true, error: null, org: orgId });
  try {
    const q = `/api/orgs/${orgId}`;
    const [orgs, proposed, confirmed, rejected, drift, baselines, inventory, repos] = await Promise.all([
      api<CloudOrg[]>("/api/orgs"), api<ApiRule[]>(`${q}/rules?status=proposed`), api<ApiRule[]>(`${q}/rules?status=confirmed`), api<ApiRule[]>(`${q}/rules?status=rejected`),
      api<ApiDrift[]>(`${q}/drift?status=open`), api<ApiBaseline[]>(`${q}/baselines`), api<ApiInventory[]>(`${q}/inventory`), api<ApiRepo[]>(`${q}/repositories`),
    ]);
    const me = (await import("../cloud/auth").then((m) => m.accessToken()).then(subOf)) ?? null;
    const inv = new Map(inventory.map((i) => [i.full_name, i]));
    set({
      loading: false,
      me,
      role: orgs.find((o) => o.id === orgId)?.role ?? null,
      state: {
        v: 1,
        rules: [...proposed, ...confirmed, ...rejected].map((r) => toRule(r, me)),
        drift: drift.map((d) => ({ id: d.id, ruleId: d.rule_id, kind: d.kind, detail: d.detail, commit: d.commit_sha.slice(0, 7), at: d.created_at, status: d.status, ...(d.acknowledge_note ? { ackNote: d.acknowledge_note } : {}) })),
        baselines: baselines.map<Baseline>((b) => ({ id: b.id, name: b.name, at: b.frozen_at, by: b.frozen_by, count: b.rules_count, hash: b.hash })),
        repos: repos.map<RepoInfo>((r) => ({ id: r.id, name: r.full_name, counts: inv.get(r.full_name)?.counts ?? ZERO, total: inv.get(r.full_name)?.total_files ?? 0, consent: r.code_consent })),
      },
    });
  } catch (e) {
    set({ loading: false, error: e instanceof ApiError ? e.detail : String(e) });
  }
}

/** the user id inside the access token (`sub`): only used to tell "you" from "someone else" in the decision record */
function subOf(token: string | null): string | null {
  try {
    return token ? (JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string }).sub ?? null : null;
  } catch {
    return null;
  }
}

/** the service's refusals as the screen's failures */
function failure(e: unknown, action?: Action | "ack"): Failure {
  if (!(e instanceof ApiError)) return "network";
  if (e.status === 403) return "forbidden";
  if (e.status === 409) return "taken";
  if (e.status === 404) return "none";
  if (e.status === 422) return action === "reject" ? "reason" : action === "correct" ? "statement" : "note";
  return "network";
}

const reload = () => (store.org ? load(store.org) : Promise.resolve());

export const cloudPortrait = {
  useStore: (): Omit<PortraitView, "retry"> => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), view, view),
  load,
  async decide(id: string, action: Action, opts: { statement?: string; note?: string }): Promise<Failure | null> {
    const note = (opts.note ?? "").trim();
    if (action === "reject" && !note) return "reason";
    if (action === "correct" && !(opts.statement ?? "").trim()) return "statement";
    try {
      await api(`/api/rules/${id}/decision`, { body: { action, statement: action === "correct" ? opts.statement : null, note } });
    } catch (e) {
      return failure(e, action);
    }
    await reload();
    return null;
  },
  async freeze(name: string): Promise<Baseline | null> {
    if (!store.org || !name.trim()) return null;
    try {
      const r = await api<{ id: string; hash: string; rules_count: number }>(`/api/orgs/${store.org}/baselines`, { body: { name: name.trim() } });
      await reload();
      return { id: r.id, name: name.trim(), at: new Date().toISOString(), by: store.me ?? "", count: r.rules_count, hash: r.hash };
    } catch {
      return null;
    }
  },
  async acknowledge(id: string, note: string): Promise<Failure | null> {
    if (!note.trim()) return "note";
    try {
      await api(`/api/drift/${id}/acknowledge`, { body: { note } });
    } catch (e) {
      return failure(e, "ack");
    }
    await reload();
    return null;
  },
  async setConsent(repo: { id?: string; name: string }, on: boolean): Promise<Failure | null> {
    if (!repo.id) return "none";
    try {
      await api(`/api/repos/${repo.id}/consent`, { body: { on } });
    } catch (e) {
      return failure(e, "ack");
    }
    await reload();
    return null;
  },
};
