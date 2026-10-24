// /ledger: «El qué» (spec 028). Every rule the specs state, what the software does today and what is still to build, each with
// the evidence that backs it: a test that cites it, a recorded run, or only the spec's word. Live from the server, or this
// repository's own ledger in the demo.
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, FlaskConical, History as HistoryIcon, XCircle } from "lucide-react";
import { useT, type Key } from "../i18n";
import { Collapsible, useDisclosure } from "../shell/Collapsible";
import { Dialog } from "../shell/ui";
import { tn } from "../decision/ui";
import { Skeleton } from "../States";
import { fetchHistory, STATES, TODAY, useLedger, type History, type Intent, type LedgerFeature, type LedgerState } from "../decision/useLedger";
import { PageHeader } from "./PageHeader";

type View = "today" | "build" | "all";
const BUILD: LedgerState[] = ["proposed", "decided"];

function StateBadge({ s }: { s: LedgerState }) {
  const t = useT();
  return <span className={`lg-badge lg-${s}`}>{t(`lg.state.${s}` as Key)}</span>;
}

/** 029/FR-002: the drift in the reader's language, from the structured binding; the server's sentence is the fallback. */
function driftText(t: ReturnType<typeof useT>, i: Intent): string {
  const bad = (i.values ?? []).filter((v) => v.status !== "ok");
  if (!bad.length) return i.reason ?? "";
  return bad.map((v) => (v.status === "drift"
    ? t("lg.val.diff", { expected: v.expected.join(" / ") || "—", file: v.file, line: v.line ?? "?", found: v.found ?? "—" })
    : t("lg.val.broken", { file: v.file, reason: v.reason }))
    + (v.decisions?.length ? " " + t("lg.val.decided", { ids: v.decisions.map((d) => `${d.id} («${d.title}»)`).join(", ") }) : "")).join(" ");
}

function Evidence({ i }: { i: Intent }) {
  const t = useT();
  const values = i.values ?? [];
  const who = values.find((v) => v.changed_by?.commit)?.changed_by;
  const decided = (
    <>
      {i.reason && (
        <p className="small lg-drift" role="alert">
          <XCircle size={13} aria-hidden="true" /> {t("lg.val.drift", { why: driftText(t, i) })}
          {who && <> {t("lg.val.by", { author: who.author ?? "—", date: (who.date ?? "").slice(0, 10), commit: who.commit ?? "—", subject: who.subject })}</>}
        </p>
      )}
      {!i.reason && values.some((v) => v.status === "ok") && (
        <p className="small">
          <CheckCircle2 size={13} aria-hidden="true" /> {t("lg.val.ok")}{" "}
          {values.map((v) => <code key={`${v.file}:${v.line}`} className="lg-cite">{v.file}:{v.line} = {v.found}</code>)}
        </p>
      )}
    </>
  );
  if (!i.tests.length && !i.code.length && !i.last_run) return values.length ? <div className="lg-ev">{decided}</div> : <p className="muted small">{t(i.state === "built" ? "lg.ev.none" : "lg.ev.notBuilt")}</p>; <p className="muted small">{t(i.state === "built" ? "lg.ev.none" : "lg.ev.notBuilt")}</p>;
  return (
    <div className="lg-ev">
      {decided}
      {i.last_run && (
        <p className="small">
          {i.last_run.passed ? <CheckCircle2 size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />}{" "}
          {t(i.last_run.passed ? "lg.run.passed" : "lg.run.failed", { date: (i.last_run.at ?? "").slice(0, 10), commit: i.last_run.commit || "—" })} · <code>{i.last_run.id}</code>
        </p>
      )}
      {!!i.run_age && <p className="small muted">{t("lg.run.age", { n: i.run_age })}</p>}
      {i.stale_run && <p className="small muted">{t("lg.run.stale")}</p>}
      {i.tests.length > 0 && (
        <p className="small">
          <FlaskConical size={13} aria-hidden="true" /> {t("lg.ev.tests")}{" "}
          {i.tests.slice(0, 4).map((c) => <code key={`${c.file}:${c.line}`} className="lg-cite">{c.file}:{c.line}</code>)}
          {i.tests.length > 4 && <span className="muted"> +{i.tests.length - 4}</span>}
        </p>
      )}
      {i.code.length > 0 && (
        <p className="small">
          <FileCode2 size={13} aria-hidden="true" /> {t("lg.ev.code")}{" "}
          {i.code.slice(0, 3).map((c) => <code key={`${c.file}:${c.line}`} className="lg-cite">{c.file}:{c.line}</code>)}
        </p>
      )}
    </div>
  );
}

