// Cloud mode (spec 015): on only when the three public addresses are set at build time AND the page is not an exported report.
// Without them the app is the public demo: no network calls to any service, and the sign-in library is never loaded.
export const CLOUD = {
  url: (import.meta.env.VITE_CLOUD_URL ?? "").replace(/\/+$/, ""),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  /** where "Mejorar plan" sends the person once paid plans exist (optional: until then the request is only recorded) */
  upgradeUrl: import.meta.env.VITE_UPGRADE_URL ?? "",
};

const configured = __CLOUD_BUILD__ && !!(CLOUD.url && CLOUD.supabaseUrl && CLOUD.anonKey);

export function cloudEnabled(): boolean {
  if (!configured) return false;
  const emb = typeof window !== "undefined" ? window.__SPECREVIEW__ : null;
  return !(emb && emb.report);                      // an exported report is always self-contained
}
