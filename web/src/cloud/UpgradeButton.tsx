// "Mejorar plan". The click records that an owner or admin wants it (so we can measure the willingness to pay). Where billing is on (spec 024)
// it then takes them to the plans; where it is not, it tells them paid plans are not open and, when an address is configured, opens it.
// Only people who can upgrade see the button.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpCircle } from "lucide-react";
import { useT } from "../i18n";
import { useUI } from "../shell/UIContext";
import { getSession, currentTenant } from "../shell/session";
import { api } from "./api";
import { CLOUD } from "./config";
import { useCredits } from "./creditsStore";

export type UpgradeSource = "pill" | "chat_warning" | "chat_limit" | "usage";

export function UpgradeButton({ source, canUpgrade, className = "btn primary sm" }: { source: UpgradeSource; canUpgrade: boolean; className?: string }) {
  const t = useT();
  const ui = useUI();
  const nav = useNavigate();
  const { status } = useCredits();
  const [busy, setBusy] = useState(false);
  if (!canUpgrade) return null;
  const click = async () => {
    setBusy(true);
    try {
      await api(`/api/orgs/${currentTenant(getSession()).id}/upgrade-interest`, { body: { source } });
      if (status?.billing) nav("/settings/billing");
      else {
        ui.toast(t("credits.upgrade.sent"));
        if (CLOUD.upgradeUrl) window.open(CLOUD.upgradeUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      ui.toast(t("credits.upgrade.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={() => void click()} disabled={busy} data-testid={"upgrade-" + source}>
      <ArrowUpCircle size={14} aria-hidden="true" /> {t("credits.upgrade")}
    </button>
  );
}
