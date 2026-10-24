// SIMULATED session: user, workspaces, members, API keys, notifications. Everything is demo data and lives in the
// browser (localStorage, guarded): nothing leaves the page (FR-014).
import { useSyncExternalStore } from "react";
import { readJSON, storage } from "./storage";
import { cloudEnabled } from "../cloud/config";

export type Plan = "Hobby" | "Pro" | "Team";
export type Role = "owner" | "admin" | "member" | "viewer";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  /** demo consumption for the current period */
  usage: { reviews: number; messages: number };
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
}
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdDaysAgo: number;
  /** minutes since last use; null = never used */
  lastUsedMin: number | null;
  revoked: boolean;
}
export type NotifKind = "review_done" | "member_joined" | "key_created" | "usage_80" | "integration" | "invite_sent" | "plan_renewal";
export interface Notif {
  id: string;
  kind: NotifKind;
  vars: Record<string, string | number>;
  minutesAgo: number;
  read: boolean;
  href: string;
}
export type NotifEvent = "reviews" | "members" | "usage" | "news";
export type NotifChannel = "inapp" | "email" | "slack";
export type IntegrationId = "github" | "slack" | "jira" | "linear";

export interface SessionState {
  signedIn: boolean;
  user: { name: string; email: string };
  tenants: Tenant[];
  tenantId: string;
  members: Member[];
  apiKeys: ApiKey[];
  notifications: Notif[];
  notifPrefs: Record<NotifEvent, Record<NotifChannel, boolean>>;
  integrations: Record<IntegrationId, { connected: boolean; account: string }>;
  promoDismissed: boolean;
}

const KEY = "sr-session-bello-v1";

export const PLAN_LIMITS: Record<Plan, { reviews: number; messages: number; seats: number; price: number }> = {
  Hobby: { reviews: 50, messages: 100, seats: 1, price: 0 },
  Pro: { reviews: 500, messages: 2000, seats: 10, price: 29 },
  Team: { reviews: 2000, messages: 10000, seats: 50, price: 99 },
};

export const DEMO_REPOS = ["bello/app", "bello/web", "bello/payments-api", "bello/core-ledger", "bello/risk-engine", "bello/onboarding", "bello/cards", "bello/reporting"] as const;

function defaults(): SessionState {
  return {
    signedIn: true,
    user: { name: "Lucía Fernández", email: "lucia.fernandez@bello.com.ar" },
    tenants: [
      { id: "bello", name: "Belo", slug: "bello", plan: "Team", usage: { reviews: 418, messages: 3120 } },
      { id: "bello-sandbox", name: "Belo · Sandbox", slug: "bello-sandbox", plan: "Pro", usage: { reviews: 52, messages: 240 } },
    ],
    tenantId: "bello",
    members: [
      { id: "m1", name: "Lucía Fernández", email: "lucia.fernandez@bello.com.ar", role: "owner", status: "active" },
      { id: "m2", name: "Martín Sosa", email: "martin.sosa@bello.com.ar", role: "admin", status: "active" },
      { id: "m3", name: "Valentina Ruiz", email: "valentina.ruiz@bello.com.ar", role: "member", status: "active" },
      { id: "m4", name: "Diego Paz", email: "diego.paz@bello.com.ar", role: "member", status: "active" },
      { id: "m5", name: "Carla Méndez", email: "carla.mendez@bello.com.ar", role: "viewer", status: "active" },
      { id: "m6", name: "Tomás Ibarra", email: "tomas.ibarra@bello.com.ar", role: "member", status: "invited" },
    ],
    apiKeys: [
      { id: "k1", name: "CI pipeline", prefix: "sr_live_7fa2", createdDaysAgo: 42, lastUsedMin: 18, revoked: false },
      { id: "k2", name: "Local scripts", prefix: "sr_live_c91d", createdDaysAgo: 120, lastUsedMin: 60 * 24 * 6, revoked: false },
      { id: "k3", name: "Staging", prefix: "sr_test_03be", createdDaysAgo: 9, lastUsedMin: null, revoked: false },
    ],
    notifications: [
      { id: "n1", kind: "review_done", vars: { feature: "BEL-102 · Transferencias", n: 6 }, minutesAgo: 12, read: false, href: "/specs?req=BEL-102" },
      { id: "n2", kind: "member_joined", vars: { name: "Diego Paz" }, minutesAgo: 55, read: false, href: "/settings/members" },
      { id: "n3", kind: "key_created", vars: { name: "CI pipeline" }, minutesAgo: 190, read: false, href: "/settings/api-keys" },
      { id: "n4", kind: "usage_80", vars: { pct: 80 }, minutesAgo: 300, read: false, href: "/settings/usage" },
      { id: "n5", kind: "review_done", vars: { feature: "BEL-101 · Onboarding", n: 4 }, minutesAgo: 60 * 26, read: true, href: "/specs?req=BEL-101" },
      { id: "n6", kind: "integration", vars: { name: "GitHub" }, minutesAgo: 60 * 50, read: true, href: "/settings/integrations" },
      { id: "n7", kind: "invite_sent", vars: { name: "Tomás Ibarra" }, minutesAgo: 60 * 72, read: true, href: "/settings/members" },
      { id: "n8", kind: "plan_renewal", vars: { plan: "Team" }, minutesAgo: 60 * 24 * 5, read: true, href: "/settings/usage" },
    ],
    notifPrefs: {
      reviews: { inapp: true, email: true, slack: false },
      members: { inapp: true, email: false, slack: false },
      usage: { inapp: true, email: true, slack: false },
      news: { inapp: false, email: false, slack: false },
    },
    integrations: {
      github: { connected: true, account: "bello" },
      slack: { connected: false, account: "" },
      jira: { connected: false, account: "" },
      linear: { connected: false, account: "" },
    },
    promoDismissed: false,
  };
}

