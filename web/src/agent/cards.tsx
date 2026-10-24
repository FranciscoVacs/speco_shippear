// Tool results rendered as rich cards inside assistant messages (lazy chunk). The simulated agent's tools return plain data;
// these components only show it. Labels go through i18n; the review texts themselves are the engine's.
import { useRef, useState, type ReactNode } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { BookOpen, FolderGit2, ListChecks, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import { copyText } from "../CodeBlock";
import { useT, type TFn } from "../i18n";
import type { Finding, Severity } from "../types";
import { SEV_ICON, SEV_ORDER, pct } from "../util";
import type {
  AcceptanceResult, DraftSpecResult, ExplainRuleResult, FeatureRow, ListFeaturesResult, PrioritizeResult, ReviewCardResult, RewriteResult,
} from "./demo/types";
import { agent, env, useAgent } from "./store";

// ---------------------------------------------------------------- small shared pieces
/** In-app link: a real href (open in a new tab works), client-side navigation otherwise. The host lives above the router. */
function AppLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        env.navigate(to);
      }}
    >
      {children}
    </a>
  );
}

const sevLabel = (t: TFn, s: Severity) => t(`agent.sev.${s}` as "agent.sev.blocker");

function SevBadge({ s }: { s: Severity }) {
  const t = useT();
  return (
    <span className={`badge b-${s}`}>
      <span aria-hidden="true">{SEV_ICON[s]}</span> {sevLabel(t, s)}
    </span>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<number | undefined>(undefined);
  return (
    <span className="ag-copy">
      <button
        type="button"
        className="copy-btn"
        data-state={state}
        onClick={async () => {
          const ok = await copyText(text);
          setState(ok ? "ok" : "fail");
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setState("idle"), ok ? 1800 : 5000);
        }}
      >
        {state === "ok" ? t("agent.card.copied") : label}
      </button>
      <span className="ag-copy-msg" role="status" aria-live="polite">
        {state === "ok" ? t("agent.card.copied") : state === "fail" ? t("agent.card.copyFailed") : ""}
      </span>
    </span>
  );
}

function Counts({ row }: { row: FeatureRow }) {
  const t = useT();
  const total = SEV_ORDER.reduce((n, s) => n + row.summary[s], 0);
  if (total === 0) return <span className="health-ok">{t("reviews.clean")}</span>;
  return (
    <span className="health" role="group" aria-label={row.id}>
      {SEV_ORDER.map((s) => (
        <span key={s} className={`hc hc-${s}` + (row.summary[s] === 0 ? " zero" : "")} title={t(`sev.${s}` as "sev.blocker", { n: row.summary[s] })}>
          <span aria-hidden="true">{SEV_ICON[s]}</span> {row.summary[s]}
          <span className="sr-only"> {t(`sev.${s}` as "sev.blocker", { n: row.summary[s] })}</span>
        </span>
      ))}
    </span>
  );
}