function Timeline({ h }: { h: History }) {
  const t = useT();
  return (
    <>
      {h.note && <p className="muted">{h.note}</p>}
      <ol className="lg-timeline">
        {h.timeline.map((e, n) => (
          <li key={n} data-type={e.type}>
            <span className="lg-when">{(e.at ?? t("lg.h.now")).slice(0, 10)}</span>
            {e.type === "version" && (
              <div>
                <strong>{t(`lg.h.${e.kind}` as Key)}</strong> {e.commit && <code>{e.commit}</code>} {e.by && <span className="muted">· {e.by}</span>} {(e.subject || e.uncommitted) && <span className="muted">· {e.uncommitted ? t("lg.h.uncommitted") : e.subject}</span>}
                {e.text && <p className="lg-quote">«{e.text}»</p>}
              </div>
            )}
            {e.type === "intent" && (
              <div>
                <strong>{t(e.action === "draft" ? "lg.h.draft" : "lg.h.proposed")}</strong> <span className="muted">· {e.by} ({e.via}) · {e.reason || t("lg.h.noReason")}</span>
              </div>
            )}
            {e.type === "approval" && (
              <div>
                <strong>{t("lg.h.approval", { decision: e.decision ?? "" })}</strong> <span className="muted">· {e.by}{e.reason ? ` · ${e.reason}` : ""}</span>
              </div>
            )}
            {e.type === "verification" && (
              <div>
                <strong>{t(e.passed ? "lg.h.passed" : "lg.h.failed")}</strong> <span className="muted">· {e.by}{e.commit ? ` · ${e.commit}` : ""}{e.current_text ? "" : ` · ${t("lg.h.otherText")}`}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function FeatureGroup({ f, items, live, onHistory }: { f: LedgerFeature; items: Intent[]; live: boolean; onHistory: (i: Intent) => void }) {
  const t = useT();
  const [open, setOpen] = useDisclosure(`lg-${f.key}`, false);
  const tag = f.implemented ? t("lg.f.implemented") : f.approval_current ? t("lg.f.approved") : t("lg.f.proposed");
  return (
    <Collapsible id={`lg-${f.key}`} title={`${f.key} · ${f.title}`} summary={`${tag} · ${tn(t, "lg.rules", items.length)}`} open={open} onOpenChange={setOpen}>
      <ul className="lg-list">
        {items.map((i) => (
          <li key={i.ref} className="lg-item" data-ref={i.ref} data-state={i.state}>
            <div className="lg-head">
              <code className="lg-id">{i.id}</code>
              <StateBadge s={i.state} />
              {i.issues.length > 0 && <span className="lg-issues" title={i.issues.join(", ")}><AlertTriangle size={12} aria-hidden="true" /> {i.issues.join(", ")}</span>}
              {live && (
                <button type="button" className="link lg-hbtn" onClick={() => onHistory(i)}>
                  <HistoryIcon size={13} aria-hidden="true" /> {t("lg.history")}
                </button>
              )}
            </div>
            <p className="lg-text">{i.text}</p>
            <Evidence i={i} />
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

export default function LedgerPage() {
  const t = useT();
  const load = useLedger();
  const [view, setView] = useState<View>("today");
  const [only, setOnly] = useState<LedgerState | null>(null);
  const [hist, setHist] = useState<{ i: Intent; h: History | null | "loading" } | null>(null);
  const [howOpen, setHowOpen] = useDisclosure("lg-how", false);

  const groups = useMemo(() => {
    if (load.status !== "ready") return [];
    const allowed = only ? [only] : view === "today" ? TODAY : view === "build" ? BUILD : [...STATES];
    const by = new Map<string, Intent[]>();
    for (const i of load.ledger.intents) if (allowed.includes(i.state)) by.set(i.feature, [...(by.get(i.feature) ?? []), i]);
    return load.ledger.features.filter((f) => by.has(f.key)).map((f) => ({ f, items: by.get(f.key)! }));
  }, [load, view, only]);

  if (load.status === "loading") return <Skeleton />;
  if (load.status === "none")
    return (
      <div className="page">
        <PageHeader title={t("lg.title")} description={t("lg.desc")} />
        <div className="state"><h2>{t("lg.none")}</h2><p>{t("lg.noneBody")}</p></div>
      </div>
    );
  const { ledger, live } = load;
  const openHistory = async (i: Intent) => {
    setHist({ i, h: "loading" });
    setHist({ i, h: await fetchHistory(i.ref) });
  };
  const broken = Object.entries(ledger.records).filter(([, r]) => !r.ok);

  return (
    <div className="page page-ledger">
      <PageHeader title={t("lg.title")} description={t("lg.desc")} demo={!live} />

      {broken.map(([name, r]) => (
        <p key={name} className="form-error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {t("lg.broken", { name, at: r.broken_at ?? "", reason: r.reason })}</p>
      ))}

      {ledger.intents.some((i) => i.state === "failing") && (
        <section className="lg-alarm" role="alert" aria-label={t("lg.alarm.title")}>
          <h2><XCircle size={16} aria-hidden="true" /> {t("lg.alarm.title")}</h2>
          <ul>
            {ledger.intents.filter((i) => i.state === "failing").map((i) => {
              const who = (i.values ?? []).find((v) => v.changed_by?.commit)?.changed_by;
              return (
                <li key={i.ref}>
                  <button type="button" className="link" onClick={() => void openHistory(i)}><code>{i.ref}</code></button> {i.text}
                  <div className="small">
                    {i.reason ? t("lg.val.drift", { why: driftText(t, i) }) : t("lg.run.failed", { date: (i.last_run?.at ?? "").slice(0, 10), commit: i.last_run?.commit || "—" })}
                    {who && <> {t("lg.val.by", { author: who.author ?? "—", date: (who.date ?? "").slice(0, 10), commit: who.commit ?? "—", subject: who.subject })}</>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ul className="stats lg-stats" aria-label={t("lg.summary")}>
        {STATES.map((s) => (
          <li key={s} className={only === s ? "on" : ""}>
            <button type="button" className="lg-stat" aria-pressed={only === s} onClick={() => setOnly(only === s ? null : s)}>
              <span className="stat-v" data-testid={`lg-n-${s}`}>{ledger.counts[s]}</span>
              <span className="stat-k">{t(`lg.state.${s}` as Key)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="lg-views" role="group" aria-label={t("lg.views")}>
        {(["today", "build", "all"] as View[]).map((v) => (
          <button key={v} type="button" className={`lg-view${view === v && !only ? " on" : ""}`} aria-pressed={view === v && !only} onClick={() => { setView(v); setOnly(null); }}>
            {t(`lg.view.${v}` as Key)}
          </button>
        ))}
      </div>
      <p className="muted dec-sub">{t(only ? (`lg.explain.${only}` as Key) : (`lg.viewDesc.${view}` as Key))}</p>

      {groups.length === 0 ? (
        <div className="state"><h2>{t("lg.empty")}</h2></div>
      ) : (
        groups.map(({ f, items }) => <FeatureGroup key={f.key} f={f} items={items} live={live} onHistory={openHistory} />)
      )}

      {ledger.orphans.length > 0 && (
        <section aria-labelledby="lg-orphans">
          <h2 id="lg-orphans" className="dec-h"><AlertTriangle size={16} aria-hidden="true" /> {t("lg.orphans")}</h2>
          <p className="muted dec-sub">{t("lg.orphansDesc")}</p>
          <ul className="lg-orphans">{ledger.orphans.map((o) => <li key={`${o.file}:${o.line}:${o.id}`}><code>{o.file}:{o.line}</code> → {o.feature}/{o.id}</li>)}</ul>
        </section>
      )}

      <Collapsible id="lg-how" title={t("lg.how")} open={howOpen} onOpenChange={setHowOpen}>
        <p>{t("lg.how.cite")}</p>
        <pre className="lg-code">{`def test_second_approval():\n    """Verifies 028/FR-002"""`}</pre>
        <p>{t("lg.how.verify")}</p>
        <pre className="lg-code">{ledger.verify_command ? `[ledger]\nverify = "${ledger.verify_command}"` : `[ledger]\nverify = "python -m pytest -q {nodes}"`}</pre>
        <p>{t("lg.how.agent")}</p>
        <pre className="lg-code">{"specreview ledger . --today\nspecreview ledger . --verify 028/FR-002\nspecreview ledger . --history 028/FR-002\nspecreview mcp .   # what_it_does, draft_feature, change_requirement, verify_intent"}</pre>
      </Collapsible>

      {hist && (
        <Dialog title={`${hist.i.ref}`} description={hist.i.text} onClose={() => setHist(null)} wide>
          {hist.h === "loading" ? <p className="muted">{t("common.loading")}</p> : hist.h ? <Timeline h={hist.h} /> : <p className="form-error">{t("lg.h.error")}</p>}
        </Dialog>
      )}
    </div>
  );
}
