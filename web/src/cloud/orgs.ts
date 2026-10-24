// The signed-in person's companies, as the service reports them (RLS: only their own). They fill the workspace switcher.
import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api";
import { storage } from "../shell/storage";
import type { Plan, Tenant } from "../shell/session";

export interface CloudOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role?: string;
}
export interface OrgsState {
  status: "idle" | "loading" | "ready" | "error";
  orgs: CloudOrg[];
  error: string | null;
}

const ORG_KEY = "sr-org";
let state: OrgsState = { status: "idle", orgs: [], error: null };
const subs = new Set<() => void>();
const set = (s: OrgsState) => {
  state = s;
  subs.forEach((f) => f());
};

export const useOrgs = (): OrgsState => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state, () => state);

export async function loadOrgs(): Promise<void> {
  set({ ...state, status: "loading", error: null });
  try {
    set({ status: "ready", orgs: await api<CloudOrg[]>("/api/orgs"), error: null });
  } catch (e) {
    set({ status: "error", orgs: [], error: e instanceof ApiError ? e.detail : String(e) });
  }
}

/** Reads the companies again without the loading state, so what is on screen stays (the plan of a company changed, spec 024). */
export async function refreshOrgs(): Promise<void> {
  try {
    set({ status: "ready", orgs: await api<CloudOrg[]>("/api/orgs"), error: null });
  } catch {
    /* keep what is shown: the next load says it if the service is really down */
  }
}

/** -> the new company's id, or a message that says why not (a taken or invalid slug) */
export async function createOrg(name: string, slug: string): Promise<{ id: string } | { error: string }> {
  try {
    const r = await api<{ id: string }>("/api/orgs", { body: { name, slug } });
    await loadOrgs();
    rememberOrg(r.id);
    return r;
  } catch (e) {
    return { error: e instanceof ApiError ? e.detail : String(e) };
  }
}

export const slugify = (name: string): string => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39);

/** A link from a pull request names the company it is about (`?org=`). It is kept for this tab only, through the sign-in, and used once the person's companies are known. */
const HINT = "sr-org-hint";
export function captureOrgHint(): void {
  try {
    const o = new URLSearchParams(window.location.search).get("org");
    if (o && /^[0-9a-f-]{36}$/i.test(o)) window.sessionStorage.setItem(HINT, o.toLowerCase());
  } catch {
    /* storage blocked: the person lands on the company they last used */
  }
}
export function takeOrgHint(): string | null {
  try {
    const o = window.sessionStorage.getItem(HINT);
    window.sessionStorage.removeItem(HINT);
    return o;
  } catch {
    return null;
  }
}
export const rememberOrg = (id: string) => storage.set(ORG_KEY, id);
export const rememberedOrg = (): string | null => storage.get(ORG_KEY);

const PLANS: Record<string, Plan> = { hobby: "Hobby", pro: "Pro", team: "Team" };
export const toTenant = (o: CloudOrg): Tenant => ({ id: o.id, name: o.name, slug: o.slug, plan: PLANS[o.plan] ?? "Hobby", usage: { reviews: 0, messages: 0 } });
