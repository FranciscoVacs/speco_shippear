// Approvals: who approved which version of a spec. Two backends behind one hook:
//  - server mode: the real, hash-chained audit log of the local server (`/api/approvals`, bearer token),
//  - cloud mode: the company's own log in the database (spec 027), read and written through the service as the signed-in person,
//  - demo mode (static site): a seeded history + whatever the visitor does, kept ONLY in this browser (labelled as demo).
import { activation } from "../activation/store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "../DataContext";
import { api, ApiError } from "../cloud/api";
import { storage } from "../shell/storage";
import type { Sources } from "../types";

export type DecisionKind = "approved" | "approved_with_conditions" | "rejected" | "delegated";
export interface Entry {
  id: string;
  feature: string;
  /** cloud: the folder name of the feature (`feature` is its id there) */
  feature_key?: string;
  decision: DecisionKind;
  reason: string;
  conditions: string[];
  delegate_to: string | null;
  override: boolean;
  by: { id: string; name: string; role: string; via: string };
  at: string;
  spec_hash: string;
  files: Record<string, string>;
  verdict: string;
  open: { decision: number; team: number; blockers: number };
  demo?: boolean;
}
export interface ApprovalStatus {
  state: "none" | DecisionKind;
  stale: boolean;
  changed_files: string[];
  latest: Entry | null;
}
export interface MemberInfo {
  id: string;
  name: string;
  role: string;
}
export interface Request {
  decision: DecisionKind;
  reason: string;
  conditions: string[];
  delegate_to: string | null;
  override: boolean;
}

export const TOKEN_KEY = "sr-token";
const DEMO_KEY = "sr-demo-approvals";
const FILES = ["spec.md", "plan.md", "tasks.md", "data-model.md", "values.md"]; // values.md: decided numbers a PR moves (spec 031)

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same canonical form as `approvals.spec_hashes` / `spec_hash` in the backend. */
export async function hashSources(sources: Sources): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const n of FILES) if (sources[n] != null) out[n] = await sha256(sources[n]);
  return out;
}

function status(history: Entry[], feature: string, now: Record<string, string> | null): ApprovalStatus {
  const latest = history.find((e) => e.feature === feature) ?? null;
  if (!latest) return { state: "none", stale: false, changed_files: [], latest: null };
  const changed = now ? [...new Set([...Object.keys(now), ...Object.keys(latest.files)])].filter((n) => now[n] !== latest.files[n]).sort() : [];
  return { state: latest.decision, stale: changed.length > 0, changed_files: changed, latest };
}

