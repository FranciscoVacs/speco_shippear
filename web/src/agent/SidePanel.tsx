// Body of the right-hand panel (FR-004..FR-007): the same conversation as the home page, compact, with the page's feature or
// rule as the visible context (FR-006). The shell supplies the header, the collapse button and the overlay sheet.
import { SquarePen, X, FileText, BookOpen, Layers } from "lucide-react";
import { useData } from "../DataContext";
import { useT } from "../i18n";
import { isEmbedded } from "../data";
import { agent, useAgent } from "./store";
import type { AgentContext } from "./types";
import { CreditsBanner } from "./CreditsBanner";
import { Chips, ChipsSkeleton, Composer, EngineBadge, FocusChip, ThreadArea, type ChipItem } from "./parts";

function useContextLabel(context: AgentContext) {
  const { loader } = useData();
  const homeFeature = useAgent((s) => s.homeFeature);
  const features = loader?.features ?? [];
  let feature: string | null = null;
  if (context.featureId) feature = features.find((f) => f.id === context.featureId)?.id ?? (isEmbedded() ? (features[0]?.id ?? null) : null);
  return { feature, rule: context.ruleId ?? null, homeFeature };
}

function ContextChip({ context }: { context: AgentContext }) {
  const t = useT();
  const detached = useAgent((s) => s.detached);
  const { feature, rule, homeFeature } = useContextLabel(context);
  const page = feature ?? rule;
  if (!page) {
    return (
      <p className="ag-ctx" data-testid="agent-context" title={t("agent.ctx.title")}>
        <Layers size={13} aria-hidden="true" />
        <span className="ag-ctx-name">
          {homeFeature ? (
            <>
              <span className="sr-only">{t("agent.ctx.feature", { id: "" })}</span>
              {homeFeature}
            </>
          ) : (
            t("agent.ctx.all")
          )}
        </span>
      </p>
    );
  }
  // the icon says what kind of page it is; the prefix is there for assistive technology (the chip must fit the id on a narrow panel)
  const prefix = feature ? t("agent.ctx.feature", { id: "" }) : t("agent.ctx.rule", { id: "" });
  const label = feature ?? rule ?? "";
  const Icon = feature ? FileText : BookOpen;
  if (detached)
    return (
      <p className="ag-ctx ag-ctx-off" data-testid="agent-context" data-detached="true" title={t("agent.ctx.title")}>
        <Icon size={13} aria-hidden="true" />
        <span className="ag-ctx-name">{t("agent.ctx.none")}</span>
        <button type="button" className="ag-ctx-btn" onClick={() => agent.setDetached(false)}>
          {t("agent.ctx.attach", { id: page })}
        </button>
      </p>
    );
  return (
    <p className="ag-ctx" data-testid="agent-context" data-detached="false" title={t("agent.ctx.title")}>
      <Icon size={13} aria-hidden="true" />
      <span className="ag-ctx-name" data-testid="agent-context-name">
        <span className="sr-only">{prefix}</span>
        {label}
      </span>
      <button type="button" className="ag-x" onClick={() => agent.setDetached(true)} aria-label={t("agent.ctx.detach")} title={t("agent.ctx.detach")}>
        <X size={13} aria-hidden="true" />
      </button>
    </p>
  );
}

function pageChips(context: AgentContext, t: ReturnType<typeof useT>, worst: string | null): ChipItem[] {
  if (context.page === "review")
    return [{ label: t("agent.sugg.fixFirst") }, { label: t("agent.sugg.rewrite") }, { label: t("agent.sugg.worst") }];
  if (context.page === "rule" && context.ruleId)
    return [{ label: t("agent.sugg.rule"), prompt: t("agent.sugg.rule") + " " + context.ruleId }];
  return [
    ...(worst ? [{ label: t("agent.sugg.review", { id: worst }) }] : []),
    { label: t("agent.sugg.list") },
    { label: t("agent.sugg.start") },
    { label: t("agent.sugg.cov") },
  ];
}

export function SidePanel({ context, worst, ready }: { context: AgentContext; worst: string | null; ready: boolean }) {
  const t = useT();
  const started = useAgent((s) => s.started);
  return (
    <>
      <div className="ag-panel-head">
        <ContextChip context={context} />
        <button type="button" className="ag-new" data-testid="agent-new" onClick={() => agent.newConversation()} disabled={!started}>
          <SquarePen size={13} aria-hidden="true" /> {t("agent.new")}
        </button>
      </div>
      <div className="ag-body">
        {started ? (
          <ThreadArea variant="panel" />
        ) : (
          <div className="ag-panel-empty">
            <p className="ag-panel-title">{t("agent.ask")}</p>
            <p className="muted">{t("agent.intro")}</p>
            {ready || context.page === "review" || context.page === "rule" ? <Chips items={pageChips(context, t, worst)} /> : <ChipsSkeleton />}
          </div>
        )}
      </div>
      <div className="ag-dock">
        <FocusChip />
        <CreditsBanner variant="panel" />
        <Composer variant="panel" placeholder={t("agent.composer.placeholderPanel")} />
        <EngineBadge variant="panel" />
        <p className="ag-hint muted">{t("agent.proposeOnly")}</p>
      </div>
    </>
  );
}
