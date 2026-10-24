import { CheckCircle2, CircleAlert, Hand, Wrench } from "lucide-react";
import { useT, type Key } from "../i18n";
import type { Risk, Verdict } from "../types";

const ICON = { ready: CheckCircle2, needs_work: Wrench, blocked: CircleAlert, needs_decision: Hand } as const;

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" | "lg" }) {
  const t = useT();
  const Icon = ICON[verdict];
  return (
    <span className={`verdict v-${verdict} vs-${size}`}>
      <Icon size={size === "lg" ? 18 : 14} aria-hidden="true" />
      {t(`verdict.${verdict}` as Key)}
    </span>
  );
}

export const RISKS: Risk[] = ["intent_drift", "context_decay", "unverifiable"];

/** Plain-language consequence of a rule for someone who does not read rule ids. Falls back to the rule's own name. */
export function impactKey(rule: string): Key | null {
  const k = `impact.${rule}` as Key;
  return /^[A-Z]{3}\d{3}$/.test(rule) ? k : null;
}

/** Translate a key that has a ".one" variant for n === 1 (the i18n layer has no plural rules). */
export function tn(t: (k: Key, v?: Record<string, string | number>) => string, key: string, n: number, vars: Record<string, string | number> = {}): string {
  return t((n === 1 ? `${key}.one` : key) as Key, { n, ...vars });
}
