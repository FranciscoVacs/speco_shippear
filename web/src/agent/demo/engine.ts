import { parseIntent, type Intent } from "./intent";
import { bySeverity, counts, draftAcceptance, draftSpec, explainRule, featureRows, listFeatures, prioritize, reviewCard, rewriteRequirement, score } from "./tools";
import type { AgentContext, AgentEvent, ChatMessage, DemoSource, Lang, PacingOptions, ToolName, ToolResult } from "./types";

const DEFAULT_PACING: Required<PacingOptions> = { chars: 5, tickMs: 14, toolMs: 650 };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

const SEV_ES = { blocker: "bloqueantes", warning: "advertencias", suggestion: "sugerencias" };
const SEV_EN = { blocker: "blockers", warning: "warnings", suggestion: "suggestions" };

let toolSeq = 0;

/**
 * Answers one user message with a stream of events. No model is involved: every answer is composed from the
 * engine's real review data plus deterministic templates, and the stream always ends with `{type:"done", demo:true}`.
 */
export async function* demoAgent(
  messages: ChatMessage[],
  ctx: AgentContext,
  src: DemoSource,
  pacing: PacingOptions = {},
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const p = { ...DEFAULT_PACING, ...pacing };
  const L = (es: string, en: string) => (ctx.lang === "es" ? es : en);
  const sev = ctx.lang === "es" ? SEV_ES : SEV_EN;
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  async function* say(text: string): AsyncGenerator<AgentEvent> {
    for (let i = 0; i < text.length && !signal?.aborted; i += p.chars) {
      yield { type: "text", delta: text.slice(i, i + p.chars) };
      await sleep(p.tickMs, signal);
    }
  }
  async function* tool(name: ToolName, args: Record<string, string>, run: () => Promise<ToolResult | null>): AsyncGenerator<AgentEvent, ToolResult | null> {
    const id = `tool-${++toolSeq}`;
    yield { type: "tool-call", id, name, args };
    await sleep(p.toolMs, signal);
    const result = await run();
    if (result) yield { type: "tool-result", id, name, result };
    return result;
  }

  const features = await src.features();
  const intent: Intent = parseIntent(last, ctx, features);
  const catalog = await src.rules();
  const ruleWhy = Object.fromEntries((catalog?.rules ?? []).map((r) => [r.id, r.why]));
  const nextSteps = (items: string[]): AgentEvent => ({ type: "suggestions", items: items.slice(0, 4) });
  const summarize = (c: ReturnType<typeof counts>) =>
    `${c.blocker} ${sev.blocker}, ${c.warning} ${sev.warning}, ${c.suggestion} ${sev.suggestion}`;

  switch (intent.kind) {
    case "review": {
      const preview = counts(features.find((f) => f.id === intent.featureId)?.summary);
      yield* say(L(`Reviso **${intent.featureId}**… (${summarize(preview)}).\n\n`, `Reviewing **${intent.featureId}**… (${summarize(preview)}).\n\n`));
      const r = (yield* tool("review_feature", { feature: intent.featureId }, () => reviewCard(src, intent.featureId))) as Awaited<ReturnType<typeof reviewCard>> | null;
      if (!r) break;
      const first = r.top[0];
      if (!first) yield* say(L("\nLa spec no tiene hallazgos. Buen trabajo.", "\nThe spec has no findings. Nice work."));
      else {
        const firstReq = r.top.flatMap((f) => f.ids).find((i) => /^FR-\d+$/.test(i));
        yield* say(L(`\nEmpezaría por **${first.rule}** en ${first.ids.join(", ")}: ${first.message}`, `\nI would start with **${first.rule}** on ${first.ids.join(", ")}: ${first.message}`));
        yield nextSteps([
          L(`¿Qué debería arreglar primero en ${intent.featureId}?`, `What should I fix first in ${intent.featureId}?`),
          ...(firstReq ? [L(`Reescribí ${firstReq} en EARS`, `Rewrite ${firstReq} in EARS`), L(`Proponé criterios de aceptación para ${firstReq}`, `Draft acceptance criteria for ${firstReq}`)] : []),
          L(`¿Qué significa ${first.rule}?`, `What does ${first.rule} mean?`),
        ]);
      }
      break;
    }
    case "today": {
      yield* say(L(
        "Lo que el software hace hoy está en **El qué** (barra lateral): cada regla de las specs con cuánta evidencia la respalda.\n\n" +
          "- **Construida sin test**: la feature está hecha, pero sólo tenés la palabra de la spec.\n" +
          "- **Con test, sin correr**: un test cita la regla (`028/FR-002`), nadie lo corrió para este texto.\n" +
          "- **Verificada** o **rota**: la última corrida de esos tests pasó o falló.\n\n" +
          "Lo que falta construir son las reglas **propuestas** y **decididas**. Desde la terminal: `specreview ledger . --today`; tu agente lo lee con `what_it_does`.",
        "What the software does today lives in **The what** (sidebar): every rule of the specs with how much evidence backs it.\n\n" +
          "- **Built, no test**: the feature is done, but all you have is the spec's word.\n" +
          "- **Tested, not run**: a test cites the rule (`028/FR-002`), nobody ran it for this text.\n" +
          "- **Verified** or **failing**: the latest run of those tests passed or failed.\n\n" +
          "What is left to build are the **proposed** and **decided** rules. From the terminal: `specreview ledger . --today`; your agent reads it with `what_it_does`.",
      ));
      yield nextSteps([L("¿Qué features hay?", "What features are there?"), L("¿Por dónde empiezo?", "Where should I start?")]);
      break;
    }
    case "list": {
      const rows = await featureRows(src);
      const repos = new Set(rows.map((r) => r.repo)).size;
      yield* say(L(`Tengo ${rows.length} features en ${repos} repositorios:\n\n`, `I have ${rows.length} features across ${repos} repositories:\n\n`));
      yield* tool("list_features", {}, () => listFeatures(src));
      const worst = [...rows].sort((a, b) => score(b.summary) - score(a.summary))[0];
      if (worst && score(worst.summary) > 0) {
        yield* say(L(`\nLa que más atención necesita es **${worst.id}** (${summarize(worst.summary)}).`, `\nThe one that needs the most attention is **${worst.id}** (${summarize(worst.summary)}).`));
        yield nextSteps([L(`Revisá ${worst.id}`, `Review ${worst.id}`), L("¿Por dónde empiezo?", "Where should I start?")]);
      }
      break;
    }
    case "explain": {
      const exp = await explainRule(src, intent.ruleId);
      if (!exp) { yield* say(L(`No encuentro la regla ${intent.ruleId} en el catálogo.`, `I cannot find rule ${intent.ruleId} in the catalog.`)); break; }
      yield* say(L(`Esto significa **${intent.ruleId}**:\n\n`, `This is what **${intent.ruleId}** means:\n\n`));
      yield* tool("explain_rule", { rule: intent.ruleId }, async () => exp);
      if (exp.rule.caveat) yield* say(L(`\nOjo: ${exp.rule.caveat}`, `\nNote: ${exp.rule.caveat}`));
      yield nextSteps([L("¿Este hallazgo puede ser un falso positivo?", "Can this finding be a false positive?"), L("¿Qué debería arreglar primero?", "What should I fix first?")]);
      break;
    }
    case "rewrite": {
      yield* say(L(`Armo una propuesta de ejemplo para **${intent.reqId}** (la redacción final depende de decisiones del equipo):\n\n`, `Here is an example proposal for **${intent.reqId}** (the final wording depends on decisions your team must make):\n\n`));
      const r = await (yield* tool("rewrite_requirement", { requirement: intent.reqId }, () => rewriteRequirement(src, intent.featureId, intent.reqId, ctx.lang)));
      if (!r) yield* say(L(`\nNo encontré ${intent.reqId} en la spec de ${intent.featureId}.`, `\nI could not find ${intent.reqId} in the ${intent.featureId} spec.`));
      else {
        const rr = r as Awaited<ReturnType<typeof rewriteRequirement>>;
        if (rr && rr.questions.length) yield* say(L(`\nAntes de darlo por bueno, el equipo tiene que responder ${rr.questions.length === 1 ? "una pregunta" : `${rr.questions.length} preguntas`}.`, `\nBefore it is final, your team needs to answer ${rr.questions.length === 1 ? "one question" : `${rr.questions.length} questions`}.`));
        yield nextSteps([L(`Proponé criterios de aceptación para ${intent.reqId}`, `Draft acceptance criteria for ${intent.reqId}`), L("¿Qué debería arreglar después?", "What should I fix next?")]);
      }
      break;
    }
    case "acceptance": {
      yield* say(L(`Borrador de criterios de aceptación para **${intent.reqId}**:\n\n`, `Draft acceptance criteria for **${intent.reqId}**:\n\n`));
      const r = await (yield* tool("draft_acceptance", { requirement: intent.reqId }, () => draftAcceptance(src, intent.featureId, intent.reqId, ctx.lang)));
      if (!r) yield* say(L(`\nNo encontré ${intent.reqId} en la spec de ${intent.featureId}.`, `\nI could not find ${intent.reqId} in the ${intent.featureId} spec.`));
      else yield* say(L("\nLos corchetes son datos que solo el equipo conoce. Citá el id del requisito en cada escenario para que el reviewer lo reconozca.", "\nBrackets are details only your team knows. Cite the requirement id in each scenario so the reviewer recognizes it."));
      yield nextSteps([L(`Reescribí ${intent.reqId} en EARS`, `Rewrite ${intent.reqId} in EARS`)]);
      break;
    }
    case "prioritize": {
      yield* say(intent.featureId ? L(`Este es mi orden para **${intent.featureId}**:\n\n`, `This is my order for **${intent.featureId}**:\n\n`) : L("Ordeno las features por urgencia:\n\n", "Ranking the features by urgency:\n\n"));
      yield* tool("prioritize", intent.featureId ? { feature: intent.featureId } : {}, () => prioritize(src, intent.featureId, ruleWhy));
      yield* say(L("\nLos bloqueantes primero: son los que impiden implementar con seguridad.", "\nBlockers first: they are what makes implementing unsafe."));
      yield nextSteps([intent.featureId ? L(`Revisá ${intent.featureId}`, `Review ${intent.featureId}`) : L("Listá las features", "List the features")]);
      break;
    }
    case "draft": {
      yield* say(L("Entendí lo que querés. Te armo un borrador: **todavía no se guardó nada**, y lo que falta definir son decisiones tuyas.\n\n", "I understood what you want. Here is a draft: **nothing has been saved yet**, and what is left to define are your decisions.\n\n"));
      const d = (yield* tool("draft_spec", { need: intent.need.slice(0, 80) }, async () => draftSpec(intent.need, ctx.lang))) as ReturnType<typeof draftSpec> | null;
      if (d) {
        yield* say(L(`\nSon ${d.decisions.length} decisiones. Mientras estén abiertas, un agente tendría que adivinarlas al construir.`, `\nThat is ${d.decisions.length} decisions. While they stay open, an agent would have to guess them when building.`));
        yield nextSteps([L("¿Qué espera mi decisión?", "What is waiting on my decision?"), L("Listá las features", "List the features")]);
      }
      break;
    }
    case "falsepositive": {
      const rule = intent.ruleId ? catalog?.rules.find((r) => r.id === intent.ruleId) : undefined;
      yield* say(rule?.caveat
        ? L(`Sobre **${rule.id}**: ${rule.caveat}`, `About **${rule.id}**: ${rule.caveat}`)
        : L("Los hallazgos inferidos por texto (por ejemplo COV001, COV002 o QUA006) pueden ser falsos positivos: Spec Kit no vincula requisitos con tasks. Citá el `FR-###` en la task o en el escenario y el reviewer deja de dudar.", "Findings inferred from text (for example COV001, COV002 or QUA006) can be false positives: Spec Kit does not link requirements to tasks. Cite the `FR-###` in the task or the scenario and the reviewer stops doubting."));
      break;
    }
    case "ask-feature": {
      yield* say(L("¿De qué feature hablamos? Elegí una:", "Which feature do you mean? Pick one:"));
      yield nextSteps(intent.candidates.map((id) => (intent.action === "review" ? L(`Revisá ${id}`, `Review ${id}`) : intent.action === "rewrite" ? L(`Reescribí ${intent.reqId ?? "FR-001"} en EARS en ${id}`, `Rewrite ${intent.reqId ?? "FR-001"} in EARS in ${id}`) : L(`Criterios de aceptación para ${intent.reqId ?? "FR-001"} en ${id}`, `Acceptance criteria for ${intent.reqId ?? "FR-001"} in ${id}`))));
      break;
    }
    case "ask-requirement": {
      const report = await src.report(intent.featureId);
      const ids = [...new Set(report.findings.filter((f) => f.rule.startsWith("QUA")).sort(bySeverity).flatMap((f) => f.ids).filter((i) => /^FR-\d+$/.test(i)))];
      yield* say(L(`¿Qué requisito de **${intent.featureId}**? Escribí su id (por ejemplo ${ids[0] ?? "FR-001"}).`, `Which requirement of **${intent.featureId}**? Type its id (for example ${ids[0] ?? "FR-001"}).`));
      yield nextSteps(ids.map((i) => (intent.action === "rewrite" ? L(`Reescribí ${i} en EARS`, `Rewrite ${i} in EARS`) : L(`Criterios de aceptación para ${i}`, `Acceptance criteria for ${i}`))));
      break;
    }
    default: {
      yield* say(L("Puedo ayudarte con tus specs. Probá preguntarme:\n\n- **Revisar** una feature y ver sus hallazgos\n- **Priorizar**: por dónde empezar\n- **Explicar** una regla (por ejemplo COV001)\n- **Reescribir** un requisito en EARS\n- **Proponer criterios de aceptación**", "I can help with your specs. Try asking me to:\n\n- **Review** a feature and see its findings\n- **Prioritize**: where to start\n- **Explain** a rule (for example COV001)\n- **Rewrite** a requirement in EARS\n- **Draft acceptance criteria**"));
      const worst = [...(await featureRows(src))].sort((a, b) => score(b.summary) - score(a.summary))[0];
      yield nextSteps([worst ? L(`Revisá ${worst.id}`, `Review ${worst.id}`) : L("Listá las features", "List the features"), L("¿Qué significa COV001?", "What does COV001 mean?"), L("¿Por dónde empiezo?", "Where should I start?")]);
    }
  }
  yield { type: "done", demo: true };
}

export type { Lang };
