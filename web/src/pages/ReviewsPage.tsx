// /reviews: every feature across repositories, grouped by repo, with health counts, search and a repo filter.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, FolderGit2, Search } from "lucide-react";
import { useData } from "../DataContext";
import { useT } from "../i18n";
import type { FeatureInfo, Severity } from "../types";
import { SEV_ICON, SEV_ORDER, naturalCompare } from "../util";
import { LoadFailure, ServerProblem, Skeleton } from "../States";
import { PageHeader } from "./PageHeader";

const sum = (f: FeatureInfo, s: Severity): number | null => (f.summary ? (f.summary[s] ?? 0) : null);

function Counts({ f }: { f: FeatureInfo }) {
  const t = useT();
  if (!f.summary) return <span className="muted">{t("reviews.noSummary")}</span>;
  const total = SEV_ORDER.reduce((n, s) => n + (sum(f, s) ?? 0), 0);
  if (total === 0) return <span className="health-ok">{t("reviews.clean")}</span>;
  return (
    <span className="health" role="group" aria-label={t("reviews.findingsOf", { name: f.feature })}>
      {SEV_ORDER.map((s) => {
        const n = sum(f, s) ?? 0;
        return (
          <span key={s} className={`hc hc-${s}` + (n === 0 ? " zero" : "")} title={t(`sev.${s}` as "sev.blocker", { n })}>
            <span aria-hidden="true">{SEV_ICON[s]}</span> {n}
            <span className="sr-only"> {t(`sev.${s}` as "sev.blocker", { n })}</span>
          </span>
        );
      })}
    </span>
  );
}

export default function ReviewsPage() {
  const t = useT();
  const { loader, loading, error, retry } = useData();
  const [params, setParams] = useSearchParams();
  const repo = params.get("repo") ?? "";
  const [q, setQ] = useState("");

  const features = loader?.features ?? [];
  const repos = useMemo(() => [...new Set(features.map((f) => f.repo ?? "local"))].sort(naturalCompare), [features]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return repos
      .filter((r) => !repo || r === repo)
      .map((r) => ({
        repo: r,
        items: features.filter((f) => (f.repo ?? "local") === r && (!needle || `${f.feature} ${f.id} ${r}`.toLowerCase().includes(needle))),
      }))
      .filter((g) => g.items.length);
  }, [features, repos, repo, q]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const totals = SEV_ORDER.map((s) => features.reduce((n, f) => n + (sum(f, s) ?? 0), 0));
  const filtersOn = !!repo || !!q.trim();

  if (!loader) {
    if (error) return <div className="page"><LoadFailure detail={error} onRetry={retry} /></div>;
    return <div className="page"><Skeleton />{loading && null}</div>;
  }
  if (loader.issue) return <div className="page"><ServerProblem issue={loader.issue} onRetry={retry} /></div>;

  const setRepo = (v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set("repo", v);
    else n.delete("repo");
    setParams(n, { replace: true });
  };

  return (
    <div className="page page-reviews">
      <PageHeader
        title={t("reviews.title")}
        description={t("reviews.desc")}
        demo={loader.mode === "samples"}
        actions={loader.mode !== "embedded" && <Link className="btn" to="/connect">{t("connect.action")}</Link>}
      />

      <ul className="stats" aria-label={t("reviews.stats")}>
        <li>
          <span className="stat-v">{features.length}</span>
          <span className="stat-k">{t("reviews.features")}</span>
        </li>
        <li>
          <span className="stat-v">{repos.length}</span>
          <span className="stat-k">{t("reviews.repos")}</span>
        </li>
        {SEV_ORDER.map((s, i) => (
          <li key={s} className={`stat-${s}`}>
            <span className="stat-v">
              <span aria-hidden="true" className="stat-ico">{SEV_ICON[s]}</span> {totals[i]}
            </span>
            <span className="stat-k">{t(`sev.${s}.plural` as "sev.blocker.plural")}</span>
          </li>
        ))}
      </ul>

      <div className="list-tools">
        <label className="search-box">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{t("reviews.search")}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("reviews.search")} />
        </label>
        <label className="select-box">
          <span className="sr-only">{t("reviews.repoFilter")}</span>
          <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label={t("reviews.repoFilter")}>
            <option value="">{t("reviews.allRepos")}</option>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small" aria-live="polite">
          {t("reviews.shown", { n: shown, total: features.length })}
        </span>
        {filtersOn && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setQ("");
              setRepo("");
            }}
          >
            {t("reviews.clearFilters")}
          </button>
        )}
      </div>

      {features.length === 0 ? (
        <div className="state">
          <h2>{t("reviews.empty")}</h2>
          <p>{t("reviews.emptyBody")}</p>
        </div>
      ) : shown === 0 ? (
        <div className="state">
          <h2>{t("reviews.nomatch")}</h2>
          <p>{t("reviews.nomatchBody")}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.repo} className="repo-group" aria-labelledby={`repo-${g.repo}`}>
            <h2 id={`repo-${g.repo}`} className="repo-title">
              <FolderGit2 size={15} aria-hidden="true" /> {g.repo} <span className="count">{g.items.length}</span>
            </h2>
            <ul className="feat-list">
              {g.items.map((f) => (
                <li key={f.id}>
                  <Link to={`/reviews/${encodeURIComponent(f.id)}`} className="feat-row">
                    <span className="feat-name">{f.feature}</span>
                    <Counts f={f} />
                    <ChevronRight size={15} className="feat-go" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
