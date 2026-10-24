// /connect: three steps from "no repository" to the first executive summary (spec 012, FR-008, FR-009).
// 1 pick a repository · 2 the first review runs · 3 the summary. In the public demo the connection is simulated and labelled
// as such; with the local server the repositories are the ones it already serves.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderGit2, Loader2 } from "lucide-react";
import { useData } from "../DataContext";
import { useT } from "../i18n";
import { agent } from "../agent/store";
import { ExecSummary } from "../decision/ExecSummary";
import { useDecisions } from "../decision/useDecisions";
import { naturalCompare } from "../util";
import { PageHeader } from "./PageHeader";
import { cloudEnabled } from "../cloud/config";
import { ConnectCloud } from "../cloud/ConnectCloud";
import { Link } from "react-router-dom";

/** a demo repository that has no specs, to show the way out of an empty repository */
const EMPTY_DEMO_REPO = "acme/website";
const RUN_MS = 900;
const URGENCY = ["needs_decision", "blocked", "needs_work", "ready"];

export default function ConnectRepo() {
  return cloudEnabled() ? <ConnectCloud /> : <ConnectDemo />;
}

function ConnectDemo() {
  const t = useT();
  const nav = useNavigate();
  const { loader } = useData();
  const { items } = useDecisions();
  const [repo, setRepo] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const demo = loader?.mode === "samples";
  const repos = useMemo(() => {
    const found = [...new Set((loader?.features ?? []).map((f) => f.repo ?? "local"))].sort(naturalCompare);
    return demo ? [...found, EMPTY_DEMO_REPO] : found;
  }, [loader, demo]);

  // step 2 -> 3: the "review" runs (the data is already loaded; the pause keeps the steps legible)
  useEffect(() => {
    if (!repo) return;
    setDone(false);
    const id = window.setTimeout(() => setDone(true), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : RUN_MS);
    return () => window.clearTimeout(id);
  }, [repo]);

  const first = useMemo(() => {
    if (!repo) return null;
    const mine = items.filter((i) => (i.info.repo ?? "local") === repo && i.report?.decision);
    return [...mine].sort((a, b) => URGENCY.indexOf(a.report!.decision!.verdict) - URGENCY.indexOf(b.report!.decision!.verdict))[0] ?? null;
  }, [items, repo]);

  const step = !repo ? 1 : !done ? 2 : 3;

  return (
    <div className="page page-connect">
      <PageHeader title={t("connect.title")} description={t("connect.desc")} demo={demo} />
      <ol className="connect-steps" aria-label={t("connect.steps")}>
        {([1, 2, 3] as const).map((n) => (
          <li key={n} aria-current={step === n ? "step" : undefined} className={step === n ? "on" : step > n ? "done" : ""}>
            {t(`connect.step${n}` as "connect.step1")}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section aria-labelledby="connect-pick">
          <h2 id="connect-pick">{t("connect.pick")}</h2>
          {demo && <p className="muted small">{t("demo.simulated")}</p>}
          <ul className="connect-repos">
            {repos.map((r) => (
              <li key={r}>
                <button type="button" className="btn block" onClick={() => setRepo(r)} data-repo={r}>
                  <FolderGit2 size={15} aria-hidden="true" /> {r}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 2 && (
        <p role="status" className="connect-running" data-testid="connect-running">
          <Loader2 size={15} className="ag-spin" aria-hidden="true" /> {t("connect.running", { repo: repo ?? "" })}
        </p>
      )}

      {step === 3 && repo && (
        <section aria-labelledby="connect-result" data-testid="connect-result">
          <h2 id="connect-result">{t("connect.result", { repo })}</h2>
          {first?.report ? (
            <>
              <ExecSummary report={first.report} feature={first.info.id} canAsk={false} onAsk={() => {}} />
              <p>
                <Link className="btn primary" to={`/reviews/${encodeURIComponent(first.info.id)}`}>
                  {t("connect.open", { feature: first.info.id })}
                </Link>
              </p>
            </>
          ) : (
            <div className="callout" data-testid="connect-empty">
              <strong>{t("connect.noSpecs", { repo })}</strong>
              <p>{t("connect.noSpecsBody")}</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  agent.setText(t("agent.sugg.idea"));
                  nav("/");
                }}
              >
                {t("connect.fromNeed")}
              </button>
            </div>
          )}
          <p>
            <button type="button" className="link" onClick={() => setRepo(null)}>
              {t("connect.another")}
            </button>
          </p>
        </section>
      )}
    </div>
  );
}
