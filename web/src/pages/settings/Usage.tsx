import { Download } from "lucide-react";
import { useLang, useT } from "../../i18n";
import { PLAN_LIMITS, currentTenant, useSession } from "../../shell/session";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";
import { cloudEnabled } from "../../cloud/config";
import CloudUsage from "./CloudUsage";

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const t = useT();
  const { lang } = useLang();
  const pct = Math.min(100, Math.round((used / max) * 100));
  const level = pct >= 100 ? "full" : pct >= 80 ? "high" : "ok";
  const nf = new Intl.NumberFormat(lang);
  return (
    <div className={"meter m-" + level}>
      <div className="meter-head">
        <span>{label}</span>
        <span className="small">
          {nf.format(used)} / {nf.format(max)} <span className="muted">({pct}%)</span>
        </span>
      </div>
      <div className="meter-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-valuetext={`${used} / ${max}`}>
        <span style={{ width: pct + "%" }} />
      </div>
      {level !== "ok" && <p className="small meter-note">{level === "full" ? t("usage.full") : t("usage.near")}</p>}
    </div>
  );
}

const INVOICES = [
  { id: "INV-2026-010", date: "2026-10-01", amount: 29 },
  { id: "INV-2026-009", date: "2026-09-01", amount: 29 },
  { id: "INV-2026-008", date: "2026-08-01", amount: 29 },
  { id: "INV-2026-007", date: "2026-07-01", amount: 29 },
];

function DemoUsage() {
  const t = useT();
  const { lang } = useLang();
  const s = useSession();
  const ui = useUI();
  const cur = currentTenant(s);
  const lim = PLAN_LIMITS[cur.plan];
  const price = (n: number) => new Intl.NumberFormat(lang, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const top = cur.plan === "Team";
  return (
    <>
      <PageHeader title={t("settings.usage")} description={t("usage.desc")} demo />
      <section className="card plan-card" aria-labelledby="plan-h">
        <div className="card-body plan-row">
          <div>
            <h2 id="plan-h">
              {t("usage.plan")} <span className="plan-badge">{cur.plan}</span>
            </h2>
            <p className="muted">{lim.price === 0 ? t("usage.free") : t("usage.price", { price: price(lim.price) })}</p>
            <p className="muted small">{t("usage.renews", { date: date("2026-11-01") })}</p>
          </div>
          <button type="button" className="btn primary" onClick={() => ui.toast(t("usage.upgradeToast"))}>
            {top ? t("usage.contact") : t("usage.upgrade")}
          </button>
        </div>
      </section>
      <section className="card" aria-labelledby="meters-h">
        <div className="card-body">
          <h2 id="meters-h">{t("usage.thisPeriod")}</h2>
          <div className="meters">
            <Meter label={t("usage.reviews")} used={cur.usage.reviews} max={lim.reviews} />
            <Meter label={t("usage.messages")} used={cur.usage.messages} max={lim.messages} />
            <Meter label={t("usage.seats")} used={Math.min(s.members.length, lim.seats)} max={lim.seats} />
          </div>
        </div>
      </section>
      <section className="card" aria-labelledby="inv-h">
        <div className="card-body tight">
          <h2 id="inv-h">{t("usage.invoices")}</h2>
        </div>
        <div className="table-wrap flush">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("usage.invoice")}</th>
                <th scope="col">{t("usage.date")}</th>
                <th scope="col">{t("usage.amount")}</th>
                <th scope="col">{t("members.status")}</th>
                <th scope="col">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(lim.price === 0 ? [] : INVOICES).map((i) => (
                <tr key={i.id}>
                  <td>
                    <code>{i.id}</code>
                  </td>
                  <td>{date(i.date)}</td>
                  <td>{price(lim.price)}</td>
                  <td>
                    <span className="status ok">
                      <span className="status-dot" aria-hidden="true" /> {t("usage.paid")}
                    </span>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn sm" onClick={() => ui.toast(t("usage.downloadToast", { id: i.id }))} aria-label={`${t("usage.download")} ${i.id}`}>
                      <Download size={13} aria-hidden="true" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
              {lim.price === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {t("usage.noInvoices")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** In cloud mode the real credits and referrals (specs 020 and 021); the public demo keeps its labeled simulation. */
export default function Usage() {
  return cloudEnabled() ? <CloudUsage /> : <DemoUsage />;
}