const loadLocal = (): Entry[] => {
  try {
    const v = JSON.parse(storage.get(DEMO_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

async function json<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { error?: string; code?: string } }> {
  const r = await fetch(url, init);
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  return { ok: r.ok, status: r.status, body };
}

export interface Approvals {
  mode: "demo" | "server" | "cloud" | "off";
  loading: boolean;
  status: ApprovalStatus | null;
  history: Entry[];
  /** The hash chain of the log (server mode). `ok: false` = someone edited or removed an entry by hand. */
  chain: { ok: boolean; broken_at: string | null; reason: string } | null;
  members: MemberInfo[];
  me: { name: string; id: string } | null;
  canApprove: boolean;
  needsToken: boolean;
  setToken: (t: string) => Promise<boolean>;
  submit: (r: Request) => Promise<string | null>;
}

/** `feature` null = all features (history only). `sources` are the sources of that feature, to detect a changed spec. */
export function useApprovals(feature: string | null, sources: Sources | null): Approvals {
  const { loader } = useData();
  const mode: Approvals["mode"] = !loader || loader.issue || loader.mode === "embedded" ? "off" : loader.mode === "server" ? "server" : loader.mode === "cloud" ? "cloud" : "demo";
  const [seed, setSeed] = useState<{ entries: Entry[]; members: MemberInfo[]; me: string } | null>(null);
  const [local, setLocal] = useState<Entry[]>(loadLocal);
  const [remote, setRemote] = useState<Entry[]>([]);
  const [chain, setChain] = useState<Approvals["chain"]>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [me, setMe] = useState<{ name: string; id: string; can: boolean } | null>(null);
  const [members_configured, setConfigured] = useState(true);
  const [now, setNow] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const orgId = loader?.orgId;
  // a version of a feature is `<feature>` or `<feature>~<version>`; the log is kept per feature
  const base = feature ? feature.split("~")[0] : null;

  useEffect(() => {
    if (!sources) return setNow(null);
    let live = true;
    hashSources(sources).then((h) => live && setNow(h)).catch(() => live && setNow(null));
    return () => {
      live = false;
    };
  }, [sources]);

  useEffect(() => {
    if (mode === "off") return setLoading(false);
    let live = true;
    setLoading(true);
    (async () => {
      try {
        if (mode === "cloud" && orgId) {
          const r = await api<{ history: Entry[]; members: MemberInfo[]; me: MemberInfo | null; can_approve: boolean }>(`/api/orgs/${orgId}/approvals${base ? `?feature=${encodeURIComponent(base)}` : ""}`);
          if (!live) return;
          setRemote(r.history);
          setMembers(r.members);
          setMe(r.me ? { name: r.me.name, id: r.me.id, can: r.can_approve } : null);
        } else if (mode === "demo") {
          const r = await fetch("/samples/approvals.json", { headers: { Accept: "application/json" } });
          const j = r.ok ? await r.json() : null;
          if (live && j) setSeed({ entries: (j.entries as Entry[]).map((e) => ({ ...e, demo: true })), members: j.members, me: j.me });
        } else {
          const tok = storage.get(TOKEN_KEY);
          const h: HeadersInit = tok ? { Authorization: `Bearer ${tok}` } : {};
          const [hist, mem, who, ver] = await Promise.all([
            json<{ history: Entry[] }>(feature ? `/api/approvals?feature=${encodeURIComponent(feature)}` : "/api/approvals"),
            json<MemberInfo[]>("/api/members"),
            json<{ authenticated: boolean; member: { id: string; name: string } | null; can_approve: boolean; members_configured: boolean }>("/api/me", { headers: h }),
            json<{ ok: boolean; broken_at: string | null; reason: string }>("/api/approvals/verify"),
          ]);
          if (!live) return;
          setRemote(hist.body.history ?? []);
          setChain(ver.ok && typeof ver.body.ok === "boolean" ? ver.body : null);
          setMembers(Array.isArray(mem.body) ? (mem.body as unknown as MemberInfo[]) : []);
          setConfigured(who.body.members_configured);
          setMe(who.body.authenticated && who.body.member ? { ...who.body.member, can: who.body.can_approve } : null);
        }
      } catch {
        /* leave empty: the panel degrades to "no history" */
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [mode, feature, base, orgId, tick]);

  const history = useMemo(() => {
    const all = mode === "demo" ? [...local, ...(seed?.entries ?? [])] : remote;
    return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id.localeCompare(a.id))).filter((e) => !base || e.feature === base);
  }, [mode, local, seed, remote, base]);

  const st = useMemo(() => (base ? status(history, base, now) : null), [history, base, now]);
  const demoMe = seed ? seed.members.find((m) => m.id === seed.me) ?? null : null;

  const setToken = useCallback(async (t: string) => {
    storage.set(TOKEN_KEY, t.trim());
    setTick((x) => x + 1);
    const r = await json<{ authenticated: boolean }>("/api/me", { headers: { Authorization: `Bearer ${t.trim()}` } });
    return !!r.body.authenticated;
  }, []);

  const submit = useCallback(
    async (req: Request): Promise<string | null> => {
      if (!feature) return "feature";
      if (mode === "demo") {
        if (!demoMe || !now) return "demo";
        const entry: Entry = {
          id: `local_${Date.now()}`, feature, decision: req.decision, reason: req.reason.trim(), conditions: req.conditions, delegate_to: req.delegate_to,
          override: req.override, by: { id: demoMe.id, name: demoMe.name, role: demoMe.role, via: "demo" }, at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
          spec_hash: "", files: now, verdict: "", open: { decision: 0, team: 0, blockers: 0 }, demo: true,
        };
        const next = [entry, ...local];
        storage.set(DEMO_KEY, JSON.stringify(next));
        setLocal(next);
        activation.markDone("decide");
        return null;
      }
      if (mode === "cloud" && orgId) {
        if (!now) return "demo";
        try {
          await api(`/api/orgs/${orgId}/approvals`, { body: { feature, files: now, ...req } });
        } catch (e) {
          return e instanceof ApiError ? e.detail : String(e);
        }
        setTick((x) => x + 1);
        activation.markDone("decide");
        return null;
      }
      const tok = storage.get(TOKEN_KEY) ?? "";
      const r = await json<{ entry: Entry }>("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ feature, ...req }),
      });
      if (!r.ok) return r.body.error ?? `HTTP ${r.status}`;
      setTick((x) => x + 1);
      activation.markDone("decide");
      return null;
    },
    [feature, mode, demoMe, now, local, orgId],
  );

  return {
    mode, loading, status: st, history, chain: mode === "server" ? chain : null,
    members: mode === "demo" ? (seed?.members ?? []) : members,
    me: mode === "demo" ? demoMe : me,
    canApprove: mode === "demo" ? !!demoMe : !!me?.can,
    needsToken: mode === "server" && !me && members_configured,
    setToken, submit,
  };
}
