// Sign-in with Supabase. The library keeps the session (and refreshes it) in its own storage; this module only reads it (NFR-002).
// It is imported on demand, so a build without cloud settings never ships it (NFR-001).
import { useSyncExternalStore } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { CLOUD, cloudEnabled } from "./config";

export interface CloudUser {
  id: string;
  email: string;
  name: string;
}
export interface AuthState {
  status: "loading" | "out" | "in";
  user: CloudUser | null;
}

/** the library's own storage key, fixed here instead of derived from the project host, so signing out can always clear it */
export const AUTH_STORAGE_KEY = "sb-speco-auth-token";

let client: Promise<SupabaseClient> | null = null;
export function supabase(): Promise<SupabaseClient> {
  if (!__CLOUD_BUILD__) return Promise.reject(new Error("this build has no cloud settings"));        // the import below is dropped from such builds
  client ??= import("@supabase/supabase-js").then((m) => m.createClient(CLOUD.supabaseUrl, CLOUD.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY } }));
  return client;
}

let state: AuthState = { status: cloudEnabled() ? "loading" : "out", user: null };
const subs = new Set<() => void>();
const set = (s: AuthState) => {
  state = s;
  subs.forEach((f) => f());
};

function fromSession(s: Session | null): AuthState {
  if (!s) return { status: "out", user: null };
  const u = s.user;
  const email = u.email ?? "";
  const name = (u.user_metadata?.full_name as string | undefined) ?? (u.user_metadata?.name as string | undefined) ?? email.split("@")[0] ?? "";
  return { status: "in", user: { id: u.id, email, name } };
}

// a failed OAuth round trip comes back as ?error_description=… (or in the hash). Anyone can link to that address with a text of their
// choosing, so it is shown only when this tab started a sign-in, and then dropped from the address.
const SIGNIN_STARTED = "speco-signin-started";
let signInError = "";
function readSignInError(): string {
  const params = [new URLSearchParams(window.location.search), new URLSearchParams(window.location.hash.slice(1))];
  const text = params.map((p) => p.get("error_description") ?? p.get("error") ?? "").find(Boolean) ?? "";
  if (!text) return "";
  let started = false;
  try {
    started = sessionStorage.getItem(SIGNIN_STARTED) === "1";
    sessionStorage.removeItem(SIGNIN_STARTED);
  } catch {
    /* storage unavailable: nothing proves this tab started it */
  }
  window.history.replaceState(null, "", window.location.pathname);
  return started ? text.slice(0, 200) : "";
}
/** why the last sign-in failed, as the provider said it; empty when it did not */
export const lastSignInError = (): string => signInError;

let started = false;
export function startAuth(): void {
  if (started || !cloudEnabled()) return;
  started = true;
  signInError = readSignInError();
  supabase()
    .then(async (sb) => {
      sb.auth.onAuthStateChange((_event, session) => set(fromSession(session)));
      const { data } = await sb.auth.getSession();
      set(fromSession(data.session));
    })
    .catch(() => set({ status: "out", user: null }));
}

export const useAuth = (): AuthState => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state, () => state);

/** GitHub's token for the person, present only right after a GitHub sign-in (see github.ts) */
export async function githubToken(): Promise<string | null> {
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.provider_token ?? null;
}

export async function accessToken(): Promise<string | null> {
  const { data } = await (await supabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signInWithGitHub(): Promise<void> {
  signInError = "";
  try {
    sessionStorage.setItem(SIGNIN_STARTED, "1");
  } catch {
    /* storage unavailable: a failure will not be explained, the sign-in still works */
  }
  const sb = await supabase();
  await sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.origin + "/" } });
}

/** -> an error message, or null when the link was sent */
export async function signInWithEmail(email: string): Promise<string | null> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/" } });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  set({ status: "out", user: null });                   // at once: screens must not see "signed in" while the library talks to Supabase
  try {
    const { error } = await (await supabase()).auth.signOut();
    if (error) throw error;
  } catch {
    // the library keeps the session when it cannot reach Supabase to revoke it; the person asked to leave, so forget it here regardless
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
    } catch {
      /* storage unavailable: nothing was stored */
    }
  }
}

/** the one sign-out the menus use: the library's session in cloud mode, the simulated one in the demo */
export async function signOutEverywhere(): Promise<void> {
  if (cloudEnabled()) await signOut();
}

// ---------------------------------------------------------------------------------------------- AI agents authorized through OAuth (spec 018)
export interface AuthorizationRequest {
  id: string;
  clientName: string;
  redirectUri: string;
  scopes: string[];
}
export type AuthorizationLookup = { kind: "ask"; request: AuthorizationRequest } | { kind: "redirect"; url: string } | { kind: "error"; message: string };

/** only an http(s) address is ever followed: a `javascript:` URL must not become a navigation */
const safeUrl = (u: string): string | null => {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : null;
  } catch {
    return null;
  }
};

export async function lookupAuthorization(id: string): Promise<AuthorizationLookup> {
  const { data, error } = await (await supabase()).auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return { kind: "error", message: error?.message ?? "not found" };
  if ("redirect_url" in data) {
    const url = safeUrl(data.redirect_url);
    return url ? { kind: "redirect", url } : { kind: "error", message: "unsafe redirect" };
  }
  return { kind: "ask", request: { id: data.authorization_id, clientName: data.client.name, redirectUri: data.redirect_uri, scopes: data.scope.split(/\s+/).filter(Boolean) } };
}

/** -> where to send the browser next (the client's callback, with the code or the refusal), or an error message */
export async function decideAuthorization(id: string, approve: boolean): Promise<{ url: string } | { error: string }> {
  const oauth = (await supabase()).auth.oauth;
  const { data, error } = approve ? await oauth.approveAuthorization(id) : await oauth.denyAuthorization(id);
  const url = data ? safeUrl(data.redirect_url) : null;
  return url ? { url } : { error: error?.message ?? "unsafe redirect" };
}

export interface Grant {
  clientId: string;
  clientName: string;
  scopes: string[];
  grantedAt: string;
}
export async function listGrants(): Promise<Grant[]> {
  const { data } = await (await supabase()).auth.oauth.listGrants();
  return (data ?? []).map((g) => ({ clientId: g.client.id, clientName: g.client.name, scopes: g.scopes, grantedAt: g.granted_at }));
}
export async function revokeGrant(clientId: string): Promise<boolean> {
  const { error } = await (await supabase()).auth.oauth.revokeGrant({ clientId });
  return !error;
}

// ---------------------------------------------------------------------------------------------- "come back to where you were"
// A consent link (/oauth/consent?authorization_id=...) opened while signed out must survive the sign-in, which can leave the page (GitHub)
// or open in another tab (email link): localStorage with a short life. Only same-origin paths are ever followed.
const RETURN_KEY = "sr-return-to";
const RETURN_TTL_MS = 15 * 60 * 1000;
export function rememberReturnTo(path: string): void {
  if (!/^\/(?!\/)/.test(path) || path === "/" || path.startsWith("/signed-out")) return;
  try {
    localStorage.setItem(RETURN_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* storage unavailable: the person lands on Home and opens the link again */
  }
}
export function takeReturnTo(): string | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    localStorage.removeItem(RETURN_KEY);
    const v = raw ? (JSON.parse(raw) as { path: string; at: number }) : null;
    return v && Date.now() - v.at < RETURN_TTL_MS && /^\/(?!\/)/.test(v.path) ? v.path : null;
  } catch {
    return null;
  }
}
