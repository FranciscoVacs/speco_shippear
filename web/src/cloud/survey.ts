// Spec 022: the Sean Ellis question. The service says when it is time to ask; "later" hides it for two weeks in this browser.
import { api } from "./api";
import { storage } from "../shell/storage";

const SNOOZE_KEY = "sr-pmf-snooze";
const SNOOZE_MS = 14 * 24 * 3600 * 1000;
export type Disappointed = "very" | "somewhat" | "not" | "na";

export const snoozed = (now = Date.now()): boolean => Number(storage.get(SNOOZE_KEY) ?? 0) > now;
export const snooze = (now = Date.now()): void => storage.set(SNOOZE_KEY, String(now + SNOOZE_MS));

export async function surveyDue(orgId: string): Promise<boolean> {
  if (snoozed()) return false;
  try {
    return (await api<{ due: boolean }>(`/api/orgs/${orgId}/pmf-survey/due`)).due;
  } catch {
    return false;                                    // a question must never get in the way
  }
}

export async function sendSurvey(orgId: string, a: { disappointed: Disappointed; main_benefit: string; alternative: string }): Promise<boolean> {
  try {
    await api(`/api/orgs/${orgId}/pmf-survey`, { body: a });
    return true;
  } catch {
    return false;
  }
}
