export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
/** Modifier label for shortcuts: "⌘" on Apple devices, "Ctrl" elsewhere. */
export const mod = isMac ? "⌘" : "Ctrl";
