// One adapter, two engines (FR-018/FR-019). The engine is decided once at start (GET /api/assistant) and read at send time.
import type { ChatModelAdapter, ChatModelRunResult } from "@assistant-ui/react";
import { activation } from "../activation/store";
import { createBackendAdapter } from "./backendAgent";
import { createDemoAdapter } from "./demoAgent";
import { engineReady, getAgentState } from "./store";

export function createAgentAdapter(): ChatModelAdapter {
  const backend = createBackendAdapter();
  const demo = createDemoAdapter();
  return {
    async *run(opts) {
      activation.markDone("ask");
      await engineReady();
      const chosen = getAgentState().engine === "backend" ? backend : demo;
      yield* chosen.run(opts) as AsyncGenerator<ChatModelRunResult, void>;
    },
  };
}
