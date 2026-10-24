// "/" : the agent as the whole page (FR-001, FR-002). Empty chat with greeting, composer and suggested prompts; after the
// first message the same elements become a normal chat with the composer pinned at the bottom.
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useData } from "../DataContext";
import { useT } from "../i18n";
import { useSession } from "../shell/session";
import { counts, score } from "./demo/tools";
import { useAgent } from "./store";
import { CreditsBanner } from "./CreditsBanner";
import { Chips, ChipsSkeleton, Composer, EngineBadge, FocusChip, ThreadArea, type ChipItem } from "./parts";

/** The feature that needs attention first: blockers weigh most (same score as the simulated agent's ranking). */
export function worstFeature(features: { id: string; summary?: Partial<Record<"blocker" | "warning" | "suggestion", number>> }[]): string | null {
  let best: string | null = null;
  let top = -1;
  for (const f of features) {
    const s = score(counts(f.summary));
    if (s > top) {
      top = s;
      best = f.id;
    }
  }
  return top > 0 ? best : (features[0]?.id ?? null);
}

export function HomeChat() {
  const t = useT();
  const { loader, error } = useData();
  const ready = !!loader || !!error;
  const user = useSession().user;
  const started = useAgent((s) => s.started);
  const features = loader?.features ?? [];
  const worst = useMemo(() => worstFeature(features), [features]);
  const first = user.name.split(/\s+/)[0] || user.name;

  const chips: ChipItem[] = [
    ...(worst ? [{ label: t("agent.sugg.review", { id: worst }) }] : []),
    { label: t("agent.sugg.today") },
    { label: t("agent.sugg.list") },
    { label: t("agent.sugg.start") },
    { label: t("agent.sugg.idea") },
  ];

  return (
    <>
      <div className="ag-body">
        {started ? (
          <>
            <h1 className="sr-only">{t("panel.title")}</h1>
            <ThreadArea variant="home" />
          </>
        ) : (
          <header className="ag-hero">
            <span className="ag-hero-ico" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <h1>{t("agent.greeting", { name: first })}</h1>
            <p className="ag-ask">{t("agent.ask")}</p>
          </header>
        )}
      </div>
      <div className="ag-dock">
        <CreditsBanner variant="home" />
        <Composer variant="home" placeholder={t("agent.composer.placeholder")} />
        <FocusChip />
        {!started && (ready ? <Chips items={chips} /> : <ChipsSkeleton />)}
        <div className="ag-meta">
          <EngineBadge variant="home" />
        </div>
        <p className="ag-hint muted">
          {t("agent.hint")} {t("agent.proposeOnly")}
        </p>
      </div>
    </>
  );
}
