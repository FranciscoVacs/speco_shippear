// Engine 2 (FR-019): the local server with a model. The streaming adapter is the one of the previous UI (src/assistant/chat.ts):
// POST /api/chat over SSE, now fed by the shared conversation store.
import type { ChatModelAdapter } from "@assistant-ui/react";
import { createChatAdapter } from "../assistant/chat";
import { applyStatus, isRefusal, markRefusal } from "../cloud/creditsStore";
import { cloudEnabled } from "../cloud/config";
import { agent, effectiveFeature, env, getAgentState, selectedModel } from "./store";

export function createBackendAdapter(): ChatModelAdapter {
  return createChatAdapter({
    // the server needs a feature: the page's, the one picked on the home page, or simply the first
    getFeature: () => effectiveFeature() ?? env.loader?.features[0]?.id ?? "",
    getFocus: () => getAgentState().focus,
    // only a server that advertised models gets a choice; the effort is dropped for a model without that setting
    getChoice: () => {
      const s = getAgentState();
      const m = s.info?.models?.length ? selectedModel(s) : null;
      return m ? { model: m.id, ...(m.efforts?.includes(s.effort) ? { effort: s.effort } : {}) } : null;
    },
    onSuccess: () => agent.spendFocus(),
    ...(cloudEnabled() ? { onCredits: applyStatus, onRefusal: (code: string) => isRefusal(code) && markRefusal(code) } : {}),
  });
}
