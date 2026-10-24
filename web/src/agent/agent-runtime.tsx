// The heavy part of the agent, loaded lazily on the first interaction (and prefetched when the browser is idle):
// the assistant-ui runtime, the two engines and the thread UI. Mounted ONCE above the router by AgentProvider, so the
// conversation survives route changes and panel collapses (FR-005, FR-007). The thread is portaled into whichever slot
// (home page or side panel) is on screen.
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AssistantRuntimeProvider, useAui, useAuiState, useLocalRuntime } from "@assistant-ui/react";
import { createAgentAdapter } from "./adapter";
import { ThreadView } from "./ThreadView";
import { attachApi, syncThread, useAgent } from "./store";
import type { Variant } from "./types";

/** Connects the runtime to the light store: send/stop/reset in one direction, "started" and "running" in the other. */
function Bridge() {
  const aui = useAui();
  const isEmpty = useAuiState((s) => s.thread.isEmpty);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  useEffect(() => {
    attachApi({
      append: (text) => aui.thread().append(text),
      cancel: () => aui.thread().cancelRun(),
      reset: () => aui.thread().reset(),
    });
    return () => attachApi(null);
  }, [aui]);
  useEffect(() => {
    syncThread(isEmpty, isRunning);
  }, [isEmpty, isRunning]);
  return null;
}

export function AgentRuntimeHost() {
  const adapter = useMemo(createAgentAdapter, []);
  const runtime = useLocalRuntime(adapter);
  const mounts = useAgent((s) => s.mounts);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Bridge />
      {(["home", "panel"] as Variant[]).map((v) => {
        const el = mounts[v];
        return el ? createPortal(<ThreadView variant={v} />, el, v) : null;
      })}
    </AssistantRuntimeProvider>
  );
}
