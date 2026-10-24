// The credits of the company, always in sight (spec 020 FR-015): a small pill in the top bar with the balance and a bar that warms up as the limit
// gets close. It opens a panel with when they reset, a way to upgrade and a way to earn more.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Coins } from "lucide-react";
import { useLang, useT } from "../i18n";
import { cloudEnabled } from "../cloud/config";
import { CreditsMeter } from "../cloud/CreditsMeter";
import { UpgradeButton } from "../cloud/UpgradeButton";
import { daysUntil, refreshCredits, useCredits } from "../cloud/creditsStore";
import { currentTenant, useSession } from "./session";
import { Popover, usePopover } from "./ui";

export function CreditsPill() {
  return cloudEnabled() ? <CloudPill /> : null;          // fixed per build: the demo has no credits
}

function CloudPill() {
  const t = useT();
  const orgId = currentTenant(useSession()).id;
  const { status } = useCredits();
  useEffect(() => {
    void refreshCredits(orgId);
    const onShow = () => document.visibilityState === "visible" && void refreshCredits(orgId);       // credits renew while the tab sleeps
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [orgId]);
  if (!status?.metered) return null;
  return (
    <Popover
      role="dialog"
      label={t("credits.panel.title")}
      placement="bottom-end"
      className="tb-credits"
      panelClassName="cr-panel"
      trigger={(p, open) => (
        <button {...p} type="button" className={`cr-pill cr-${status.level}` + (open ? " on" : "")} aria-label={t("credits.pill.label", { n: status.balance })} title={t("credits.panel.title")} data-testid="credits-pill" data-level={status.level}>
          <Coins size={14} aria-hidden="true" />
          <span className="cr-num">{status.balance}</span>
          <span className="cr-mini" aria-hidden="true"><span style={{ width: Math.min(100, Math.round((status.balance / Math.max(status.granted, status.balance, 1)) * 100)) + "%" }} /></span>
        </button>
      )}
    >
      <PillPanel />
    </Popover>
  );
}

function PillPanel() {
  const t = useT();
  const { lang } = useLang();
  const { close } = usePopover();
  const { status } = useCredits();
  if (!status) return null;
  const days = daysUntil(status.next_renewal);
  const date = new Date(status.next_renewal).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="cr-panel-body" data-testid="credits-panel">
      <h2>{t("credits.panel.title")}</h2>
      <p className="cr-big">
        <strong>{status.balance}</strong> <span className="muted">{t("credits.panel.of", { n: status.granted })}</span>
      </p>
      <CreditsMeter balance={status.balance} granted={status.granted} level={status.level} />
      {status.level !== "ok" && <p className={"small cr-note cr-note-" + status.level} role="status">{t(status.level === "full" ? "credits.level.full" : "credits.level.near")}</p>}
      <p className="small muted" data-testid="credits-reset">{t(days <= 1 ? "credits.panel.resetSoon" : "credits.panel.reset", { date, days })}</p>
      <div className="cr-actions">
        <UpgradeButton source="pill" canUpgrade={status.can_upgrade} />
        <Link to="/settings/usage#referral" className="btn sm" onClick={() => close(false)}>{t("credits.invite")}</Link>
        <Link to="/settings/usage" className="btn ghost sm" onClick={() => close(false)}>{t("credits.panel.detail")}</Link>
      </div>
      {!status.can_upgrade && <p className="small muted">{t("credits.panel.askAdmin")}</p>}
    </div>
  );
}
