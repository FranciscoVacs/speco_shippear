// Tests of the simulated agent (src/agent/demo): node scripts/test-demo-agent.mjs
// Bundles the engine with esbuild and runs it against the REAL sample reviews in public/samples (no browser needed).
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "sr-demo-"));
const out = join(dir, "engine.mjs");
await build({ entryPoints: ["src/agent/demo/engine.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const { demoAgent } = await import(pathToFileURL(out).href);

const S = "public/samples";
const j = (f) => JSON.parse(readFileSync(`${S}/${f}`, "utf8"));
const src = {
  features: async () => j("index.json"),
  report: async (id) => j(`${id}.report.json`),
  sources: async (id) => j(`${id}.sources.json`),
  rules: async () => j("rules.json"),
};
const FAST = { tickMs: 0, toolMs: 0 };

const fails = [];
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
async function ask(text, ctx = {}, pacing = FAST, signal) {
  const events = [];
  for await (const e of demoAgent([{ role: "user", content: text }], { page: "home", lang: "es", ...ctx }, src, pacing, signal)) events.push(e);
  const textOut = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  const tools = events.filter((e) => e.type === "tool-result");
  const calls = events.filter((e) => e.type === "tool-call");
  const sugg = events.find((e) => e.type === "suggestions")?.items ?? [];
  return { events, text: textOut, tools, calls, sugg };
}

// 1. review a feature by id: tool call + card with REAL counts from the engine's report
{
  const r = await ask("Revisá 003-team-invitations");
  const card = r.tools[0]?.result;
  check(r.calls[0]?.name === "review_feature" && r.tools[0]?.name === "review_feature", "review: calls the review_feature tool");
  check(card?.summary?.blocker === 6 && card.summary.warning === 10 && card.summary.suggestion === 3 && card.total === 19, "review: card carries the real counts (6/10/3, 19 findings)");
  check(card?.top?.length === 4 && card.top[0].severity === "blocker" && card.top.every((f, i, a) => i === 0 || a[i - 1].severity === "blocker" || f.severity !== "blocker"), "review: top findings are most serious first");
  check(card?.repo === "acme/team-app", "review: card knows the repository");
  check(/Empezaría por/.test(r.text) && r.sugg.length >= 2, "review: recommends a start and offers follow-ups");
  check(r.events.at(-1)?.type === "done" && r.events.at(-1)?.demo === true, "review: stream ends with done{demo:true}");
  check(r.events.findIndex((e) => e.type === "tool-call") < r.events.findIndex((e) => e.type === "tool-result"), "review: call precedes result");
}
// 2. feature resolution
{
  const slug = await ask("revisá invoice exports");
  check(slug.tools[0]?.result?.featureId === "001-invoice-exports", "resolve: slug words find 001-invoice-exports");
  const word = await ask("how is the invitations feature doing? review it");
  check(word.tools[0]?.result?.featureId === "003-team-invitations", "resolve: distinctive word 'invitations' finds the feature");
  const amb = await ask("revisá la 001");
  check(amb.tools.length === 0 && /feature/i.test(amb.text) && amb.sugg.length >= 2 && amb.sugg.every((s) => /001-/.test(s)), "resolve: '001' is ambiguous across repos -> asks which one with options");
  const refs = await ask("Reescribí FR-002 en EARS", { page: "review", featureId: "001-invoice-exports" });
  check(refs.tools[0]?.result?.featureId === "001-invoice-exports" && refs.tools[0].result.reqId === "FR-002", "resolve: 'FR-002' is a requirement, not feature number 002 (keeps the page's feature)");
  const none = await ask("revisá la feature", { page: "review", featureId: "001-invoice-exports" });
  check(none.tools[0]?.result?.featureId === "001-invoice-exports", "resolve: falls back to the feature of the current page");
  const ask2 = await ask("revisá esto");
  check(ask2.tools.length === 0 && ask2.sugg.length >= 2, "resolve: no feature at all -> asks, does not guess");
}
// 2b. «what does it do today»: points to the intent ledger (spec 028), never invents the rules
{
  for (const q of ["¿Qué hace hoy el software?", "What does the software do today?"]) {
    const r = await ask(q, { lang: q.startsWith("W") ? "en" : "es" });
    check(r.tools.length === 0 && /El qué|The what/.test(r.text) && /what_it_does/.test(r.text), `today: «${q}» points to the ledger`);
  }
}

// 3. list
{
  const r = await ask("¿Qué features hay?");
  const rows = r.tools[0]?.result?.rows;
  const index = j("index.json");
  const repos = new Set(index.map((x) => x.repo)).size;
  check(rows?.length === index.length && new Set(rows.map((x) => x.repo)).size === repos, `list: ${index.length} features in ${repos} repos from the real index`);
  check(/003-team-invitations/.test(r.text) && /Revisá 003-team-invitations/.test(r.sugg.join("|")), "list: names the most urgent feature and offers to review it");
}
// 4. explain a rule from the catalog
{
  const r = await ask("¿Qué significa COV001?");
  const rule = r.tools[0]?.result?.rule;
  check(rule?.id === "COV001" && rule.what && rule.why && rule.fix, "explain: returns the catalog entry with what/why/fix");
  check(/Ojo:/.test(r.text), "explain: surfaces the rule's caveat");
  const both = await ask("COV001 en FR-005", { featureId: "003-team-invitations" });
  check(both.tools[0]?.name === "explain_rule" && both.tools[0].result.rule.id === "COV001", "explain: a rule plus a requirement id without keywords explains the rule (not the help text)");
  const none = await ask("explicame ZZZ999 por favor");
  check(none.tools.length === 0, "explain: unknown rule id does not invent a card");
}
// 5. rewrite in EARS
{
  const r = await ask("Reescribí FR-006 en EARS", { featureId: "003-team-invitations" });
  const res = r.tools[0]?.result;
  check(res?.original === "System MUST provide a fast and user-friendly dashboard of pending invitations", "rewrite: original is the real spec text");
  check(/\[valor medible\]|\[measurable value\]/.test(res?.proposal ?? "") && /When \[/.test(res.proposal), "rewrite: proposal is EARS-shaped with placeholders for unknowns (never invents numbers)");
  check(res?.questions.some((q) => /fast/.test(q)) && res.rules.includes("QUA002"), "rewrite: asks what «fast» means in numbers and cites the motivating rule");
  const actor = await ask("rewrite FR-008 in EARS", { featureId: "003-team-invitations", lang: "en" });
  check(actor.tools[0]?.result?.proposal === "System MUST allow admins to revoke a pending invitation", "rewrite: actor-centric form becomes a system-centric requirement");
  const open = await ask("Reescribí FR-010", { featureId: "003-team-invitations" });
  check(open.tools[0]?.result?.questions.some((q) => /Pregunta abierta/.test(q)) && !/NEEDS CLARIFICATION/.test(open.tools[0].result.proposal), "rewrite: surfaces the open [NEEDS CLARIFICATION] as a question");
  const miss = await ask("Reescribí FR-099", { featureId: "003-team-invitations" });
  check(/No encontré FR-099/.test(miss.text), "rewrite: unknown requirement is reported, not invented");
  const needReq = await ask("reescribí un requisito en EARS", { featureId: "003-team-invitations" });
  check(needReq.tools.length === 0 && needReq.sugg.length > 0, "rewrite: no requirement named -> asks which, suggesting candidates");
}
// 6. acceptance criteria
{
  const r = await ask("Proponé criterios de aceptación para FR-010", { featureId: "003-team-invitations" });
  const res = r.tools[0]?.result;
  check(res?.scenarios.length === 2 && res.scenarios[0].given.startsWith("[") && !/NEEDS CLARIFICATION/.test(JSON.stringify(res.scenarios)), "acceptance: two Given/When/Then scenarios with placeholders, clarification marker stripped");
  const ev = await ask("acceptance criteria for FR-002", { featureId: "003-team-invitations", lang: "en" });
  check(/an invitation is created/.test(ev.tools[0]?.result?.scenarios[0].when ?? ""), "acceptance: event-form requirements reuse their real trigger as When");
}
// 7. prioritize
{
  const r = await ask("¿Qué debería arreglar primero?", { featureId: "003-team-invitations" });
  const steps = r.tools[0]?.result?.steps;
  check(steps?.length === 5 && steps[0].rank === 1 && steps[0].severity === "blocker" && steps.every((s) => s.why.length > 10), "prioritize: 5 ranked steps, blockers first, each with a reason from the rule catalog");
  const all = await ask("¿Por dónde empiezo?");
  const ranking = all.tools[0]?.result?.ranking;
  check(ranking?.[0]?.id === "003-team-invitations" && ranking.at(-1)?.summary.blocker === 0, "prioritize: without a feature, ranks features by urgency (blockers weigh most)");
}
// 8. false positive, help, language, pacing, abort
{
  const fp = await ask("¿Este hallazgo puede ser un falso positivo?", { ruleId: "COV001", page: "rule" });
  check(/COV001/.test(fp.text) && /similitud|vocabulario|otras palabras/.test(fp.text), "false positive: answers from the rule's caveat");
  const help = await ask("asdf qwer");
  check(/Revisar/.test(help.text) && help.sugg.length >= 2 && help.tools.length === 0, "help: unknown request lists capabilities and offers starters");
  const en = await ask("Review 003-team-invitations", { lang: "en" });
  check(/Reviewing/.test(en.text) && /blockers/.test(en.text) && !/bloqueantes/.test(en.text), "language: English answers are fully English");
  const t0 = Date.now();
  const slow = await ask("revisá 003-team-invitations", {}, { chars: 5, tickMs: 4, toolMs: 20 });
  const chunks = slow.events.filter((e) => e.type === "text");
  check(chunks.length > 10 && chunks.every((e) => e.delta.length <= 5) && Date.now() - t0 >= 40, "pacing: text streams in small chunks with delays");
  const ac = new AbortController();
  const it = demoAgent([{ role: "user", content: "revisá 003-team-invitations" }], { page: "home", lang: "es" }, src, { tickMs: 30, toolMs: 30 }, ac.signal);
  let n = 0;
  const t1 = Date.now();
  for await (const e of it) { n++; if (n === 2) ac.abort(); }
  check(Date.now() - t1 < 1500 && n < 400, "abort: aborting stops the long streaming promptly without throwing");
}
// 9. honesty: every answer is flagged as a demo and never claims to edit files
{
  const all = [];
  for (const q of ["revisá 003-team-invitations", "listá las features", "¿qué significa QUA002?", "Reescribí FR-006", "criterios para FR-010", "¿por dónde empiezo?"]) all.push(await ask(q, { featureId: "003-team-invitations" }));
  check(all.every((r) => r.events.at(-1)?.type === "done" && r.events.at(-1)?.demo === true), "honesty: all streams end flagged demo:true");
  check(!all.some((r) => /(modifiqué|actualicé|edité|I (edited|updated|changed))/i.test(r.text)), "honesty: never claims to have changed files");
}

console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
