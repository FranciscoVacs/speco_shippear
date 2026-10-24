// The row under the composer text: what the question is about (repository, feature) on the left; which model answers and how hard it
// thinks on the right. Light on purpose (first-view bundle): small menus of our own, no assistant-ui here (see ThreadView).
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Brain, Check, ChevronDown, FolderGit2, Gauge } from "lucide-react";
import { useData } from "../DataContext";
import { useT } from "../i18n";
import type { Effort } from "../types";
import { agent, modelOptions, selectedModel, useAgent } from "./store";
import type { Variant } from "./types";

interface Option {
  value: string;
  label: string;
  hint?: string;
}

/** A button that opens a short list above it (the composer sits at the bottom). One choice, arrow keys, Escape and outside click close it. */
function Menu({ label, icon, value, options, onChange, testid, compact }: {
  label: string;
  icon: ReactNode;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  testid: string;
  /** show only the icon in narrow spaces; the value stays in the accessible name */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    // focus the chosen item so the arrows start from it
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const move = (e: React.KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? i + 1 : i - 1;
      items[(n + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  };

  if (!current) return null;
  return (
    <div className="ag-menu" ref={root} onKeyDown={open ? move : undefined}>
      <button
        type="button"
        ref={trigger}
        className="ag-pill"
        data-testid={testid}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${current.label}`}
        title={`${label}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className={compact ? "ag-pill-v ag-pill-collapse" : "ag-pill-v"}>{current.label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="ag-menu-pop" role="menu" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === current.value}
              tabIndex={-1}
              className="ag-menu-item"
              data-value={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span className="ag-menu-main">
                <span>{o.label}</span>
                {o.hint && <span className="ag-menu-hint">{o.hint}</span>}
              </span>
              {o.value === current.value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Repository (narrows the feature list) and feature. Home page only: elsewhere the page itself says what the question is about. */
function Scope() {
  const t = useT();
  const { loader } = useData();
  const scopeRepo = useAgent((s) => s.scopeRepo);
  const homeFeature = useAgent((s) => s.homeFeature);
  const features = loader?.features ?? [];
  const repos = useMemo(() => [...new Set(features.map((f) => f.repo ?? "local"))].sort(), [features]);
  const inScope = features.filter((f) => !scopeRepo || (f.repo ?? "local") === scopeRepo);
  if (!features.length) return null;
  return (
    <>
      {repos.length > 1 && (
        <Menu
          label={t("agent.bar.repo")}
          icon={<FolderGit2 size={14} aria-hidden="true" />}
          value={scopeRepo ?? ""}
          options={[{ value: "", label: t("agent.bar.repoAll") }, ...repos.map((r) => ({ value: r, label: r }))]}
          onChange={(v) => agent.setScopeRepo(v || null)}
          testid="agent-repo-scope"
          compact
        />
      )}
      <label className="ag-ctxsel">
        <span className="sr-only">{t("agent.ctx.label")}</span>
        <select value={homeFeature ?? ""} onChange={(e) => agent.setHomeFeature(e.target.value || null)} data-testid="agent-context-select" title={t("agent.ctx.label")}>
          <option value="">{t("agent.ctx.all")}</option>
          {inScope.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Model and effort. Only where there is a choice to make: the demo (simulated) or a server that advertised its models. */
function Brainpower() {
  const t = useT();
  const engine = useAgent((s) => s.engine);
  const info = useAgent((s) => s.info);
  const model = useAgent((s) => s.model);
  const effort = useAgent((s) => s.effort);
  const options = modelOptions({ engine, info });
  const current = selectedModel({ engine, info, model });
  if (options.length < 2 || !current) return null;
  return (
    <>
      <Menu
        label={t("agent.bar.model")}
        icon={<Brain size={14} aria-hidden="true" />}
        value={current.id}
        options={options.map((m) => ({ value: m.id, label: m.label, hint: m.hint ?? (m.tier ? t(`agent.model.${m.tier}`) : undefined) }))}
        onChange={(v) => agent.setModel(v)}
        testid="agent-model"
        compact
      />
      {current.efforts && current.efforts.length > 0 && (
        <Menu
          label={t("agent.bar.effort")}
          icon={<Gauge size={14} aria-hidden="true" />}
          value={current.efforts.includes(effort) ? effort : (current.efforts[0] as Effort)}
          options={current.efforts.map((e) => ({ value: e, label: t(`agent.effort.${e}`), hint: t(`agent.effort.${e}Hint`) }))}
          onChange={(v) => agent.setEffort(v as Effort)}
          testid="agent-effort"
          compact
        />
      )}
    </>
  );
}

export function ComposerBar({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <div className="ag-bar">
      <div className="ag-bar-l">{variant === "home" && <Scope />}</div>
      <div className="ag-bar-r">
        <Brainpower />
        {children}
      </div>
    </div>
  );
}
