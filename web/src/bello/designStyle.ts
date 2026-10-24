import type { Spec } from "./data.js";

/** The fixed visual pattern every Bello spec design follows, so generated screens match the seeded ones. */
export const DESIGN_STYLE = [
  "Photorealistic product mockup of a single modern black smartphone, front view, perfectly centered, upright, with a soft natural drop shadow.",
  "Flat pale mint green background (#DDF3EA), nothing else in the scene: no hands, no props, no text outside the phone.",
  "The screen shows a clean light-theme mobile banking app for the Argentine fintech «bello»: lowercase green wordmark «bello» top-left (#12946A),",
  "status bar showing 9:41, very light gray background, white rounded cards with subtle shadows, a large bold dark screen title,",
  "Inter-style sans-serif typography, generous spacing, emerald green (#12946A) primary buttons and accents, amber only for warnings.",
  "All interface text in Spanish (Argentina), short and legible, amounts formatted like $ 12.430. Portrait framing.",
].join(" ");

export const DESIGN_PATTERN_POINTS = ["Smartphone frontal centrado", "Fondo verde menta", "Marca «bello» y verde #12946A", "Tema claro, tarjetas blancas", "Textos en español"];

export function designPrompt(spec: Pick<Spec, "title" | "ears">, note?: string): string {
  return [
    DESIGN_STYLE,
    `The screen implements this functional spec: «${spec.title}». Requirement (EARS): ${spec.ears}`,
    "Show the main UI state a user sees for this behavior.",
    note ? `Additional design direction from the team: ${note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
