// State of the right-hand agent panel. Stage 2 can reuse it: `const { open, toggle, setOpen, overlay } = usePanel()`.
//  - On wide screens (>= 1100px) the panel is docked; its open/closed state is persisted ("sr-panel").
//    First visit: open from 1200px up, closed below.
//  - On narrow screens it is an overlay sheet; that state is transient (never persisted, closed on navigation).
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export const PANEL_KEY = "sr-panel";
const OVERLAY_Q = "(max-width: 1099px)";

function initialDocked(): boolean {
  const v = storage.get(PANEL_KEY);
  if (v === "1") return true;
  if (v === "0") return false;
  return typeof window !== "undefined" && window.innerWidth >= 1200;
}

let docked = initialDocked();
let sheet = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const isOverlay = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(OVERLAY_Q).matches;
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia(OVERLAY_Q).addEventListener?.("change", () => {
    sheet = false;
    emit();
  });
}

export function setPanelOpen(open: boolean) {
  if (isOverlay()) sheet = open;
  else {
    docked = open;
    storage.set(PANEL_KEY, open ? "1" : "0");
  }
  emit();
}
export const togglePanel = () => setPanelOpen(!(isOverlay() ? sheet : docked));
export const closePanelSheet = () => {
  if (sheet) {
    sheet = false;
    emit();
  }
};

export interface PanelState {
  /** effective: docked state on wide screens, sheet state on narrow ones */
  open: boolean;
  /** true when the panel is an overlay sheet (narrow screens) */
  overlay: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

export function usePanel(): PanelState {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => `${docked ? 1 : 0}${sheet ? 1 : 0}${isOverlay() ? 1 : 0}`,
    () => "000",
  );
  const overlay = snap[2] === "1";
  return { open: overlay ? snap[1] === "1" : snap[0] === "1", overlay, toggle: togglePanel, setOpen: setPanelOpen };
}
