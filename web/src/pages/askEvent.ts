import type { Focus } from "../types";

/** Event the "Preguntar al asistente" button fires so the agent can pick up the question. */
export const ASK_EVENT = "sr:ask";
export interface AskDetail {
  text: string;
  focus: Focus;
  featureId: string;
}
