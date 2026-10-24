// Plan and billing in cloud mode (spec 024): the plans, the change of plan, what is scheduled and the invoices. The payment is simulated until a real
// provider exists, and every screen that shows money says so (FR-012). The service decides everything; this page only asks and shows.
import { useState } from "react";
import { useLang, useT } from "../../i18n";
import type { Key } from "../../i18n";
import { currentTenant, useSession } from "../../shell/session";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";
import { ApiError } from "../../cloud/api";
import { cloudEnabled } from "../../cloud/config";
import { useApi } from "../../cloud/credits";
import { changePlan, money, type BillingInfo, type PlanId, type PlanInfo, type PlansInfo } from "../../cloud/billing";
import { refreshCredits } from "../../cloud/creditsStore";
import { refreshOrgs } from "../../cloud/orgs";
import { UpgradeButton } from "../../cloud/UpgradeButton";

export default function Billing() {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const org = currentTenant(useSession());
  const live = cloudEnabled();
  const info = useApi<BillingInfo>(live ? `/api/orgs/${org.id}/billing` : null);
  const list = useApi<PlansInfo>(live ? "/api/billing/plans" : null);
  const [confirming, setConfirming] = useState<PlanId | null>(null);
  const [decline, setDecline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const b = info.data;
  const plans = list.data?.plans ?? [];
  const planName = (p: PlanId) => t(`billing.plan.${p}` as Key);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const current = plans.find((p) => p.plan === b?.plan);
  const sub = b?.subscription ?? null;

  const apply = async (plan: PlanId) => {
    setBusy(true);
    setError(null);
    try {
      const r = await changePlan(org.id, plan, decline ? "decline" : undefined);
      ui.toast(t(`billing.done.${r.result}` as Key, { plan: planName(plan) }));
      setConfirming(null);
      setDecline(false);
      info.reload();
      void refreshCredits(org.id);                       // the top bar, the chat and the usage page now agree with the new plan
      void refreshOrgs();                                // and so does the plan badge of the workspace switcher
    } catch (e) {
      setError(e instanceof ApiError && e.code === "payment_declined" ? t("billing.error.declined") : t("billing.error.failed"));
    } finally {
      setBusy(false);
    }
  };

  const action = (p: PlanInfo) => {
    if (!current || p.plan === current.plan) return null;
    if (p.rank > current.rank) {
      return <button type="button" className="btn primary" onClick={() => { setConfirming(p.plan); setError(null); }} data-testid={"choose-" + p.plan}>{t("billing.upgradeTo", { plan: planName(p.plan) })}</button>;
    }
    return (
      <button type="button" className="btn" disabled={busy || sub?.scheduled_plan === p.plan} onClick={() => void apply(p.plan)} data-testid={"choose-" + p.plan}>
        {p.plan === "hobby" ? t("billing.cancel") : t("billing.downgradeTo", { plan: planName(p.plan) })}
      </button>
    );
  };

  const confirm = confirming ? plans.find((p) => p.plan === confirming) : undefined;

  return (
    <>
      <PageHeader title={t("billing.title")} description={t("billing.desc")} />
      {!live && <p className="muted">{t("billing.disabled")}</p>}
      {info.error?.status === 403 && <p className="muted">{t("billing.adminOnly")}</p>}
      {info.error && info.error.status !== 403 && <p className="form-error" role="alert">{info.error.detail}</p>}
      {b && (
        <>
          {b.simulated && <p className="notice-sim" role="note" data-testid="billing-simulated">{t("billing.simulated")}</p>}
          {!b.enabled && (
            <section className="card">
              <div className="card-body plan-row">
                <p className="muted">{t("billing.disabled")}</p>
                <UpgradeButton source="usage" canUpgrade />
              </div>
            </section>
          )}
          <section className="card plan-card" aria-labelledby="bplan-h">
            <div className="card-body">
              <h2 id="bplan-h">
                {t("billing.current")} <span className="plan-badge" data-testid="billing-plan">{planName(b.plan)}</span>
              </h2>
              {current && <p className="muted">{current.price_cents === 0 ? t("billing.free") : t("billing.price", { price: money(current.price_cents, current.currency, lang) })}</p>}
              {sub && <p className="muted small" data-testid="billing-renews">{t("billing.renews", { date: date(sub.period_end) })}</p>}
              {sub?.status === "past_due" && <p className="small cr-note cr-note-full" role="status">{t("billing.pastDue")}</p>}
              {sub?.scheduled_plan && (
                <p role="status" data-testid="billing-scheduled">
                  {t(sub.scheduled_plan === "hobby" ? "billing.scheduledCancel" : "billing.scheduled", { date: date(sub.period_end), plan: planName(sub.scheduled_plan) })}{" "}
                  <button type="button" className="btn sm" disabled={busy} onClick={() => void apply(sub.plan)} data-testid="billing-undo">{t("billing.undo")}</button>
                </p>
              )}
            </div>
          </section>
          {b.enabled && (
            <section className="card" aria-labelledby="bplans-h">
              <div className="card-body">
                <h2 id="bplans-h">{t("billing.plans")}</h2>
                <div className="plans-grid">
                  {plans.map((p) => (
                    <div key={p.plan} className={"plan-opt" + (p.plan === b.plan ? " is-current" : "")} data-testid={"plan-" + p.plan}>
                      <h3>{planName(p.plan)}</h3>
                      <p className="plan-price">{p.price_cents === 0 ? t("billing.free") : t("billing.price", { price: money(p.price_cents, p.currency, lang) })}</p>
                      <ul className="plain small">
                        <li>{p.plan === "hobby" ? t("billing.freeCredits") : t("billing.credits", { n: p.period_credits })}</li>
                        <li>{t("billing.daily", { n: p.daily_cap })}</li>
                      </ul>
                      {p.plan === b.plan ? <span className="muted small">{t("billing.current")}</span> : action(p)}
                    </div>
                  ))}
                </div>
                {confirm && (
                  <div className="plan-confirm" role="group" aria-label={t("billing.confirm.title", { plan: planName(confirm.plan) })} data-testid="billing-confirm">
                    <h3>{t("billing.confirm.title", { plan: planName(confirm.plan) })}</h3>
                    <p>{t("billing.confirm.pay", { amount: money(b.quotes[confirm.plan] ?? confirm.price_cents, confirm.currency, lang), n: confirm.period_credits })}</p>
                    {b.simulated && (
                      <>
                        <p className="muted small">{t("billing.simulated")}</p>
                        <label className="check small">
                          <input type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} data-testid="billing-decline" /> {t("billing.simDecline")}
                        </label>
                      </>
                    )}
                    {error && <p className="form-error" role="alert" data-testid="billing-error">{error}</p>}
                    <div className="cr-actions">
                      <button type="button" className="btn primary" disabled={busy} onClick={() => void apply(confirm.plan)} data-testid="billing-pay">{t("billing.confirm.go")}</button>
                      <button type="button" className="btn" disabled={busy} onClick={() => { setConfirming(null); setError(null); }}>{t("billing.confirm.back")}</button>
                    </div>
                  </div>
                )}
                {!confirm && error && <p className="form-error" role="alert">{error}</p>}
              </div>
            </section>
          )}
          <section className="card" aria-labelledby="binv-h">
            <div className="card-body tight">
              <h2 id="binv-h">{t("billing.invoices")}</h2>
            </div>
            <div className="table-wrap flush">
              <table className="data-table" data-testid="billing-invoices">
                <thead>
                  <tr>
                    <th scope="col">{t("billing.invoice.number")}</th>
                    <th scope="col">{t("billing.invoice.date")}</th>
                    <th scope="col">{t("billing.invoice.detail")}</th>
                    <th scope="col">{t("billing.invoice.amount")}</th>
                    <th scope="col">{t("billing.invoice.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {b.invoices.map((i) => (
                    <tr key={i.id}>
                      <td><code>{i.number}</code></td>
                      <td>{date(i.created_at)}</td>
                      <td>{t(`billing.invoice.${i.kind}` as Key, { plan: planName(i.plan) })}</td>
                      <td>{money(i.amount_cents, i.currency, lang)}</td>
                      <td>
                        <span className={"status " + (i.status === "paid" ? "ok" : "revoked-s")}>
                          <span className="status-dot" aria-hidden="true" /> {t(i.status === "paid" ? "billing.invoice.paid" : "billing.invoice.failed")}
                        </span>
                        {i.simulated && <span className="muted small"> · {t("billing.invoice.sim")}</span>}
                      </td>
                    </tr>
                  ))}
                  {b.invoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">{t("billing.invoice.none")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
