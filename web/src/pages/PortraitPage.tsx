// /portrait: the initial portrait of business rules (spec 014). What the software does today, as rules the person confirms,
// the baseline they freeze, and the changes that touched a decided rule. Demo backend: see src/portrait/demo.ts.
import { useState } from "react";
import { AlertTriangle, Check, FileCode2, FolderGit2, Pencil, ShieldCheck, X } from "lucide-react";
import { useLang, useT, type Key } from "../i18n";
import { Collapsible, useDisclosure } from "../shell/Collapsible";
import { Dialog } from "../shell/ui";
import { useUI } from "../shell/UIContext";
import { tn } from "../decision/ui";
import { statementOf } from "../portrait/demo";
import { usePortraitBackend, type Failure } from "../portrait/backend";
import { LoadFailure, Skeleton } from "../States";
import { text, type Rule } from "../portrait/model";
import { PageHeader } from "./PageHeader";

const FAIL: Record<Failure, Key> = { reason: "pt.err.reason", statement: "pt.err.statement", taken: "pt.err.taken", note: "pt.err.note", none: "pt.err.none", forbidden: "pt.err.forbidden", network: "pt.err.network" };
const short = (iso: string) => iso.slice(0, 10);

function Chips({ r }: { r: Rule }) {
  const t = useT();
  return (
    <p className="pt-chips">
      <span className="pt-chip">{t(`pt.cat.${r.category}` as Key)}</span>
      <span className={`pt-chip risk-${r.risk}`}>{t(`pt.risk.${r.risk}` as Key)}</span>
      <span className="pt-chip">{t(r.origin === "spec" ? "pt.origin.spec" : "pt.origin.code")} · {t(`pt.conf.${r.confidence}` as Key)}</span>
    </p>
  );
}

function Evidence({ r }: { r: Rule }) {
  const t = useT();
  return (
    <div className="pt-evidence">
      <span className="pt-ev-l">{t("pt.evidence")}</span>
      {r.evidence.map((e, i) => (
        <figure key={i}>
          <figcaption>
            <FileCode2 size={13} aria-hidden="true" /> <code>{e.path}:{e.start_line}{e.end_line > e.start_line ? `-${e.end_line}` : ""}</code>
          </figcaption>
          <pre>{e.excerpt}</pre>
        </figure>
      ))}
    </div>
  );
}

