// The conversation (lazy chunk): assistant-ui primitives for the thread, the messages, the tool cards and the per-message actions.
// The composer is NOT here: it is the light one of parts.tsx, so the first message never changes the layout.
import { useLayoutEffect } from "react";
import { ActionBarPrimitive, AuiIf, ErrorPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState, type TextMessagePartProps } from "@assistant-ui/react";
import { Markdown } from "../assistant/markdown";
import { useT } from "../i18n";
import { ToolPart } from "./cards";
import { Chips } from "./parts";
import { agent, useAgent } from "./store";
import type { Variant } from "./types";

const PlainText = ({ text }: TextMessagePartProps) => <p className="ag-plain">{text}</p>;
const MarkdownText = ({ text }: TextMessagePartProps) => <Markdown text={text} />;

function UserMessage() {
  const t = useT();
  return (
    <MessagePrimitive.Root className="ag-msg ag-msg-user">
      <p className="ag-msg-role">{t("agent.role.you")}</p>
      <div className="ag-msg-body">
        <MessagePrimitive.Parts components={{ Text: PlainText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

/** Follow-up prompts of the last answer (simulated engine): one click sends it. */
function FollowUps() {
  const items = useAuiState((s) => (s.message.metadata?.custom as { suggestions?: string[] } | undefined)?.suggestions);
  const last = useAuiState((s) => s.message.isLast);
  const running = useAuiState((s) => s.thread.isRunning);
  if (!last || running || !items?.length) return null;
  return <Chips items={items.map((label) => ({ label }))} />;
}

function AssistantMessage() {
  const t = useT();
  return (
    <MessagePrimitive.Root className="ag-msg ag-msg-assistant">
      <p className="ag-msg-role">{t("agent.role.assistant")}</p>
      <div className="ag-msg-body">
        <MessagePrimitive.Parts components={{ Text: MarkdownText, tools: { Override: ToolPart } }} />
        <AuiIf condition={(s) => s.message.status?.type === "running" && s.message.content.every((p) => p.type === "text" && p.text === "")}>
          <p className="muted ag-typing">{t("agent.typing")}</p>
        </AuiIf>
        <AuiIf condition={(s) => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled"}>
          <p className="muted ag-cancelled">{t("agent.cancelled")}</p>
        </AuiIf>
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="ag-error" role="alert">
            <strong>{t("agent.error")}</strong> <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
      </div>
      <ActionBarPrimitive.Root className="ag-actions" hideWhenRunning>
        <ActionBarPrimitive.Copy className="copy-btn">{t("agent.copy")}</ActionBarPrimitive.Copy>
        <AuiIf condition={(s) => s.message.isLast}>
          <ActionBarPrimitive.Reload className="copy-btn">
            <AuiIf condition={(s) => s.message.status?.type === "incomplete" && s.message.status.reason === "error"}>{t("agent.retry")}</AuiIf>
            <AuiIf condition={(s) => !(s.message.status?.type === "incomplete" && s.message.status.reason === "error")}>{t("agent.regenerate")}</AuiIf>
          </ActionBarPrimitive.Reload>
        </AuiIf>
      </ActionBarPrimitive.Root>
      <FollowUps />
    </MessagePrimitive.Root>
  );
}

export function ThreadView({ variant }: { variant: Variant }) {
  const t = useT();
  const running = useAgent((s) => s.running);
  // the slot shows a placeholder until this is on screen
  useLayoutEffect(() => {
    agent.setShown(variant, true);
    return () => agent.setShown(variant, false);
  }, [variant]);
  return (
    <ThreadPrimitive.Root className="ag-thread">
      {/* role="log" is a polite live region; aria-busy holds the announcements back while the answer streams */}
      <ThreadPrimitive.Viewport className="ag-viewport" role="log" aria-label={t("agent.thread")} aria-busy={running} tabIndex={-1}>
        <div className="ag-msgs">
          <ThreadPrimitive.Messages>{({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}</ThreadPrimitive.Messages>
        </div>
      </ThreadPrimitive.Viewport>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <p className="sr-only" role="status">
          {t("agent.responding")}
        </p>
      </AuiIf>
    </ThreadPrimitive.Root>
  );
}
