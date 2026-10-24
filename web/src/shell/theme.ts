import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "sr-theme";

function read(): ThemePref {
  const v = storage.get(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

let pref: ThemePref = read();
const listeners = new Set<() => void>();
const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/** "system" removes data-theme so the prefers-color-scheme rules of styles.css apply; light/dark force it. */
function apply() {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}
export function initTheme() {
  pref = read();
  apply();
}
mq?.addEventListener?.("change", () => listeners.forEach((l) => l()));

export function setThemePref(p: ThemePref) {
  pref = p;
  storage.set(THEME_KEY, p);
  apply();
  listeners.forEach((l) => l());
}
const resolved = (): "light" | "dark" => (pref === "system" ? (mq?.matches ? "dark" : "light") : pref);

export function useTheme() {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pref + "|" + resolved(),
    () => "system|light",
  );
  const [p, r] = snap.split("|") as [ThemePref, "light" | "dark"];
  return { pref: p, resolved: r, setPref: setThemePref, toggle: () => setThemePref(resolved() === "dark" ? "light" : "dark") };
}
