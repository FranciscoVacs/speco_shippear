// Lightweight pieces of the agent UI (part of the first-view bundle): composer, engine badge, suggestion chips, the
// place where the thread is rendered. The thread itself (assistant-ui) is portaled into `ThreadArea` from the lazy runtime.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Info, Square, X } from "lucide-react";
import { useT } from "../i18n";
import { CodeBlock } from "../CodeBlock";
import { ComposerBar } from "./composerBar";
import { agent, useAgent } from "./store";
import type { Variant } from "./types";

// ---------------------------------------------------------------- composer
export function Composer({ variant, placeholder }: { variant: Variant; placeholder: string }) {
  const t = useT();
  const id = useId();
  const text = useAgent((s) => s.text);
  const busy = useAgent((s) => s.running || s.queued != null);
  const focusReq = useAgent((s) => s.focusReq);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, variant === "home" ? 220 : 160) + "px";
  }, [text, variant]);

  // after "Preguntar al asistente": the cursor goes to the end of the prefilled question
  useEffect(() => {
    if (!focusReq) return;
    const el = ref.current;
    if (el) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
    agent.clearFocusReq();
  }, [focusReq]);

  return (
    <form
      className={"ag-composer ag-composer-" + variant}
      onSubmit={(e) => {
        e.preventDefault();
        agent.send();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t("agent.composer.label")}
      </label>
      <textarea
        id={id}
        ref={ref}
        className="ag-input"
        data-testid="agent-composer"
        rows={variant === "home" ? 2 : 1}
        value={text}
        placeholder={placeholder}
        aria-describedby={id + "-hint"}
        onChange={(e) => agent.setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            agent.send();
          } else if (e.key === "Escape" && busy) {
            e.preventDefault();
            agent.stop();
          }
        }}
      />
      <ComposerBar variant={variant}>
        {busy ? (
          <button type="button" className="ag-send ag-stop" data-testid="agent-stop" onClick={() => agent.stop()} aria-label={t("agent.stop")} title={t("agent.stop")}>
            <Square size={14} aria-hidden="true" fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="ag-send" data-testid="agent-send" disabled={!text.trim()} aria-label={t("agent.send")} title={t("agent.send")}>
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </ComposerBar>
      <span id={id + "-hint"} className="sr-only">
        {t("agent.hint")}
      </span>
    </form>
  );
}

// ---------------------------------------------------------------- engine badge (FR-018, FR-019)
export function EngineBadge({ variant }: { variant: Variant }) {
  const t = useT();
  const engine = useAgent((s) => s.engine);
  const info = useAgent((s) => s.info);
  const [open, setOpen] = useState(false);
  const id = useId();
  if (engine === "pending") return null;
  if (engine === "backend" && info) {
    if (info.demo)
      return (
        <p className={"ag-badge ag-badge-demo ag-badge-" + variant} data-testid="agent-badge" data-engine="backend-demo" role="status">
          <span className="ag-tag" aria-hidden="true">DEMO</span> {t("agent.badge.demoModel")}
        </p>
      );
    return (
      <p className={"ag-badge ag-badge-model ag-badge-" + variant} data-testid="agent-badge" data-engine="backend" title={t("agent.sendsData")}>
        {t("agent.badge.model", { provider: info.provider ?? "model", model: info.model ?? "" })}
      </p>
    );
  }
  return (
    <div
      className={"ag-badge-wrap ag-badge-" + variant}
      data-testid="agent-badge"
      data-engine="demo"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button type="button" className="ag-badge ag-badge-demo ag-badge-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Info size={13} aria-hidden="true" /> {t("agent.badge.demo")}
      </button>
      {open && (
        <div id={id} className="ag-badge-pop">
          <p>{t("agent.badge.explain")}</p>
          <p>{t("agent.badge.how")}</p>
          <CodeBlock code="specreview <repo> --serve --llm anthropic" caption="terminal" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- suggestion chips
export interface ChipItem {
  label: string;
  /** text sent when it differs from the label */
  prompt?: string;
}
export function Chips({ items }: { items: ChipItem[] }) {
  const t = useT();
  return (
    <ul className="ag-chips" aria-label={t("agent.suggested")}>
      {items.map((c) => (
        <li key={c.label}>
          <button type="button" className="ag-chip" data-testid="agent-chip" onClick={() => agent.send(c.prompt ?? c.label)}>
            {c.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Same footprint as the chips while the feature list loads, so the first chip never moves under the pointer. */
export function ChipsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <ul className="ag-chips ag-chips-skel" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <span className="ag-chip sk" />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the finding the next question is about
export function FocusChip() {
  const t = useT();
  const focus = useAgent((s) => s.focus);
  if (!focus) return null;
  return (
    <p className="ag-focus" data-testid="agent-focus">
      <span>
        {t("agent.focus.about")} <code>{focus.rule}</code>
        {focus.ids.map((i) => (
          <code key={i} className="chip">
            {i}
          </code>
        ))}
      </span>
      <button type="button" className="ag-x" onClick={() => agent.setFocus(null)} aria-label={t("agent.focus.remove")} title={t("agent.focus.remove")}>
        <X size={13} aria-hidden="true" />
      </button>
    </p>
  );
}

// ---------------------------------------------------------------- where the thread lives
/** Placeholder with the same layout as the thread while the runtime chunk loads: the user's message and a typing line. */
function PendingThread() {
  const t = useT();
  const queued = useAgent((s) => s.queued);
  return (
    <div className="ag-viewport" aria-busy="true">
      <div className="ag-msgs">
        {queued && (
          <div className="ag-msg ag-msg-user">
            <p className="ag-msg-role">{t("agent.role.you")}</p>
            <div className="ag-msg-body">
              <p className="ag-plain">{queued}</p>
            </div>
          </div>
        )}
        <div className="ag-msg ag-msg-assistant" role="status">
          <p className="ag-msg-role">{t("agent.role.assistant")}</p>
          <div className="ag-msg-body">
            <p className="muted ag-typing">{t("agent.loading")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThreadArea({ variant }: { variant: Variant }) {
  const shown = useAgent((s) => s.shown[variant]);
  const setMount = useCallback((el: HTMLDivElement | null) => agent.setMount(variant, el), [variant]);
  return (
    <>
      {!shown && <PendingThread />}
      <div className="ag-mount" ref={setMount} data-testid={"agent-thread-" + variant} />
    </>
  );
}