function IdChips({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((i) => (
        <code key={i} className="chip">
          {i}
        </code>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- review card
function FindingItem({ f, featureId }: { f: Finding; featureId: string }) {
  const t = useT();
  const running = useAgent((s) => s.running);
  const ids = f.ids.length ? ` (${f.ids.join(", ")})` : "";
  return (
    <li className={`ag-finding sev-${f.severity}`} data-testid="card-finding">
      <div className="ag-finding-meta">
        <SevBadge s={f.severity} />
        <code className="ag-rule">{f.rule}</code>
        <IdChips ids={f.ids} />
      </div>
      <p className="ag-finding-msg">{f.message}</p>
      <button
        type="button"
        className="ag-link"
        disabled={running}
        onClick={() =>
          agent.sendFocused(
            t("agent.focusQuestion", { rule: f.rule, ids, feature: featureId, message: f.message.replace(/[.\s]+$/, "") }),
            { rule: f.rule, ids: f.ids },
            featureId,
          )
        }
      >
        {t("agent.card.askFinding")}
      </button>
    </li>
  );
}

function ReviewCard({ r }: { r: ReviewCardResult }) {
  const t = useT();
  const m = r.metrics;
  const chips: [string, string][] = [];
  if (m) {
    if (m.requirements != null) chips.push([t("agent.card.metrics.requirements"), String(m.requirements)]);
    if (m.tasks != null) chips.push([t("agent.card.metrics.tasks"), String(m.tasks)]);
    if (m.requirements_with_plan_or_tasks_pct != null) chips.push([t("agent.card.metrics.plan"), pct(m.requirements_with_plan_or_tasks_pct)]);
    if (m.requirements_with_acceptance_pct != null) chips.push([t("agent.card.metrics.accept"), pct(m.requirements_with_acceptance_pct)]);
  }
  return (
    <section className="ag-card ag-review" aria-label={t("agent.card.reviewOf", { id: r.featureId })} data-testid="card-review" data-feature={r.featureId}>
      <header className="ag-card-head">
        <span className="ag-card-title">{r.featureId}</span>
        <span className="ag-card-sub">
          <FolderGit2 size={13} aria-hidden="true" /> {r.repo}
        </span>
      </header>
      <ul className="ag-counts">
        {SEV_ORDER.map((s) => (
          <li key={s} className={`ag-count c-${s}`} data-sev={s}>
            <span className="ag-count-n" data-testid={`count-${s}`}>
              {r.summary[s]}
            </span>
            <span className="ag-count-l">{t(`sev.${s}.plural` as "sev.blocker.plural")}</span>
          </li>
        ))}
      </ul>
      {chips.length > 0 && (
        <ul className="ag-metrics">
          {chips.map(([k, v]) => (
            <li key={k}>
              <span className="ag-metric">
                {k}: <strong>{v}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.top.length === 0 ? (
        <p className="ag-empty">{t("agent.card.noFindings")}</p>
      ) : (
        <>
          <h3 className="ag-h">{t("agent.card.topFindings", { shown: r.top.length, total: r.total })}</h3>
          <ol className="ag-findings">
            {r.top.map((f, i) => (
              <FindingItem key={`${f.rule}-${f.ids.join(",")}-${i}`} f={f} featureId={r.featureId} />
            ))}
          </ol>
        </>
      )}
      <footer className="ag-card-foot">
        <AppLink to={`/reviews/${encodeURIComponent(r.featureId)}`} className="btn primary">
          {t("agent.card.open")}
        </AppLink>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------- feature table
function FeatureTable({ r }: { r: ListFeaturesResult }) {
  const t = useT();
  return (
    <section className="ag-card" aria-label={t("agent.card.features")} data-testid="card-features">
      <div className="ag-table-wrap">
        <table className="ag-table">
          <thead>
            <tr>
              <th scope="col">{t("agent.card.feature")}</th>
              <th scope="col">{t("agent.card.repo")}</th>
              <th scope="col">{t("agent.card.health")}</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <AppLink to={`/reviews/${encodeURIComponent(row.id)}`} className="ag-feat">
                    {row.id}
                  </AppLink>
                </td>
                <td className="muted">{row.repo}</td>
                <td>
                  <Counts row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- rule card
function RuleCard({ r }: { r: ExplainRuleResult }) {
  const t = useT();
  const { rule } = r;
  const sev = (SEV_ORDER as string[]).includes(rule.severity) ? (rule.severity as Severity) : null;
  const block = (label: string, text: string) =>
    text ? (
      <div className="ag-rb">
        <span className="ag-rb-l">{label}</span>
        <p>{text}</p>
      </div>
    ) : null;
  const ex = (label: string, text: string, cls: string) =>
    text ? (
      <div className={`ag-ex ${cls}`}>
        <span className="ag-rb-l">{label}</span>
        <pre>{text}</pre>
      </div>
    ) : null;
  return (
    <section className="ag-card" aria-label={t("agent.card.rule", { id: rule.id })} data-testid="card-rule" data-rule={rule.id}>
      <header className="ag-card-head">
        <BookOpen size={15} aria-hidden="true" />
        <span className="ag-card-title">{rule.id}</span>
        <span className="ag-card-name">{rule.name}</span>
        {sev && <SevBadge s={sev} />}
      </header>
      {rule.question && <p className="ag-question">{rule.question}</p>}
      {block(t("agent.card.what"), rule.what)}
      {block(t("agent.card.why"), rule.why)}
      {block(t("agent.card.fix"), rule.fix)}
      <div className="ag-exs">
        {ex(t("agent.card.bad"), rule.bad, "ag-bad")}
        {ex(t("agent.card.good"), rule.good, "ag-good")}
      </div>
      {rule.caveat && (
        <div className="ag-caveat">
          <span className="ag-rb-l">{t("agent.card.caveat")}</span>
          <p>{rule.caveat}</p>
        </div>
      )}
      <footer className="ag-card-foot">
        <AppLink to={`/rules/${encodeURIComponent(rule.id)}`} className="btn">
          {t("agent.card.openRule")}
        </AppLink>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------- rewrite card: a proposal, never an edit
function RewriteCard({ r }: { r: RewriteResult }) {
  const t = useT();
  return (
    <section className="ag-card ag-proposal" aria-label={t("agent.card.rewrite", { id: r.reqId })} data-testid="card-rewrite">
      <header className="ag-card-head">
        <Wand2 size={15} aria-hidden="true" />
        <span className="ag-card-title">{t("agent.card.rewrite", { id: r.reqId })}</span>
        <span className="ag-example">{t("agent.example")}</span>
      </header>
      <div className="ag-diff">
        <div className="ag-rb">
          <span className="ag-rb-l">{t("agent.card.original")}</span>
          <blockquote className="ag-orig">{r.original}</blockquote>
        </div>
        <div className="ag-rb">
          <span className="ag-rb-l">{t("agent.card.proposal")}</span>
          <blockquote className="ag-prop" data-testid="rewrite-proposal">
            {r.proposal}
          </blockquote>
        </div>
      </div>
      <div className="ag-rb">
        <span className="ag-rb-l">{t("agent.card.questions")}</span>
        {r.questions.length ? (
          <ol className="ag-questions">
            {r.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t("agent.card.noQuestions")}</p>
        )}
      </div>
      {r.rules.length > 0 && (
        <p className="ag-rules">
          <IdChips ids={r.rules} />
        </p>
      )}
      <footer className="ag-card-foot">
        <CopyBtn text={r.proposal} label={t("agent.card.copyProposal")} />
        <p className="ag-note">{t("agent.card.neverEdits")}</p>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------- acceptance card
function AcceptanceCard({ r }: { r: AcceptanceResult }) {
  const t = useT();
  const gherkin = r.scenarios.map((s) => `Scenario: ${s.title}\n  Given ${s.given}\n  When ${s.when}\n  Then ${s.then}`).join("\n\n");
  return (
    <section className="ag-card ag-proposal" aria-label={t("agent.card.acceptance", { id: r.reqId })} data-testid="card-acceptance">
      <header className="ag-card-head">
        <ShieldCheck size={15} aria-hidden="true" />
        <span className="ag-card-title">{t("agent.card.acceptance", { id: r.reqId })}</span>
        <span className="ag-example">{t("agent.example")}</span>
      </header>
      <div className="ag-rb">
        <span className="ag-rb-l">{t("agent.card.requirement")}</span>
        <blockquote className="ag-orig">{r.requirement}</blockquote>
      </div>
      <ol className="ag-scenarios">
        {r.scenarios.map((s) => (
          <li key={s.title} className="ag-scenario" data-testid="card-scenario">
            <h3 className="ag-h">{s.title}</h3>
            <dl className="ag-gwt">
              <dt>{t("agent.card.given")}</dt>
              <dd>{s.given}</dd>
              <dt>{t("agent.card.when")}</dt>
              <dd>{s.when}</dd>
              <dt>{t("agent.card.then")}</dt>
              <dd>{s.then}</dd>
            </dl>
          </li>
        ))}
      </ol>
      <footer className="ag-card-foot">
        <CopyBtn text={gherkin} label={t("agent.card.copyScenarios")} />
        <p className="ag-note">{t("agent.card.neverEdits")}</p>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------- priority list
function PriorityList({ r }: { r: PrioritizeResult }) {
  const t = useT();
  if (r.ranking) {
    return (
      <section className="ag-card" aria-label={t("agent.card.priorityAll")} data-testid="card-priority">
        <header className="ag-card-head">
          <ListChecks size={15} aria-hidden="true" />
          <span className="ag-card-title">{t("agent.card.priorityAll")}</span>
        </header>
        <ol className="ag-rank">
          {r.ranking.map((row, i) => (
            <li key={row.id} data-testid="priority-item">
              <span className="ag-rank-n" aria-hidden="true">
                {i + 1}
              </span>
              <AppLink to={`/reviews/${encodeURIComponent(row.id)}`} className="ag-feat">
                {row.id}
              </AppLink>
              <span className="muted ag-rank-repo">{row.repo}</span>
              <Counts row={row} />
            </li>
          ))}
        </ol>
      </section>
    );
  }
  const id = r.featureId ?? "";
  return (
    <section className="ag-card" aria-label={t("agent.card.priority", { id })} data-testid="card-priority">
      <header className="ag-card-head">
        <ListChecks size={15} aria-hidden="true" />
        <span className="ag-card-title">{t("agent.card.priority", { id })}</span>
      </header>
      {r.steps.length === 0 ? (
        <p className="ag-empty">{t("agent.card.noFindings")}</p>
      ) : (
        <ol className="ag-steps">
          {r.steps.map((s) => (
            <li key={s.rank} className={`ag-step sev-${s.severity}`} data-testid="priority-item">
              <div className="ag-finding-meta">
                <span className="ag-rank-n" aria-label={t("agent.card.step", { n: s.rank })}>
                  {s.rank}
                </span>
                <SevBadge s={s.severity} />
                <code className="ag-rule">{s.rule}</code>
                <IdChips ids={s.ids} />
              </div>
              <p className="ag-finding-msg">{s.message}</p>
              {s.why && <p className="ag-why muted">{s.why}</p>}
            </li>
          ))}
        </ol>
      )}
      {id && (
        <footer className="ag-card-foot">
          <AppLink to={`/reviews/${encodeURIComponent(id)}`} className="btn">
            {t("agent.card.open")}
          </AppLink>
        </footer>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- dispatcher
function DraftCard({ r }: { r: DraftSpecResult }) {
  const t = useT();
  return (
    <section className="ag-card ag-proposal" aria-label={t("agent.card.draft")} data-testid="card-draft">
      <header className="ag-card-head">
        <Wand2 size={15} aria-hidden="true" />
        <span className="ag-card-title">{t("agent.card.draft")}</span>
        <span className="ag-example">{t("agent.card.draftBadge")}</span>
      </header>
      <div className="ag-rb">
        <span className="ag-rb-l">{t("agent.card.draftIntent")}</span>
        <blockquote className="ag-prop">{r.intents[0]}</blockquote>
      </div>
      <div className="ag-rb">
        <span className="ag-rb-l">{t("agent.card.draftDecisions", { n: r.decisions.length })}</span>
        <ol className="ag-questions" data-testid="draft-decisions">
          {r.decisions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </div>
      <footer className="ag-card-foot">
        <CopyBtn text={r.markdown} label={t("agent.card.draftCopy")} />
        <p className="ag-note">{t("agent.card.draftNote")}</p>
      </footer>
    </section>
  );
}

function Running({ name, args }: { name: string; args: Record<string, string> }) {
  const t = useT();
  const what = name === "review_feature" && args.feature ? t("agent.card.reviewing", { id: args.feature }) : t("agent.card.running");
  return (
    <div className="ag-card ag-running" role="status" data-testid="card-running" data-tool={name} aria-label={what}>
      <Loader2 size={15} className="ag-spin" aria-hidden="true" />
      <span>{what}</span>
      <span className="ag-skel" aria-hidden="true" />
    </div>
  );
}

export function ToolPart(p: ToolCallMessagePartProps) {
  const res = p.result as unknown;
  if (res === undefined) {
    return p.status.type === "running" || p.status.type === "requires-action" ? <Running name={p.toolName} args={(p.args ?? {}) as Record<string, string>} /> : null;
  }
  if (!res || typeof res !== "object" || (res as { none?: boolean }).none) return null;
  switch (p.toolName) {
    case "review_feature":
      return <ReviewCard r={res as ReviewCardResult} />;
    case "list_features":
      return <FeatureTable r={res as ListFeaturesResult} />;
    case "explain_rule":
      return <RuleCard r={res as ExplainRuleResult} />;
    case "rewrite_requirement":
      return <RewriteCard r={res as RewriteResult} />;
    case "draft_acceptance":
      return <AcceptanceCard r={res as AcceptanceResult} />;
    case "prioritize":
      return <PriorityList r={res as PrioritizeResult} />;
    case "draft_spec":
      return <DraftCard r={res as DraftSpecResult} />;
    default:
      return null;
  }
}