function RuleCard({ r, canDecide }: { r: Rule; canDecide: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const be = usePortraitBackend();
  const [mode, setMode] = useState<"idle" | "correct" | "reject">("idle");
  const [value, setValue] = useState("");
  const [err, setErr] = useState<Failure | null>(null);

  const run = async (action: "confirm" | "correct" | "reject") => {
    const f = await be.decide(r.id, action, { statement: value, note: action === "reject" ? value : "" }, lang);
    if (f) return setErr(f);
    ui.toast(t(action === "reject" ? "pt.toast.rejected" : "pt.toast.confirmed", { code: r.code }));
  };
  const open = (m: "correct" | "reject") => {
    setMode(m);
    setErr(null);
    setValue(m === "correct" ? statementOf(r, lang) : "");
  };

  return (
    <article className="card pt-card" aria-labelledby={`pt-${r.id}`} data-code={r.code}>
      <header>
        <span className="eyebrow"><FolderGit2 size={13} aria-hidden="true" /> {r.repo} · <span className="mono">{r.code}</span></span>
        <h3 id={`pt-${r.id}`}>{statementOf(r, lang)}</h3>
        <Chips r={r} />
      </header>
      {r.origin === "code" && r.status === "proposed" && <p className="pt-hypo">{t("pt.hypothesis")}</p>}
      <Evidence r={r} />
      {r.status === "proposed" && mode === "idle" && canDecide && (
        <div className="pt-actions">
          <button type="button" className="btn primary" onClick={() => run("confirm")}><Check size={14} aria-hidden="true" /> {t("pt.confirm")}</button>
          <button type="button" className="btn" onClick={() => open("correct")}><Pencil size={14} aria-hidden="true" /> {t("pt.correct")}</button>
          <button type="button" className="btn" onClick={() => open("reject")}><X size={14} aria-hidden="true" /> {t("pt.reject")}</button>
        </div>
      )}
      {r.status === "proposed" && !canDecide && <p className="muted small">{t("pt.cannotDecide")}</p>}
      {mode !== "idle" && (
        <form className="pt-form" onSubmit={(e) => { e.preventDefault(); run(mode); }}>
          <label className="field">
            <span>{t(mode === "correct" ? "pt.correctLabel" : "pt.rejectLabel")}</span>
            <textarea rows={mode === "correct" ? 3 : 2} value={value} onChange={(e) => setValue(e.target.value)} data-autofocus autoFocus />
          </label>
          {err && <p className="form-error" role="alert">{t(FAIL[err])}</p>}
          <div className="pt-actions">
            <button type="submit" className="btn primary">{t(mode === "correct" ? "pt.saveCorrection" : "pt.saveRejection")}</button>
            <button type="button" className="btn" onClick={() => { setMode("idle"); setErr(null); }}>{t("common.cancel")}</button>
          </div>
        </form>
      )}
      {r.status !== "proposed" && (
        <p className="muted small">{t(r.status === "confirmed" ? "pt.decidedConfirmed" : "pt.decidedRejected", { who: r.decidedBy === "@me" ? t("pt.you") : r.decidedBy === "@other" ? t("pt.someone") : r.decidedBy ?? "", date: short(r.decidedAt ?? "") })}{r.note ? ` — ${r.note}` : ""}</p>
      )}
    </article>
  );
}

export default function PortraitPage() {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const be = usePortraitBackend();
  const { state: s, loading, error, canDecide, canConsent, retry } = be.useView();
  const [confOpen, setConfOpen] = useDisclosure("pt-confirmed");
  const [rejOpen, setRejOpen] = useDisclosure("pt-rejected");
  const [baseOpen, setBaseOpen] = useDisclosure("pt-baseline");
  const [repoOpen, setRepoOpen] = useDisclosure("pt-repos");
  const [freezing, setFreezing] = useState(false);
  const [name, setName] = useState("");
  const [ackId, setAckId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [ackErr, setAckErr] = useState<Failure | false>(false);

  if (!s) {
    if (error) return <div className="page"><LoadFailure detail={error} onRetry={retry} /></div>;
    return <div className="page"><Skeleton />{loading && null}</div>;
  }

  const by = (st: Rule["status"]) => s.rules.filter((r) => r.status === st);
  const order = { high: 0, medium: 1, low: 2 };
  const proposed = by("proposed").sort((a, b) => order[a.risk] - order[b.risk] || a.code.localeCompare(b.code));
  const confirmed = by("confirmed");
  const rejected = by("rejected");
  const open = s.drift.filter((d) => d.status === "open");
  const last = s.baselines[0];

  return (
    <div className="page page-portrait">
      <PageHeader
        title={t("pt.title")}
        description={t("pt.desc")}
        demo
        actions={confirmed.length > 0 && canDecide ? <button type="button" className="btn primary" onClick={() => { setName(t("pt.defaultName", { n: s.baselines.length + 1 })); setFreezing(true); }}><ShieldCheck size={14} aria-hidden="true" /> {t("pt.freeze")}</button> : undefined}
      />

      <ul className="stats" aria-label={t("pt.summary")}>
        <li><span className="stat-v" data-testid="pt-n-proposed">{proposed.length}</span><span className="stat-k">{t("pt.stat.waiting")}</span></li>
        <li><span className="stat-v" data-testid="pt-n-confirmed">{confirmed.length}</span><span className="stat-k">{t("pt.stat.confirmed")}</span></li>
        <li><span className="stat-v" data-testid="pt-n-drift">{open.length}</span><span className="stat-k">{t("pt.stat.drift")}</span></li>
        <li><span className="stat-v pt-base">{last ? `#${last.hash.slice(0, 7)}` : "—"}</span><span className="stat-k">{last ? t("pt.stat.baseline", { name: last.name }) : t("pt.stat.noBaseline")}</span></li>
      </ul>

      {open.length > 0 && (
        <section aria-labelledby="pt-drift" className="pt-drift">
          <h2 id="pt-drift" className="dec-h"><AlertTriangle size={16} aria-hidden="true" /> {t("pt.drift")}</h2>
          <p className="muted dec-sub">{t("pt.driftDesc")}</p>
          <ul className="turn-list">
            {open.map((d) => {
              const r = s.rules.find((x) => x.id === d.ruleId);
              if (!r) return null;
              return (
                <li key={d.id} className="turn-item" data-drift={d.id}>
                  <div className="turn-ids">{r.code} · {t(`pt.drift.${d.kind}` as Key)} · <code>{d.commit}</code> · {short(d.at)}</div>
                  <p><strong>{statementOf(r, lang)}</strong></p>
                  <p>{text(d.detail, lang)}</p>
                  {ackId === d.id ? (
                    <form className="pt-form" onSubmit={async (e) => { e.preventDefault(); const f = await be.acknowledge(d.id, ackNote); if (f) { setAckErr(f); return; } setAckId(null); setAckNote(""); ui.toast(t("pt.toast.acked", { code: r.code })); }}>
                      <label className="field"><span>{t("pt.ackLabel")}</span><textarea rows={2} value={ackNote} onChange={(e) => setAckNote(e.target.value)} autoFocus /></label>
                      {ackErr && <p className="form-error" role="alert">{t(FAIL[ackErr])}</p>}
                      <div className="pt-actions"><button type="submit" className="btn primary">{t("pt.ack")}</button><button type="button" className="btn" onClick={() => { setAckId(null); setAckErr(false); }}>{t("common.cancel")}</button></div>
                    </form>
                  ) : canDecide ? (
                    <div className="turn-actions"><button type="button" className="link" onClick={() => { setAckId(d.id); setAckNote(""); setAckErr(false); }}>{t("pt.ackOpen")}</button></div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="pt-queue">
        <h2 id="pt-queue" className="dec-h">{t("pt.queue")}</h2>
        <p className="muted dec-sub">{t("pt.queueDesc")}</p>
        {proposed.length === 0 ? (
          <div className="state"><h2>{t("pt.queueEmpty")}</h2><p>{t("pt.queueEmptyBody")}</p></div>
        ) : (
          <div className="pt-list">{proposed.map((r) => <RuleCard key={r.id} r={r} canDecide={canDecide} />)}</div>
        )}
      </section>

      <Collapsible id="pt-confirmed" title={t("pt.confirmedTitle")} summary={tn(t, "pt.count", confirmed.length)} open={confOpen} onOpenChange={setConfOpen}>
        {confirmed.length ? <div className="pt-list">{confirmed.map((r) => <RuleCard key={r.id} r={r} canDecide={canDecide} />)}</div> : <p className="muted">{t("pt.noneYet")}</p>}
      </Collapsible>
      <Collapsible id="pt-rejected" title={t("pt.rejectedTitle")} summary={tn(t, "pt.count", rejected.length)} open={rejOpen} onOpenChange={setRejOpen}>
        {rejected.length ? <div className="pt-list">{rejected.map((r) => <RuleCard key={r.id} r={r} canDecide={canDecide} />)}</div> : <p className="muted">{t("pt.noneYet")}</p>}
      </Collapsible>
      <Collapsible id="pt-baseline" title={t("pt.baselineTitle")} summary={tn(t, "pt.baselines", s.baselines.length)} open={baseOpen} onOpenChange={setBaseOpen}>
        <p className="muted">{t("pt.baselineDesc")}</p>
        {s.baselines.length === 0 ? <p className="muted">{t("pt.noBaseline")}</p> : (
          <ul className="pt-baselines">{s.baselines.map((b) => <li key={b.id}><strong>{b.name}</strong> · {tn(t, "pt.count", b.count)} · {short(b.at)} · <code>#{b.hash.slice(0, 12)}</code></li>)}</ul>
        )}
      </Collapsible>
      <Collapsible id="pt-repos" title={t("pt.reposTitle")} summary={tn(t, "pt.repos", s.repos.length)} open={repoOpen} onOpenChange={setRepoOpen}>
        <div className="table-wrap"><table className="doc-table">
          <thead><tr><th scope="col">{t("pt.repo")}</th><th scope="col">{t("pt.inv.specs")}</th><th scope="col">{t("pt.inv.docs")}</th><th scope="col">{t("pt.inv.tests")}</th><th scope="col">{t("pt.inv.code")}</th><th scope="col">{t("pt.consent")}</th></tr></thead>
          <tbody>{s.repos.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}</th><td>{r.counts.specs}</td><td>{r.counts.docs}</td><td>{r.counts.tests}</td><td>{r.counts.code}</td>
              <td><label className="check-row"><input type="checkbox" checked={r.consent} disabled={!canConsent} onChange={async (e) => { const on = e.target.checked; const f = await be.setConsent(r, on); ui.toast(f ? t(FAIL[f]) : t(on ? "pt.toast.consentOn" : "pt.toast.consentOff", { repo: r.name })); }} /> {t("pt.consentLabel")}</label></td>
            </tr>))}</tbody>
        </table></div>
        <p className="muted small">{t("pt.consentNote")}</p>
      </Collapsible>

      {freezing && (
        <Dialog
          title={t("pt.freezeTitle")}
          description={t("pt.freezeDesc", { n: confirmed.length })}
          onClose={() => setFreezing(false)}
          footer={<>
            <button type="button" className="btn" onClick={() => setFreezing(false)}>{t("common.cancel")}</button>
            <button type="button" className="btn primary" disabled={!name.trim()} onClick={async () => { const b = await be.freeze(name); setFreezing(false); ui.toast(b ? t("pt.toast.frozen", { name: b.name }) : t("pt.err.network")); }}>{t("pt.freezeConfirm")}</button>
          </>}
        >
          <label className="field"><span>{t("pt.freezeName")}</span><input value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></label>
        </Dialog>
      )}
    </div>
  );
}
