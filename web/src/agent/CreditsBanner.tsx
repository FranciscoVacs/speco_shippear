// In the chat, above the composer (spec 020 FR-016): "you are reaching your limit" when less than a fifth is left, and "you reached your limit"
// when another answer cannot be paid (or the last one was refused). It says when it resets and offers the two ways out: upgrade or earn credits.
import { Link } from "react-router-dom";
import { OctagonAlert, TriangleAlert, X } from "lucide-react";
import { useLang, useT, type Key } from "../i18n";
import { cloudEnabled } from "../cloud/config";
import { dismissNear, useCredits } from "../cloud/creditsStore";
import { UpgradeButton } from "../cloud/UpgradeButton";

export function CreditsBanner({ variant }: { variant: "home" | "panel" }) {
  return cloudEnabled() ? <CloudBanner variant={variant} /> : null;
}

function CloudBanner({ variant }: { variant: "home" | "panel" }) {
  const t = useT();
  const { lang } = useLang();
  const { status, refusal, nearDismissed } = useCredits();
  if (!status?.metered || status.level === "ok" || (status.level === "near" && nearDismissed)) return null;
  const full = status.level === "full";
  const date = new Date(status.next_renewal).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const kind = !full ? "near" : refusal === "daily_cap" ? "daily" : refusal === "budget" ? "budget" : !status.free_plan ? "nofree" : "full";
  const title = t(`credits.banner.${kind}.title` as Key);
  const body = kind === "nofree" ? t("credits.noFree") : t(`credits.banner.${kind}.body` as Key, { n: status.balance, granted: status.granted, date });
  const Icon = full ? OctagonAlert : TriangleAlert;
  return (
    <div className={`cr-banner cr-banner-${status.level} cr-banner-${variant}`} role={full ? "alert" : "status"} data-testid="credits-banner" data-level={status.level} data-kind={kind}>
      <Icon size={16} className="cr-banner-ico" aria-hidden="true" />
      <div className="cr-banner-text">
        <strong>{title}</strong> <span>{body}</span>
        <div className="cr-actions">
          <UpgradeButton source={full ? "chat_limit" : "chat_warning"} canUpgrade={status.can_upgrade} />
          {kind !== "daily" && kind !== "budget" && <Link to="/settings/usage#referral" className="btn sm">{t("credits.invite")}</Link>}
          <Link to="/settings/usage" className="btn ghost sm">{t("credits.usage")}</Link>
          {!status.can_upgrade && <span className="small muted">{t("credits.panel.askAdmin")}</span>}
        </div>
      </div>
      {!full && (
        <button type="button" className="icon-btn ghost" onClick={dismissNear} aria-label={t("credits.banner.dismiss")} title={t("credits.banner.dismiss")}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
