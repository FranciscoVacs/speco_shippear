// Spec 020 in cloud mode: the agent talks to the company's assistant in the service. Each turn is charged to the company's credits there,
// so a refusal arrives as a plain answer ({code: no_credits | daily_cap | budget}) that the chat shows in words.
import { setChatTransport } from "../assistant/chat";
import type { AssistantInfo } from "../types";
import { api } from "./api";
import { accessToken } from "./auth";
import { CLOUD } from "./config";
import { currentTenant, getSession } from "../shell/session";

/** Asks the service whether it has a model. null when the person is not signed in or the service is unreachable. */
export async function cloudAssistantInfo(): Promise<AssistantInfo | null> {
  try {
    const a = await api<Partial<AssistantInfo>>("/api/assistant");
    if (a.available !== true) return null;
    return { available: true, provider: a.provider ?? null, model: a.model ?? null, demo: false, ...(Array.isArray(a.models) ? { models: a.models } : {}) };
  } catch {
    return null;
  }
}

/**
 * Sends the conversation to the current company's assistant. The feature and the focus the chat knows are the ones of the demo pages,
 * which are not this company's: the assistant answers from what the company really has waiting for a decision.
 */
export function installCloudAssistant(): void {
  setChatTransport(async (req) => {
    const token = await accessToken();
    if (!token) throw new Error("not signed in");
    const org = currentTenant(getSession());
    return { url: `${CLOUD.url}/api/orgs/${org.id}/assistant`, headers: { Authorization: `Bearer ${token}` }, body: { messages: req.messages, ...(req.model ? { model: req.model, effort: req.effort } : {}) } };
  });
}
