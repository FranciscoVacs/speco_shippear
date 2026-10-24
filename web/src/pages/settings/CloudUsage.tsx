// Usage in cloud mode (specs 020 and 021): the real credits of the company, the referral link and the person's notices.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useT, useLang } from "../../i18n";
import type { Key } from "../../i18n";
import { currentTenant, useSession } from "../../shell/session";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";
import { useApi, type CreditsInfo, type Notice, type ReferralInfo } from "../../cloud/credits";
import { referralLink } from "../../cloud/referral";
import { CreditsMeter } from "../../cloud/CreditsMeter";
import { UpgradeButton } from "../../cloud/UpgradeButton";
import { daysUntil, refreshCredits } from "../../cloud/creditsStore";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}

export default function CloudUsage() {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const org = currentTenant(useSession());
  const credits = useApi<CreditsInfo>(`/api/orgs/${org.id}/credits`);
  const referral = useApi<ReferralInfo>("/api/referrals/me");
  const notices = useApi<Notice[]>("/api/notices");
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const c = credits.data;
  // the page and the top bar must agree: refresh the shared summary whenever this page loads
  useEffect(() => {
    void refreshCredits(org.id);
  }, [org.id, credits.data]);
  // "Invitar y ganar créditos" lands on the referral card
  useEffect(() => {
    if (referral.data && window.location.hash === "#referral") document.getElementById("ref-h")?.scrollIntoView({ block: "start" });
  }, [referral.data]);

  const copy = async (r: ReferralInfo) => {
    try {
      await navigator.clipboard.writeText(t("referral.message", { link: referralLink(r.code) }));
      ui.toast(t("referral.copied"));
    } catch {
      ui.toast(t("referral.copyFailed"));
    }
  };

  return (
    <>
      <PageHeader title={t("settings.usage")} description={t("credits.desc")} />
      <section className="card" aria-labelledby="credits-h">
        <div className="card-body">
          <h2 id="credits-h">{t("credits.title")}</h2>
          {credits.error?.status === 403 && <p className="muted">{t("credits.adminOnly")}</p>}
          {credits.error && credits.error.status !== 403 && <p className="form-error" role="alert">{credits.error.detail}</p>}
          {c && !c.metered && <p className="muted">{t("credits.unmetered")}</p>}
          {c?.metered && (
            <>
              <p>
                <strong data-testid="credit-balance">{t("credits.balance", { n: c.balance })}</strong>
              </p>
              <CreditsMeter balance={c.balance} granted={c.granted} level={c.level} />
              {c.level !== "ok" && <p className={"small cr-note cr-note-" + c.level} role="status">{t(c.level === "full" ? "credits.level.full" : "credits.level.near")}</p>}
              <p className="muted small" data-testid="usage-reset">{t("credits.panel.reset", { date: date(c.next_renewal), days: daysUntil(c.next_renewal) })}</p>
              <div className="cr-actions">
                <UpgradeButton source="usage" canUpgrade />
                {c.billing && <Link className="btn sm" to="/settings/billing" data-testid="view-plans">{t("credits.viewPlans")}</Link>}
              </div>
              {!c.free_plan && c.plan === "hobby" && <p className="muted" role="note">{t("credits.noFree")}</p>}
              {c.free_plan && c.balance === 0 && <p role="status">{t("credits.paused")}</p>}
              {c.grants.length > 0 && (
                <>
                  <h3>{t("credits.grants")}</h3>
                  <ul className="plain">
                    {c.grants.map((g, i) => (
                      <li key={i}>
                        {t(`credits.source.${g.source}` as Key)}: <span className="muted">{t("credits.left", { n: g.left, date: date(g.expires_at) })}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3>{t("credits.recent")}</h3>
              {c.recent.length === 0 ? (
                <p className="muted small">{t("credits.none")}</p>
              ) : (
                <ul className="plain">
                  {c.recent.map((r, i) => (
                    <li key={i}>
                      {t(`credits.kind.${r.kind}` as Key)}: <strong>{r.credits}</strong> <span className="muted small">{date(r.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
      <section className="card" aria-labelledby="ref-h">
        <div className="card-body">
          <h2 id="ref-h">{t("referral.title")}</h2>
          {referral.data && (
            <>
              <p className="muted">{t("referral.desc", { n: referral.data.reward })}</p>
              <div className="field">
                <span>{t("referral.link")}</span>
                <input readOnly value={referralLink(referral.data.code)} aria-label={t("referral.link")} onFocus={(e) => e.currentTarget.select()} data-testid="referral-link" />
              </div>
              <button type="button" className="btn primary" onClick={() => void copy(referral.data!)}>{t("referral.copy")}</button>
              <div className="stats" data-testid="referral-stats">
                <Stat label={t("referral.signedUp")} value={referral.data.signed_up} />
                <Stat label={t("referral.activated")} value={referral.data.activated} />
                <Stat label={t("referral.earned")} value={referral.data.credits_earned} />
                <Stat label={t("referral.capLeft")} value={referral.data.cap_left} />
              </div>
              {referral.data.held > 0 && <p role="status">{t("referral.held", { n: referral.data.held })}</p>}
              <p className="muted small">{t("referral.noNames")}</p>
            </>
          )}
          {referral.error && <p className="form-error" role="alert">{referral.error.detail}</p>}
        </div>
      </section>
      {notices.data && notices.data.length > 0 && (
        <section className="card" aria-labelledby="notices-h">
          <div className="card-body">
            <h2 id="notices-h">{t("notices.title")}</h2>
            <ul className="plain">
              {notices.data.map((n) => (
                <li key={n.id}>
                  {n.kind === "low_credits" || n.kind === "referral_reward" || n.kind === "payment_failed" || n.kind === "plan_ended"
                    ? t(`notice.${n.kind}` as Key, { n: Number(n.body.balance ?? n.body.credits ?? 0) })
                    : n.kind}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
