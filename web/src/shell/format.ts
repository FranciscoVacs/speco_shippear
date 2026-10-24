import type { TFn } from "../i18n";

/** "5 min", "3 h", "2 d" style relative time, localised through the dictionary. */
export function fmtAgo(t: TFn, minutes: number | null): string {
  if (minutes == null) return t("time.never");
  if (minutes < 1) return t("time.now");
  if (minutes < 60) return t("time.min", { n: Math.round(minutes) });
  if (minutes < 60 * 24) return t("time.h", { n: Math.round(minutes / 60) });
  return t("time.d", { n: Math.round(minutes / (60 * 24)) });
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
