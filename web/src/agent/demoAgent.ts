// Engine 1 (FR-018): the simulated agent that runs in the browser (src/agent/demo/*, pure logic) mapped to assistant-ui
// message parts: text parts and tool-call parts that carry the tool result, which the tool cards render.
import type { ChatModelAdapter, ChatModelRunResult, ThreadAssistantMessagePart } from "@assistant-ui/react";
import type { Bundle, Focus } from "../types";
import type { Loader } from "../data";
import { toHistory } from "../assistant/chat";
import { abortError } from "../assistant/sse";
import { demoAgent } from "./demo/engine";
import type { ChatMessage, DemoSource, Lang } from "./demo/types";
import { agent, effectiveFeature, effectiveRule, env, getAgentState, getLoader } from "./store";

const bundles = new WeakMap<Loader, Map<string, Promise<Bundle>>>();
/** The simulated agent reads the same data as the pages: the app's loader (samples, local server or embedded report). */
export function sourceFrom(loader: Loader): DemoSource {
  let cache = bundles.get(loader);
  if (!cache) bundles.set(loader, (cache = new Map()));
  const load = (id: string) => {
    let p = cache.get(id);
    if (!p) cache.set(id, (p = loader.load(id)));
    return p;
  };
  return {
    features: async () => loader.features,
    report: async (id) => (await load(id)).report,
    sources: async (id) => (await load(id)).sources,
    rules: async () => loader.rules,
  };
}

const L = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);

/** The engine understands intents, not our UI sentences: translate the focused question and the "most serious finding" chip. */
async function engineText(text: string, focus: Focus | null, lang: Lang, feature: string | null, src: DemoSource): Promise<string> {
  if (focus) {
    const req = focus.ids.find((i) => /^FR-\d+$/.test(i));
    const where = feature ? L(lang, ` en ${feature}`, ` in ${feature}`) : "";
    if (req && /^(QUA|CON)/.test(focus.rule)) return L(lang, `Reescribí ${req} en EARS${where}`, `Rewrite ${req} in EARS${where}`);
    return L(lang, `¿Qué significa ${focus.rule}?`, `What does ${focus.rule} mean?`);
  }
  if (feature && /(hallazgo m[aá]s grave|most serious finding)/i.test(text)) {
    const top = [...(await src.report(feature)).findings].sort((a, b) => ["blocker", "warning", "suggestion"].indexOf(a.severity) - ["blocker", "warning", "suggestion"].indexOf(b.severity))[0];
    if (top) return L(lang, `¿Qué significa ${top.rule}?`, `What does ${top.rule} mean?`);
  }
  return text;
}

export function createDemoAdapter(): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const lang = env.lang;
      const loader = await getLoader();
      const src = sourceFrom(loader);
      const feature = effectiveFeature();
      const focus = getAgentState().focus;
      const history: ChatMessage[] = toHistory(messages);
      const lastUser = history.map((m) => m.role).lastIndexOf("user");
      if (lastUser >= 0) history[lastUser] = { role: "user", content: await engineText(history[lastUser]!.content, focus, lang, feature, src) };

      const parts: ThreadAssistantMessagePart[] = [];
      let suggestions: string[] | undefined;
      const snapshot = (status?: ChatModelRunResult["status"]): ChatModelRunResult => ({
        content: parts.slice(),
        ...(suggestions ? { metadata: { custom: { suggestions } } } : {}),
        ...(status ? { status } : {}),
      });
      const ruleId = effectiveRule();
      try {
        const events = demoAgent(history, { page: env.ctx.page, lang, ...(feature ? { featureId: feature } : {}), ...(ruleId ? { ruleId } : {}) }, src, {}, abortSignal);
        for await (const ev of events) {
          if (abortSignal.aborted) break;
          if (ev.type === "text") {
            const last = parts[parts.length - 1];
            if (last && last.type === "text") parts[parts.length - 1] = { ...last, text: last.text + ev.delta };
            else parts.push({ type: "text", text: ev.delta });
          } else if (ev.type === "tool-call") {
            parts.push({ type: "tool-call", toolCallId: ev.id, toolName: ev.name, args: ev.args, argsText: JSON.stringify(ev.args) });
          } else if (ev.type === "tool-result") {
            const i = parts.findIndex((p) => p.type === "tool-call" && p.toolCallId === ev.id);
            const p = parts[i];
            if (p && p.type === "tool-call") parts[i] = { ...p, result: ev.result };
          } else if (ev.type === "suggestions") suggestions = ev.items;
          else continue;
          yield snapshot();
        }
      } catch (e) {
        if (abortSignal.aborted) throw abortError();
        const msg = e instanceof Error ? e.message : String(e);
        yield snapshot({ type: "incomplete", reason: "error", error: msg });
        return;
      }
      if (abortSignal.aborted) throw abortError();
      // a tool that found nothing never sends a result: settle it so the message does not wait for an answer that will not come
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p && p.type === "tool-call" && p.result === undefined) parts[i] = { ...p, result: { none: true } };
      }
      agent.spendFocus();
      yield snapshot({ type: "complete", reason: "stop" });
    },
  };
}
