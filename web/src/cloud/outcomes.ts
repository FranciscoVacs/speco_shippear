// Spec 025: "would this have reached code without Speco?". Asked about one fixed problem at a time, at most once a day in this browser;
// closing the card hides it for three days. A question must never get in the way, so every failure is silent.
import { api } from "./api";
import { storage } from "../shell/storage";

const QUIET_KEY = "sr-outcome-quiet";
const AFTER_ANSWER_MS = 24 * 3600 * 1000;
const AFTER_CLOSE_MS = 3 * 24 * 3600 * 1000;
export type Answer = "yes" | "probably" | "no";
export type Pending = { feature_id: string; fingerprint: string; rule: string; severity: string; message: string };

export const quiet = (now = Date.now()): boolean => Number(storage.get(QUIET_KEY) ?? 0) > now;
export const quietFor = (ms: number, now = Date.now()): void => storage.set(QUIET_KEY, String(now + ms));
export const afterAnswer = (): void => quietFor(AFTER_ANSWER_MS);
export const afterClose = (): void => quietFor(AFTER_CLOSE_MS);

export async function nextPending(orgId: string): Promise<Pending | null> {
  if (quiet()) return null;
  try {
    return (await api<Pending[]>(`/api/orgs/${orgId}/resolved-findings/pending`))[0] ?? null;
  } catch {
    return null;
  }
}

export async function sendOutcome(orgId: string, p: Pending, answer: Answer): Promise<boolean> {
  try {
    await api(`/api/orgs/${orgId}/resolved-findings/${p.fingerprint}/outcome`, { body: { feature_id: p.feature_id, answer } });
    return true;
  } catch {
    return false;
  }
}
