// Server-sent events parsing for POST /api/chat. Pure and dependency-free (erasable TypeScript only) so that
// scripts/test-sse.mjs can run it directly under Node.

export type ChatEvent = { delta: string } | { done: true } | { error: string } | { credits: Record<string, unknown> };

/** Incremental SSE parser: feed it text pieces (events may be split anywhere) and it returns the events completed so far. */
export class SseParser {
  private buf = "";

  push(text: string): ChatEvent[] {
    this.buf += text;
    const out: ChatEvent[] = [];
    // An event ends with a blank line; accept \n\n, \r\n\r\n and \r\r.
    for (;;) {
      const m = /\r\n\r\n|\n\n|\r\r/.exec(this.buf);
      if (!m) break;
      const block = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      const ev = parseBlock(block);
      if (ev) out.push(ev);
    }
    return out;
  }

  /** Stream ended: an unterminated trailing event is still delivered (a well-behaved server never sends one). */
  flush(): ChatEvent[] {
    const rest = this.buf.trim();
    this.buf = "";
    if (!rest) return [];
    const ev = parseBlock(rest);
    return ev ? [ev] : [];
  }
}

function parseBlock(block: string): ChatEvent | null {
  const data: string[] = [];
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line === "data" || line.startsWith("data:")) {
      const v = line.slice(5);
      data.push(v.startsWith(" ") ? v.slice(1) : v);
    }
  }
  if (data.length === 0) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(data.join("\n"));
  } catch {
    return null; // not JSON: ignore rather than break the stream
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.error === "string") return { error: o.error };
  if (typeof o.delta === "string") return { delta: o.delta };
  if (o.credits && typeof o.credits === "object") return { credits: o.credits as Record<string, unknown> };      // how the company stands after this answer (spec 020)
  if (o.done === true) return { done: true };
  return null;
}

/** Decodes a byte stream (chunks can split multi-byte UTF-8 characters) into chat events. */
export async function* readEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<ChatEvent, void> {
  const reader = body.getReader();
  const dec = new TextDecoder("utf-8");
  const parser = new SseParser();
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort);
  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const { value, done } = await reader.read();
      if (done) break;
      for (const ev of parser.push(dec.decode(value, { stream: true }))) yield ev;
    }
    if (signal?.aborted) throw abortError();
    for (const ev of parser.push(dec.decode())) yield ev;
    for (const ev of parser.flush()) yield ev;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* a pending read after cancel: ignore */
    }
  }
}

export function abortError(): Error {
  const e = new Error("Cancelado");
  e.name = "AbortError";
  return e;
}
