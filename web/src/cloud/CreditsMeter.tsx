// How many credits are left, as a bar that changes colour as the limit gets close (spec 020 FR-015).
import { useT } from "../i18n";
import type { Level } from "./creditsStore";

export function CreditsMeter({ balance, granted, level }: { balance: number; granted: number; level: Level }) {
  const t = useT();
  const max = Math.max(granted, balance, 1);
  const pct = Math.min(100, Math.round((balance / max) * 100));
  return (
    <div className={"meter cr-meter m-" + (level === "full" ? "full" : level === "near" ? "high" : "ok")}>
      <div className="meter-bar" role="progressbar" aria-label={t("credits.meter.label")} aria-valuemin={0} aria-valuemax={max} aria-valuenow={balance} aria-valuetext={`${balance} / ${max}`}>
        <span style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}
