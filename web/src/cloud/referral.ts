// Spec 021: the code in a link is kept for 30 days through the sign-up and handed to the service right after the first sign-in,
// before the person creates a company (the service only records a referral for an account that is still new).
import { api } from "./api";
import { storage } from "../shell/storage";

const KEY = "sr-referral";
const KEEP_MS = 30 * 24 * 3600 * 1000;
const CODE = /^[A-Za-z0-9]{6,40}$/;

export function rememberReferral(code: string): boolean {
  if (!CODE.test(code)) return false;
  storage.set(KEY, JSON.stringify({ code, at: Date.now() }));
  return true;
}

export function pendingReferral(now = Date.now()): string | null {
  const raw = storage.get(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (typeof v.code === "string" && CODE.test(v.code) && typeof v.at === "number" && now - v.at < KEEP_MS) return v.code;
  } catch {
    /* fall through: a damaged value is dropped */
  }
  storage.remove(KEY);
  return null;
}

/** Tells the service about the kept code, once. The service decides whether it counts; either way the code is dropped. A network failure keeps it. */
export async function claimPendingReferral(): Promise<void> {
  const code = pendingReferral();
  if (!code) return;
  try {
    await api<{ recorded: boolean }>("/api/referrals/claim", { body: { code } });
    storage.remove(KEY);
  } catch {
    /* kept for the next time */
  }
}

export const referralLink = (code: string): string => `${window.location.origin}/r/${code}`;
