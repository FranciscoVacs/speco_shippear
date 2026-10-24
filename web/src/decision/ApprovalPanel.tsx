// The approver's actions on a feature: approve, approve with conditions, reject, delegate. Shows the latest decision and
// whether the spec changed since. Everything is recorded with who/when/which version (see approvals.ts).
import { useState } from "react";
import { Check, Handshake, ShieldCheck, ShieldX, TriangleAlert, UserRoundCog } from "lucide-react";
import { useLang, useT, type Key } from "../i18n";
import { Dialog } from "../shell/ui";
import { useUI } from "../shell/UIContext";
import type { Report, Sources } from "../types";
import { useApprovals, type DecisionKind, type Entry } from "./approvals";

export const fmtDate = (iso: string, lang: string) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "es-AR", { day: "numeric", month: "short", year: "numeric" });

export function decisionLine(t: ReturnType<typeof useT>, e: Entry, lang: string, nameOf: (id: string) => string): string {
  return t(`appr.${e.decision}` as Key, { name: e.by.name, date: fmtDate(e.at, lang), to: e.delegate_to ? nameOf(e.delegate_to) : "" });
}

/** `feature` is the name shown to the person; `approvalRef` is what the log is keyed by when that is not the name (the cloud keys it by id). */
export function ApprovalPanel({ report, feature, sources, approvalRef }: { report: Report; feature: string; sources: Sources; approvalRef?: string }) {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const a = useApprovals(approvalRef ?? feature, sources);
  const [dlg, setDlg] = useState<DecisionKind | null>(null);
  const [token, setTok] = useState("");
  const [tokenErr, setTokenErr] = useState(false);
  if (a.mode === "off") return null;
  const st = a.status;
  const nameOf = (id: string) => a.members.find((m) => m.id === id)?.name ?? id;
  const blocked = report.decision ? !report.decision.can_implement : false;
  const latest = st?.latest ?? null;
  const Icon = !latest ? Handshake : latest.decision === "rejected" ? ShieldX : latest.decision === "delegated" ? UserRoundCog : ShieldCheck;
  const tone = !latest ? "none" : st!.stale ? "stale" : latest.decision;

  return (
    <div className={`appr appr-${tone}`} aria-labelledby="appr-title">
      <h3 id="appr-title" className="appr-title">
        <Icon size={15} aria-hidden="true" /> {t("appr.title")}
      </h3>
      {a.loading && !st ? (
        <p className="muted">{t("common.loading")}</p>
      ) : (
        <>
          {a.chain && !a.chain.ok && <ChainBroken chain={a.chain} />}
          <p className="appr-line">{latest ? decisionLine(t, latest, lang, nameOf) : t("appr.none")}</p>
          {latest && latest.reason && <p className="appr-reason">“{latest.reason}”</p>}
          {latest && latest.conditions.length > 0 && (
            <div className="appr-conds">
              <strong>{t("appr.conditions")}</strong>
              <ul>{latest.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {latest?.override && <p className="appr-warn"><TriangleAlert size={13} aria-hidden="true" /> {t("appr.override")}</p>}
          {latest && (st!.stale ? (
            <p className="appr-warn"><TriangleAlert size={13} aria-hidden="true" /> {t("appr.stale", { files: st!.changed_files.join(", ") })}</p>
          ) : (
            <p className="muted small"><Check size={12} aria-hidden="true" /> {t("appr.current")}</p>
          ))}

          {a.needsToken && (
            <form
              className="appr-token"
              onSubmit={async (e) => {
                e.preventDefault();
                setTokenErr(!(await a.setToken(token)));
              }}
            >
              <label>
                {t("appr.token")}
                <input type="password" value={token} onChange={(e) => setTok(e.target.value)} autoComplete="off" spellCheck={false} />
              </label>
              <button type="submit" className="btn" disabled={!token.trim()}>{t("appr.tokenSave")}</button>
              <p className="muted small">{tokenErr ? t("appr.tokenBad") : t("appr.tokenHelp")}</p>
            </form>
          )}
          {a.mode === "server" && !a.needsToken && !a.me && <p className="muted small">{t("appr.noMembers")}</p>}
          {a.mode !== "demo" && a.me && !a.canApprove && <p className="muted small">{t("appr.readOnly")}</p>}

          {a.canApprove && (
            <div className="appr-actions">
              <button type="button" className="btn primary" onClick={() => setDlg("approved")}>{t(st?.stale ? "appr.btn.again" : "appr.btn.approve")}</button>
              <button type="button" className="btn" onClick={() => setDlg("approved_with_conditions")}>{t("appr.btn.conditions")}</button>
              <button type="button" className="btn" onClick={() => setDlg("rejected")}>{t("appr.btn.reject")}</button>
              <button type="button" className="btn" onClick={() => setDlg("delegated")}>{t("appr.btn.delegate")}</button>
            </div>
          )}
          {a.mode === "demo" && <p className="muted small appr-demo">{t("appr.demoNote")}</p>}
        </>
      )}
      {dlg && (
        <DecisionDialog
          kind={dlg}
          feature={feature}
          blocked={blocked}
          members={a.members.filter((m) => ["approver", "admin", "owner"].includes(m.role) && m.id !== a.me?.id)}
          onClose={() => setDlg(null)}
          onSubmit={async (req) => {
            const err = await a.submit(req);
            if (!err) {
              ui.toast(t("appr.saved"));
              setDlg(null);
            }
            return err;
          }}
        />
      )}
    </div>
  );
}

function DecisionDialog({ kind, feature, blocked, members, onClose, onSubmit }: {
  kind: DecisionKind;
  feature: string;
  blocked: boolean;
  members: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (r: { decision: DecisionKind; reason: string; conditions: string[]; delegate_to: string | null; override: boolean }) => Promise<string | null>;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [conds, setConds] = useState("");
  const [to, setTo] = useState("");
  const [override, setOverride] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsReason = kind !== "approved";
  const overrideNeeded = kind.startsWith("approved") && blocked;

  const submit = async () => {
    const conditions = conds.split("\n").map((c) => c.trim()).filter(Boolean);
    if ((needsReason || (overrideNeeded && override)) && !reason.trim()) return setErr(t("appr.needReason"));
    if (kind === "approved_with_conditions" && !conditions.length) return setErr(t("appr.needConditions"));
    if (kind === "delegated" && !to) return setErr(t("appr.needDelegate"));
    if (overrideNeeded && !override) return setErr(t("appr.needOverride"));
    setBusy(true);
    const e = await onSubmit({ decision: kind, reason, conditions, delegate_to: kind === "delegated" ? to : null, override: overrideNeeded && override });
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <Dialog
      title={t(`appr.dlg.${kind}` as Key, { feature })}
      description={t("appr.dlg.desc")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn primary" disabled={busy} onClick={submit}>{t("appr.confirm")}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>{t(needsReason || (overrideNeeded && override) ? "appr.reason" : "appr.reasonOptional")}</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus />
        </label>
        {kind === "approved_with_conditions" && (
          <label className="field">
            <span>{t("appr.conditionsLabel")}</span>
            <textarea rows={3} value={conds} onChange={(e) => setConds(e.target.value)} />
          </label>
        )}
        {kind === "delegated" && (
          <label className="field">
            <span>{t("appr.delegateTo")}</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">{t("appr.pick")}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        {overrideNeeded && (
          <label className="check-row">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> {t("appr.overrideLabel")}
          </label>
        )}
        {err && <p className="form-error" role="alert">{err}</p>}
      </div>
    </Dialog>
  );
}

export function HistoryTable({ entries, nameOf }: { entries: Entry[]; nameOf: (id: string) => string }) {
  const t = useT();
  const { lang } = useLang();
  if (!entries.length) return <p className="muted">{t("appr.historyEmpty")}</p>;
  return (
    <div className="table-wrap flush">
      <table className="data-table">
        <caption className="sr-only">{t("appr.historyTitle")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("appr.col.when")}</th>
            <th scope="col">{t("appr.col.feature")}</th>
            <th scope="col">{t("appr.col.decision")}</th>
            <th scope="col">{t("appr.col.who")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="nowrap">{fmtDate(e.at, lang)}</td>
              <td className="mono-title">{e.feature_key ?? e.feature}</td>
              <td>
                <span className={`dec-pill d-${e.decision}`}>{t(`appr.decision.${e.decision}` as Key)}</span>
                {e.decision === "delegated" && e.delegate_to && <span className="muted small"> → {nameOf(e.delegate_to)}</span>}
                {e.reason && <div className="muted small">{e.reason}</div>}
              </td>
              <td>{e.by.name} <span className="muted small">({e.by.via === "demo" ? t("appr.viaDemo") : e.by.via})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The log was edited or cut by hand: what it says cannot be trusted, and nothing new is recorded on top of it. */
export function ChainBroken({ chain }: { chain: { broken_at: string | null; reason: string } }) {
  const t = useT();
  return (
    <p className="appr-warn appr-chain-broken" role="alert">
      <TriangleAlert size={13} aria-hidden="true" /> {t("appr.chainBroken", { at: chain.broken_at ?? "?", reason: chain.reason })}
    </p>
  );
}
