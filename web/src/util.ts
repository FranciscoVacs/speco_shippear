import type { Finding, Severity } from "./types";

export const SEV_ORDER: Severity[] = ["blocker", "warning", "suggestion"];
export const SEV_LABEL: Record<Severity, string> = {
  blocker: "Bloqueante",
  warning: "Advertencia",
  suggestion: "Sugerencia",
};
export const SEV_LABEL_PLURAL: Record<Severity, string> = {
  blocker: "Bloqueantes",
  warning: "Advertencias",
  suggestion: "Sugerencias",
};
export const SEV_ICON: Record<Severity, string> = { blocker: "✕", warning: "!", suggestion: "i" };

export const FAMILIES = [
  { id: "COV", label: "Cobertura" },
  { id: "QUA", label: "Calidad" },
  { id: "CON", label: "Contradicción" },
  { id: "PRD", label: "Producto" },
] as const;

export const family = (f: Finding) => f.rule.slice(0, 3).toUpperCase();

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

export function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}