function load(): SessionState {
  const base = defaults();
  const saved = readJSON<Partial<SessionState>>(KEY);
  if (!saved || typeof saved !== "object") return base;
  return {
    ...base,
    ...saved,
    // never trust partial shapes from storage
    user: { ...base.user, ...(saved.user ?? {}) },
    tenants: Array.isArray(saved.tenants) && saved.tenants.length ? saved.tenants : base.tenants,
    members: Array.isArray(saved.members) ? saved.members : base.members,
    apiKeys: Array.isArray(saved.apiKeys) ? saved.apiKeys : base.apiKeys,
    notifications: Array.isArray(saved.notifications) ? saved.notifications : base.notifications,
    notifPrefs: { ...base.notifPrefs, ...(saved.notifPrefs ?? {}) },
    integrations: { ...base.integrations, ...(saved.integrations ?? {}) },
  };
}

// in cloud mode the session holds a real person and their real companies: it is never written to the browser's storage
const persist = !cloudEnabled();
let state: SessionState = persist ? load() : { ...defaults(), signedIn: false };
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  if (persist) storage.set(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}
const patch = (p: Partial<SessionState>) => set({ ...state, ...p });

export const getSession = () => state;
export function useSession(): SessionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
export const currentTenant = (s: SessionState): Tenant => s.tenants.find((t) => t.id === s.tenantId) ?? s.tenants[0];
export const unreadCount = (s: SessionState) => s.notifications.filter((n) => !n.read).length;

let seq = 100;
const uid = (p: string) => `${p}${++seq}${Math.random().toString(36).slice(2, 6)}`;

/** Fake secret shown once when a key is created. Not a real credential. */
function fakeSecret(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "sr_live_";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** cloud mode: fill the simulated session with the signed-in person and the companies the service reports */
export function hydrateCloud(user: { name: string; email: string }, tenants: Tenant[], tenantId: string | null) {
  patch({ signedIn: true, user, tenants, tenantId: tenantId && tenants.some((t) => t.id === tenantId) ? tenantId : tenants[0]?.id ?? state.tenantId });
}

export const session = {
  signOut: () => patch({ signedIn: false }),
  signIn: () => patch({ signedIn: true }),
  switchTenant: (id: string) => state.tenants.some((t) => t.id === id) && patch({ tenantId: id }),
  createTenant(name: string): Tenant {
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    const t: Tenant = { id: uid("t"), name: name.trim(), slug, plan: "Hobby", usage: { reviews: 0, messages: 0 } };
    patch({ tenants: [...state.tenants, t], tenantId: t.id });
    return t;
  },
  updateTenant: (id: string, p: Partial<Pick<Tenant, "name" | "slug">>) =>
    patch({ tenants: state.tenants.map((t) => (t.id === id ? { ...t, ...p } : t)) }),
  updateUser: (p: Partial<SessionState["user"]>) => patch({ user: { ...state.user, ...p } }),
  markRead: (id: string) => patch({ notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),
  markAllRead: () => patch({ notifications: state.notifications.map((n) => ({ ...n, read: true })) }),
  pushNotification(n: Omit<Notif, "id" | "read" | "minutesAgo">) {
    patch({ notifications: [{ ...n, id: uid("n"), read: false, minutesAgo: 0 }, ...state.notifications] });
  },
  setNotifPref: (ev: NotifEvent, ch: NotifChannel, on: boolean) =>
    patch({ notifPrefs: { ...state.notifPrefs, [ev]: { ...state.notifPrefs[ev], [ch]: on } } }),
  inviteMember(email: string, role: Role) {
    const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    patch({ members: [...state.members, { id: uid("m"), name, email, role, status: "invited" }] });
  },
  setMemberRole: (id: string, role: Role) => patch({ members: state.members.map((m) => (m.id === id ? { ...m, role } : m)) }),
  removeMember: (id: string) => patch({ members: state.members.filter((m) => m.id !== id) }),
  createApiKey(name: string): { key: ApiKey; secret: string } {
    const secret = fakeSecret();
    const key: ApiKey = { id: uid("k"), name: name.trim(), prefix: secret.slice(0, 12), createdDaysAgo: 0, lastUsedMin: null, revoked: false };
    patch({ apiKeys: [key, ...state.apiKeys] });
    return { key, secret };
  },
  revokeApiKey: (id: string) => patch({ apiKeys: state.apiKeys.map((k) => (k.id === id ? { ...k, revoked: true } : k)) }),
  setIntegration: (id: IntegrationId, connected: boolean) =>
    patch({
      integrations: { ...state.integrations, [id]: { connected, account: connected ? (id === "github" ? "bello" : "bello") : "" } },
    }),
  dismissPromo: () => patch({ promoDismissed: true }),
  /** only for tests / "reset demo" */
  reset: () => set(defaults()),
};
