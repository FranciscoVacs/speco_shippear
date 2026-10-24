// Unit-style checks for the SSE parser and the /api/chat client: node scripts/test-sse.mjs
// Bundles src/assistant/chat.ts with esbuild (type-only imports of @assistant-ui/react are erased), so no browser is needed.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "sr-sse-"));
const out = join(dir, "chat.mjs");
await build({ entryPoints: ["src/assistant/chat.ts"], bundle: true, format: "esm", platform: "node", outfile: out, external: ["@assistant-ui/react"], logLevel: "silent" });
const { streamChat, toHistory, ChatError } = await import(pathToFileURL(out).href);
const { SseParser, readEvents } = await import(pathToFileURL((await bundle("src/assistant/sse.ts", join(dir, "sse.mjs")))).href);

async function bundle(entry, outfile) {
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
  return outfile;
}

const fails = [];
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
const enc = new TextEncoder();
const stream = (chunks) => new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(x); c.close(); } });
const collect = async (it) => { const a = []; for await (const e of it) a.push(e); return a; };

const wire = 'data: {"delta": "Hola "}\n\ndata: {"delta": "mundo á ñ 😀"}\n\n: keep-alive\n\ndata: {"done": true}\n\n';

// 1. whole payload
{
  const p = new SseParser();
  const ev = p.push(wire);
  check(ev.length === 3 && ev[0].delta === "Hola " && ev[2].done === true, "parses a whole payload (delta, delta, done; comment ignored)");
}
// 2. split at every possible character position (text level)
{
  let ok = true;
  for (let i = 1; i < wire.length; i++) {
    const p = new SseParser();
    const ev = [...p.push(wire.slice(0, i)), ...p.push(wire.slice(i))];
    if (JSON.stringify(ev) !== JSON.stringify(new SseParser().push(wire))) { ok = false; console.log("  differs at split", i); break; }
  }
  check(ok, "same events when split at every character boundary");
}
// 3. split at every byte position (multi-byte UTF-8 cut in half)
{
  const bytes = enc.encode(wire);
  let ok = true;
  for (let i = 1; i < bytes.length; i++) {
    const ev = await collect(readEvents(stream([bytes.slice(0, i), bytes.slice(i)])));
    const text = ev.filter((e) => "delta" in e).map((e) => e.delta).join("");
    if (text !== "Hola mundo á ñ 😀" || !ev.at(-1).done) { ok = false; console.log("  broke at byte split", i, JSON.stringify(text)); break; }
  }
  check(ok, "byte-level split (inside á, ñ and the emoji) never corrupts text");
}
// 4. one byte at a time + CRLF framing
{
  const crlf = wire.replace(/\n/g, "\r\n");
  const bytes = enc.encode(crlf);
  const ev = await collect(readEvents(stream([...bytes].map((b) => new Uint8Array([b])))));
  check(ev.length === 3 && ev[1].delta.startsWith("mundo"), "1-byte chunks with CRLF line endings");
}
// 5. error event and invalid JSON tolerance
{
  const ev = new SseParser().push('data: {not json}\n\ndata: {"error": "El proveedor del modelo falló (X)."}\n\n');
  check(ev.length === 1 && ev[0].error.includes("proveedor"), "invalid JSON ignored; error event surfaced");
}
// 6. unterminated trailing event is flushed
{
  const p = new SseParser();
  const a = p.push('data: {"delta": "fin"}');
  const b = p.flush();
  check(a.length === 0 && b.length === 1 && b[0].delta === "fin", "unterminated last event delivered on flush");
}

// streamChat with a fake fetch
const resp = (body, init) => new Response(body, init);
const sseResponse = (chunks) => resp(stream(chunks.map((c) => enc.encode(c))), { status: 200, headers: { "Content-Type": "text/event-stream" } });
{
  let seen;
  const f = async (url, init) => { seen = { url, init }; return sseResponse(['data: {"delta": "a"}\n', '\ndata: {"del', 'ta": "b"}\n\ndata: {"done": true}\n\n']); };
  const ev = await collect(streamChat({ feature: "f1", messages: [{ role: "user", content: "x" }], focus: { rule: "QUA002", ids: ["FR-006"] } }, undefined, f));
  const body = JSON.parse(seen.init.body);
  check(ev.map((e) => e.delta ?? (e.done ? "#" : "?")).join("") === "ab#", "streamChat: events split across chunks are reassembled");
  check(seen.url === "/api/chat" && seen.init.method === "POST" && seen.init.headers["Content-Type"] === "application/json", "streamChat: POST /api/chat with JSON content type");
  check(body.feature === "f1" && body.focus.rule === "QUA002" && body.messages[0].content === "x", "streamChat: sends feature, messages and focus");
}
{
  const f = async () => resp(JSON.stringify({ error: "El asistente no está configurado", code: "assistant_unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  let err;
  try { await collect(streamChat({ feature: "f", messages: [] }, undefined, f)); } catch (e) { err = e; }
  check(err instanceof ChatError && err.code === "assistant_unavailable" && /--llm/.test(err.message), "JSON error before the stream -> readable ChatError");
}
{
  const f = async () => { throw new TypeError("fetch failed"); };
  let err;
  try { await collect(streamChat({ feature: "f", messages: [] }, undefined, f)); } catch (e) { err = e; }
  check(err instanceof ChatError && err.code === "network", "network failure -> readable ChatError");
}
{
  const ac = new AbortController();
  const f = async (_u, init) => {
    const body = new ReadableStream({
      start(c) { c.enqueue(enc.encode('data: {"delta": "x"}\n\n')); init.signal.addEventListener("abort", () => c.error(Object.assign(new Error("aborted"), { name: "AbortError" }))); },
    });
    return resp(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  let err; const got = [];
  try { for await (const e of streamChat({ feature: "f", messages: [] }, ac.signal, f)) { got.push(e); ac.abort(); } } catch (e) { err = e; }
  check(got.length === 1 && err && err.name === "AbortError", "AbortSignal stops the stream with an AbortError");
}
// toHistory: skips empty/failed assistant turns
{
  const msgs = [
    { role: "user", content: [{ type: "text", text: "q1" }] },
    { role: "assistant", content: [{ type: "text", text: "" }], status: { type: "incomplete", reason: "error", error: "x" } },
    { role: "user", content: [{ type: "text", text: "q2" }] },
    { role: "assistant", content: [{ type: "text", text: "a2" }], status: { type: "complete", reason: "stop" } },
    { role: "user", content: [{ type: "text", text: "q3" }] },
  ];
  const h = toHistory(msgs);
  check(h.length === 4 && h[1].content === "q2" && h.at(-1).role === "user", "toHistory drops failed/empty assistant turns, keeps order");
}

console.log(fails.length ? "FAILED: " + fails.length : "ALL PASS");
process.exit(fails.length ? 1 : 0);
