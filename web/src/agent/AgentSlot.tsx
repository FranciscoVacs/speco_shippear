// The agent UI mounted by the shell in two places (stage 1 contract, unchanged):
//   - variant="home":  the whole page at "/"                       (FR-001, FR-002)
//   - variant="panel": the body of the right-hand panel, which the shell wraps with its own header/collapse button;
//                      `context` is the page the panel sits on (FR-004..FR-007)
// Both render the SAME conversation (src/agent/store.ts). Everything here is light; assistant-ui loads on first use.
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../DataContext";
import { HomeChat, worstFeature } from "./HomeChat";
import { SidePanel } from "./SidePanel";
import { env, useAgent } from "./store";
import type { AgentContext, Variant } from "./types";

export type { AgentContext, AgentPage } from "./types";

export interface AgentSlotProps {
  variant: Variant;
  context?: AgentContext;
}

export function AgentSlot({ variant, context }: AgentSlotProps) {
  const ctx: AgentContext = context ?? { page: "home" };
  const nav = useNavigate();
  const { loader, error } = useData();
  const started = useAgent((s) => s.started);
  const worst = useMemo(() => worstFeature(loader?.features ?? []), [loader]);

  // the engine reads the page at send time, never from React state
  env.ctx = { page: ctx.page, featureId: ctx.featureId ?? null, ruleId: ctx.ruleId ?? null };
  useEffect(() => {
    env.navigate = (to) => void nav(to);
  }, [nav]);

  return (
    <div
      className={`agent-slot ag ag-${variant}` + (started ? " is-chat" : " is-empty")}
      data-agent-variant={variant}
      data-agent-page={ctx.page}
      data-agent-feature={ctx.featureId ?? undefined}
    >
      {variant === "home" ? <HomeChat /> : <SidePanel context={ctx} worst={worst} ready={!!loader || !!error} />}
    </div>
  );
}
