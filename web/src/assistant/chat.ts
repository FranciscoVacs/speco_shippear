import type { ChatModelAdapter, ThreadMessage } from "@assistant-ui/react";
import type { Focus } from "../types";
import { readEvents, abortError, type ChatEvent } from "./sse";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  feature: string;
  messages: ChatMessage[];
  focus?: Focus;
  /** per-turn choice, sent only when the server advertised models */
  model?: string;
  effort?: "low" | "medium" | "high";
}

/** A failure the user should read: already phrased in Spanish. */
export class ChatError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

/** Where a request goes. The local server takes it at /api/chat; in cloud mode the app points it at the company's assistant with the person's access. */
export type ChatTarget = { url: string; headers: Record<string, string>; body: unknown };
let transport: ((req: ChatRequest) => Promise<ChatTarget>) | null = null;
export const setChatTransport = (t: typeof transport): void => {
  transport = t;
};

const FRIENDLY: Record<string, string> = {
  no_credits: "No quedan créditos para el asistente. Se renuevan a principio de mes; revisar, decidir y aprobar siguen funcionando. Invitar a alguien suma créditos.",
  daily_cap: "Esta empresa llegó a su límite diario de uso del modelo. Se reinicia mañana.",
  budget: "El uso del modelo está en pausa para las empresas gratuitas por ahora. Todo lo que no usa un modelo sigue funcionando.",
  signed_out: "Tu sesión venció. Volvé a entrar para seguir.",
  assistant_unavailable: "El asistente no está configurado en este servidor. Reinicialo con --llm anthropic (y ANTHROPIC_API_KEY) o con --llm demo.",
  forbidden: "El servidor rechazó el pedido (solo atiende conexiones locales desde 127.0.0.1 o localhost).",
  not_found: "El servidor no reconoce esta feature. Recargá la página para actualizar la lista.",
};

async function errorFromResponse(r: Response): Promise<ChatError> {
  let msg = "";
  let code = "";
  try {
    const j = (await r.json()) as { error?: unknown; code?: unknown };
    msg = typeof j.error === "string" ? j.error : "";
    code = typeof j.code === "string" ? j.code : "";
  } catch {
    /* not JSON */
  }
  const friendly = FRIENDLY[code];
  return new ChatError(friendly ?? (msg || `El servidor respondió con un error (HTTP ${r.status}).`), code || `http_${r.status}`);
}

/** POST /api/chat and yield its SSE events. Throws ChatError for pre-stream failures; AbortError when aborted. */
export async function* streamChat(req: ChatRequest, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): AsyncGenerator<ChatEvent, void> {
  let r: Response;
  let target: ChatTarget = { url: "/api/chat", headers: {}, body: req };
  if (transport) {
    try {
      target = await transport(req);
    } catch {
      throw new ChatError(FRIENDLY.signed_out, "signed_out");
    }
  }
  try {
    r = await fetchImpl(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...target.headers },
      body: JSON.stringify(target.body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw abortError();
    throw new ChatError("No se pudo conectar con el servidor local. ¿Sigue corriendo `specreview <repo> --serve`?", "network");
  }
  if (!r.ok) throw await errorFromResponse(r);
  if (!r.body) throw new ChatError("El servidor no devolvió una respuesta en streaming.", "no_body");
  yield* readEvents(r.body, signal);
}

/** Text of a thread message (text parts only). */
function textOf(m: ThreadMessage): string {
  return m.content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

/** Full history for the server: user/assistant text, skipping empty and failed turns. */
export function toHistory(messages: readonly ThreadMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (m.role === "assistant" && m.status?.type === "incomplete" && m.status.reason === "error") continue;
    const content = textOf(m);
    if (content) out.push({ role: m.role, content });
  }
  return out;
}

export interface ChatContext {
  getFeature: () => string;
  /** focus to send with this request (not cleared until the request succeeds, so a retry keeps it) */
  getFocus: () => Focus | null;
  /** the model and effort picked in the composer, or null when the server offers no choice */
  getChoice?: () => { model: string; effort?: "low" | "medium" | "high" } | null;
  onSuccess: () => void;
  /** the service says how many credits are left after each answer (cloud mode) */
  onCredits?: (credits: Record<string, unknown>) => void;
  /** a turn was refused for lack of credits: no_credits, daily_cap or budget (cloud mode) */
  onRefusal?: (code: string) => void;
}

export function createChatAdapter(ctx: ChatContext): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const req: ChatRequest = { feature: ctx.getFeature(), messages: toHistory(messages) };
      const focus = ctx.getFocus();
      if (focus) req.focus = focus;
      const choice = ctx.getChoice?.();
      if (choice) Object.assign(req, choice);
      let text = "";
      const partial = () => (text ? [{ type: "text" as const, text }] : []);
      let finished = false;
      try {
        for await (const ev of streamChat(req, abortSignal)) {
          if ("delta" in ev) {
            text += ev.delta;
            yield { content: partial() };
          } else if ("error" in ev) {
            yield { content: partial(), status: { type: "incomplete", reason: "error", error: ev.error } };
            return;
          } else if ("credits" in ev) {
            ctx.onCredits?.(ev.credits);
          } else {
            finished = true;
            break;
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") throw e; // the library marks the message as cancelled
        if (e instanceof ChatError && (e.code === "no_credits" || e.code === "daily_cap" || e.code === "budget")) ctx.onRefusal?.(e.code);
        const msg = e instanceof ChatError ? e.message : "Ocurrió un error inesperado al leer la respuesta.";
        yield { content: partial(), status: { type: "incomplete", reason: "error", error: msg } };
        return;
      }
      if (!finished) {
        yield { content: partial(), status: { type: "incomplete", reason: "error", error: "La conexión se cortó antes de terminar la respuesta." } };
        return;
      }
      ctx.onSuccess();
      yield { content: partial(), status: { type: "complete", reason: "stop" } };
    },
  };
}
