// /decisions: the page for the person who approves. What waits for them first, then every feature with its verdict.
import { Link } from "react-router-dom";
import { usePortrait } from "../portrait/demo";
import { ChevronRight, FolderGit2, Sparkles } from "lucide-react";
import { useData } from "../DataContext";
import { useT, type Key } from "../i18n";
import { URGENCY, mine, useDecisions } from "../decision/useDecisions";
import { VerdictBadge, impactKey, tn } from "../decision/ui";
import { useProduct } from "../decision/useProduct";
import { useApprovals } from "../decision/approvals";
import { Collapsible, useDisclosure } from "../shell/Collapsible";
import { ChainBroken, HistoryTable } from "../decision/ApprovalPanel";
import { usePanel } from "../shell/usePanel";
import { isEmbedded } from "../data";
import { LoadFailure, ServerProblem, Skeleton } from "../States";
import { ASK_EVENT, type AskDetail } from "./askEvent";
import { PageHeader } from "./PageHeader";
import type { Finding, Verdict } from "../types";

const ORDER: Verdict[] = ["needs_decision", "blocked", "needs_work", "ready"];

export default function DecisionsPage() {
  const t = useT();
  const panel = usePanel();
  const { loader, loading: booting, error, retry } = useData();
  const { items, loading } = useDecisions();
  const embedded = isEmbedded();
  const product = useProduct();
  const appr = useApprovals(null, null);
  const portrait = usePortrait();
  const portraitWaiting = portrait.rules.filter((r) => r.status === "proposed").length + portrait.drift.filter((d) => d.status === "open").length;
  const [goalsOpen, setGoalsOpen] = useDisclosure("dec-goals");
  const [histOpen, setHistOpen] = useDisclosure("dec-hist");
  const [allOpen, setAllOpen] = useDisclosure("dec-all");

  if (booting && !loader) return <div className="page"><Skeleton /></div>;
  if (error || !loader) return <div className="page"><LoadFailure detail={error ?? "?"} onRetry={retry} /></div>;
  if (loader.issue) return <div className="page"><ServerProblem issue={loader.issue} onRetry={retry} /></div>;

  const rows = items
    .map((x) => ({ ...x, verdict: x.report?.decision?.verdict ?? null }))
    .sort((a, b) => (a.verdict ? URGENCY[a.verdict] : 9) - (b.verdict ? URGENCY[b.verdict] : 9) || a.info.feature.localeCompare(b.info.feature));
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const turn = rows.map((r) => ({ r, list: mine(r.report) })).filter((x) => x.list.length);

  const ask = (feature: string, f: Finding) => {
    const ids = f.ids.length ? ` (${f.ids.join(", ")})` : "";
    const text = t("agent.focusQuestion", { rule: f.rule, ids, feature, message: f.message.replace(/[.\s]+$/, "") });
    panel.setOpen(true);
    window.dispatchEvent(new CustomEvent<AskDetail>(ASK_EVENT, { detail: { text, focus: { rule: f.rule, ids: f.ids }, featureId: feature } }));
  };

  return (
    <div className="page page-decisions">
      <PageHeader title={t("dec.title")} description={t("dec.desc")} demo={loader.mode === "samples"} />

      <ul className="stats dec-stats" aria-label={t("dec.stats")}>
        {ORDER.map((v) => (
          <li key={v} className={`dstat v-${v}-stat`}>
            <span className="stat-v">{count(v)}</span>
            <span className="stat-k">{t(`dec.stat.${v}` as Key)}</span>
          </li>
        ))}
      </ul>

      {loading && items.length === 0 ? (
        <p className="muted" role="status">{t("dec.loading")}</p>
      ) : (
        <>
          <section aria-labelledby="dec-turn">
            <h2 id="dec-turn" className="dec-h">{t("dec.turn")}</h2>
            <p className="muted dec-sub">{t("dec.turnDesc")}</p>
            {!embedded && portraitWaiting > 0 && (
              <p className="pt-notice" data-testid="portrait-notice">
                <Link to="/portrait">{tn(t, "dec.portraitNotice", portraitWaiting)}</Link>
              </p>
            )}
            {turn.length === 0 && rows.length === 0 && loader.mode === "cloud" ? (
              <div className="state">
                <h2>{t("dec.noneRead")}</h2>
                <p>{t("dec.noneReadBody")}</p>
                <Link className="btn primary" to="/connect">{t("connect.action")}</Link>
              </div>
            ) : turn.length === 0 ? (
              <div className="state">
                <h2>{t("dec.turnEmpty")}</h2>
                <p>{t("dec.turnEmptyBody")}</p>
              </div>
            ) : (
              <div className="turn-groups">
                {turn.map(({ r, list }) => (
                  <article key={r.info.id} className="card turn-card">
                    <header className="turn-card-head">
                      <div>
                        <div className="eyebrow">
                          <FolderGit2 size={13} aria-hidden="true" /> {r.info.repo ?? "local"}
                        </div>
                        <h3 className="mono-title">{r.info.feature}</h3>
                      </div>
                      <Link className="btn" to={`/reviews/${encodeURIComponent(r.info.id)}`}>
                        {t("dec.open")} <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    </header>
                    <ul className="turn-list">
                      {list.map((f, i) => {
                        const k = impactKey(f.rule);
                        return (
                          <li key={i} className="turn-item">
                            <div className="turn-ids">{f.ids.join(" · ") || f.rule}</div>
                            <p>{k ? t(k) : f.message}</p>
                            {!embedded && (
                              <div className="turn-actions">
                                <button type="button" className="link" onClick={() => ask(r.info.feature, f)}>
                                  <Sparkles size={12} aria-hidden="true" /> {t("dec.ask")}
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>

          {product.length > 0 && (
            <Collapsible id="dec-goals" title={t("dec.goals")}
              summary={t("dec.goalsCovered", { a: product.reduce((n, p) => n + p.report.goals.filter((g) => g.covered).length, 0), b: product.reduce((n, p) => n + p.report.goals.length, 0) })}
              open={goalsOpen} onOpenChange={setGoalsOpen}>
              <p className="muted dec-sub">{t("dec.goalsDesc")}</p>
              <div className="goal-groups">
                {product.map(({ repo, report }) => {
                  const covered = report.goals.filter((g) => g.covered).length;
                  return (
                    <article key={repo} className="card goal-card">
                      <header className="turn-card-head">
                        <div>
                          <div className="eyebrow">
                            <FolderGit2 size={13} aria-hidden="true" /> {repo}
                          </div>
                          <h3>{t("dec.goalsCovered", { a: covered, b: report.goals.length })}</h3>
                        </div>
                        <span className="muted small">{tn(t, "dec.decisionsN", report.decisions.length)}</span>
                      </header>
                      <ul className="goal-list">
                        {report.goals.map((g) => (
                          <li key={g.id} className={"goal " + (g.covered ? "g-ok" : "g-gap")}>
                            <span className="goal-id">{g.id}</span>
                            <div className="goal-main">
                              <div className="goal-text">{g.text}</div>
                              {g.covered ? (
                                <div className="goal-feats">
                                  <span className="muted small">{t("dec.goalBuiltBy")}</span>
                                  {g.features.map((f) => (
                                    <Link key={f} className="chip" to={`/reviews/${encodeURIComponent(f)}`}>{f}</Link>
                                  ))}
                                </div>
                              ) : (
                                <span className="verdict v-blocked vs-sm">{t("dec.goalNobody")}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {report.features_without_goal.length > 0 && (
                        <p className="muted small goal-orphans">
                          {t("dec.noGoalFeatures")} {report.features_without_goal.join(", ")}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </Collapsible>
          )}

          {appr.mode !== "off" && (
            <Collapsible id="dec-hist" title={t("appr.historyTitle")} summary={tn(t, "appr.count", appr.history.length)} open={histOpen} onOpenChange={setHistOpen}>
              {appr.chain && !appr.chain.ok && <ChainBroken chain={appr.chain} />}
              <p className="muted dec-sub">{t("appr.historyDesc")}</p>
              <div className="card">
                <HistoryTable entries={appr.history.slice(0, 8)} nameOf={(id) => appr.members.find((m) => m.id === id)?.name ?? id} />
              </div>
            </Collapsible>
          )}

          <Collapsible id="dec-all" title={t("dec.portfolio")} summary={tn(t, "dec.featuresCount", rows.length)} open={allOpen} onOpenChange={setAllOpen}>
            <div className="card">
              <div className="table-wrap flush">
                <table className="data-table">
                  <caption className="sr-only">{t("dec.portfolio")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("dec.col.feature")}</th>
                      <th scope="col">{t("dec.col.state")}</th>
                      <th scope="col">{t("dec.col.waiting")}</th>
                      <th scope="col">{t("dec.col.risk")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const d = r.report?.decision;
                      return (
                        <tr key={r.info.id}>
                          <th scope="row">
                            <Link to={`/reviews/${encodeURIComponent(r.info.id)}`} className="mono-title">{r.info.feature}</Link>
                            <div className="muted small">{r.info.repo ?? "local"}</div>
                          </th>
                          <td>{d ? <VerdictBadge verdict={d.verdict} size="sm" /> : <span className="muted">—</span>}</td>
                          <td>
                            {d ? (
                              d.waiting_on.decision + d.waiting_on.team === 0 ? (
                                <span className="muted">{t("dec.waitingNone")}</span>
                              ) : (
                                <>
                                  {d.waiting_on.decision > 0 && <div className="wait-you">{tn(t, "dec.waitingYou", d.waiting_on.decision)}</div>}
                                  {d.waiting_on.team > 0 && <div className="muted">{tn(t, "dec.waitingTeam", d.waiting_on.team)}</div>}
                                </>
                              )
                            ) : null}
                          </td>
                          <td>{d?.top_risk ? t(`risk.${d.top_risk}` as Key) : <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Collapsible>
        </>
      )}
    </div>
  );
}
