// LEGACY (kept for Stage 2 only): checks written for the pre-005 UI (top tabs Revisión/Guía/Asistente, hash routing, `.app`,
// fixture-invitations samples). Its selectors no longer match the app shell, so it is NOT run any more.
// What still applies was ported to scripts/verify-shell.mjs (onboarding, guide anchors, rule deep links, embedded mode, samples
// with no backend). The ASSISTANT sections (4 and 5) are the reference for Stage 2, which has to re-create them against the new
// side panel / home chat.
// End-to-end UI checks (onboarding, guide, inline rule help, assistant, states) + screenshots.
//   cd web && npm run build && npm run build:single && node scripts/verify-ui.mjs
// It starts what it needs (vite preview for samples mode; `specreview --serve` instances with/without --llm demo) and kills them at the end.
// Env: SPECREVIEW (path to the CLI, default ../.venv/bin/specreview), CHROMIUM, FIXTURE_REPO, REAL_REPO (optional, third-party repo with several features).
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(WEB);
const CLI = process.env.SPECREVIEW ?? path.resolve(WEB, "../.venv/bin/specreview");
const FIXTURE = process.env.FIXTURE_REPO ?? path.resolve(WEB, "../examples/invitations");
const REAL = process.env.REAL_REPO ?? "/home/user/real/spec-podcast-site";
const exe = process.env.CHROMIUM ?? fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
const P = { samples: 4173, demo: 8766, off: 8767, real: 8768 };
const URLS = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, `http://127.0.0.1:${v}`]));
fs.mkdirSync("screenshots", { recursive: true });

const procs = [];
async function up(url) {
  try { return (await fetch(url)).ok; } catch { return false; }
}
async function start(name, cmd, args, probe) {
  if (await up(probe)) { console.log(`(reusing ${name})`); return; }
  const p = spawn(cmd, args, { stdio: "ignore", detached: true });
  procs.push(p);
  for (let i = 0; i < 80; i++) { if (await up(probe)) return; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`could not start ${name}`);
}
const killAll = () => procs.forEach((p) => { try { process.kill(-p.pid); } catch { /* gone */ } });
process.on("exit", killAll);

const fails = [];
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await start("vite preview", "npx", ["vite", "preview", "--port", String(P.samples), "--strictPort", "--host", "127.0.0.1"], URLS.samples + "/");
await start("server demo", CLI, [FIXTURE, "--serve", "--llm", "demo", "--port", String(P.demo)], URLS.demo + "/api/assistant");
await start("server off", CLI, [FIXTURE, "--serve", "--port", String(P.off)], URLS.off + "/api/assistant");
const haveReal = fs.existsSync(REAL);
if (haveReal) await start("server real", CLI, [REAL, "--serve", "--llm", "demo", "--port", String(P.real)], URLS.real + "/api/assistant");

const browser = await chromium.launch({ executablePath: exe });
const seen = (ctx) => ctx.addInitScript(() => { try { localStorage.setItem("sr-onboarded", "1"); } catch { /* */ } });
async function newPage(opts = {}, { onboarded = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: "reduce", ...opts });
  if (onboarded) await seen(ctx);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  return { ctx, page };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const VIEWS = [[1280, 900], [375, 800]];
const SCHEMES = ["light", "dark"];
async function eachView(name, prepare, base = "ui") {
  for (const [w, h] of VIEWS) for (const scheme of SCHEMES) {
    const { ctx, page } = await newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    await prepare(page, { w, h, scheme });
    await sleep(250);
    check((await overflow(page)) <= 0, `${name} ${w} ${scheme}: no horizontal overflow`);
    check(page.errors.length === 0, `${name} ${w} ${scheme}: no page errors ${page.errors.join("|")}`);
    await page.screenshot({ path: `screenshots/${base}-${name}-${w}-${scheme}.png` });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 1. onboarding
{
  const { ctx, page } = await newPage({}, { onboarded: false });
  await page.goto(URLS.demo + "/");
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  check((await dlg.getAttribute("aria-modal")) === "true", "onboarding: first visit shows a modal dialog (aria-modal)");
  check((await dlg.getByText("Paso 1 de 4").count()) === 1, "onboarding: step indicator 'Paso 1 de 4'");
  check((await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null)), "onboarding: focus moved into the dialog");
  check((await page.locator(".app").getAttribute("inert")) !== null, "onboarding: page behind is inert");
  await page.getByRole("button", { name: "Siguiente" }).click();
  check((await dlg.getByText("Paso 2 de 4").count()) === 1 && (await dlg.locator("ol.flow li").count()) === 4, "onboarding: step 2 has the 4-step diagram");
  await page.getByRole("button", { name: "Atrás" }).click();
  check((await dlg.getByText("Paso 1 de 4").count()) === 1, "onboarding: Atrás goes back");
  // focus trap: Tab many times, focus never leaves the dialog
  let leaked = false;
  for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null))) leaked = true; }
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Shift+Tab"); if (!(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null))) leaked = true; }
  check(!leaked, "onboarding: focus trap (Tab / Shift+Tab stay inside)");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Siguiente" }).click();
  check((await dlg.getByText("Paso 4 de 4").count()) === 1 && (await page.getByRole("button", { name: "Empezar" }).count()) === 1, "onboarding: step 4 ends with 'Empezar'");
  await page.keyboard.press("Escape");
  check((await page.getByRole("dialog").count()) === 0, "onboarding: Esc closes");
  check(await page.evaluate(() => document.activeElement?.classList.contains("help-btn")), "onboarding: focus returns (Ayuda button)");
  check((await page.evaluate(() => localStorage.getItem("sr-onboarded"))) === "1", "onboarding: 'sr-onboarded' stored");
  await page.reload();
  await page.waitForSelector(".finding");
  check((await page.getByRole("dialog").count()) === 0, "onboarding: second visit does not show it");
  await page.locator(".help-btn").click();
  check((await page.getByRole("dialog").count()) === 1, "onboarding: Ayuda reopens it");
  await page.getByRole("button", { name: "Saltar introducción" }).click();
  check((await page.getByRole("dialog").count()) === 0, "onboarding: 'Saltar introducción' closes");
  await page.locator(".help-btn").click();
  await page.getByLabel("No volver a mostrar").uncheck();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("dialog").waitFor();
  check(true, "onboarding: unchecking 'No volver a mostrar' brings it back next visit");
  check(page.errors.length === 0, "onboarding: no page errors " + page.errors.join("|"));
  await ctx.close();
  // storage blocked: must still work and show it every time
  const b = await newPage({}, { onboarded: false });
  await b.ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
  const bp = await b.ctx.newPage();
  bp.errors = []; bp.on("pageerror", (e) => bp.errors.push(String(e)));
  await bp.goto(URLS.demo + "/");
  await bp.getByRole("dialog").waitFor();
  await bp.keyboard.press("Escape");
  await bp.waitForSelector(".finding");
  await bp.reload();
  await bp.getByRole("dialog").waitFor();
  check(bp.errors.length === 0, "onboarding: works with localStorage blocked (shown every time, no errors)");
  await b.ctx.close();
}
await eachView("onboarding-step2", async (page) => {
  await page.context().addInitScript(() => { try { localStorage.removeItem("sr-onboarded"); } catch { /* */ } });
  await page.goto(URLS.demo + "/");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Siguiente" }).click();
});
await eachView("onboarding-step3", async (page) => {
  await page.context().addInitScript(() => { try { localStorage.removeItem("sr-onboarded"); } catch { /* */ } });
  await page.goto(URLS.demo + "/");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
});

// ---------------------------------------------------------------- 2. guide + rule deep link
{
  const { ctx, page } = await newPage();
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  await page.locator(".nav-item", { hasText: "Guía" }).click();
  for (const h of ["Qué es", "Cuándo usarla", "Cómo funciona", "Tus primeros 5 minutos", "Cómo leer el reporte", "EARS en dos minutos", "Qué tan confiable es", "El asistente", "Preguntas frecuentes", "Glosario de reglas"]) {
    check((await page.getByRole("heading", { name: h, level: 2, exact: true }).count()) === 1, `guide: section '${h}'`);
  }
  check((await page.locator(".guide-section").first().locator("table tbody tr").count()) === 3, "guide: 'Qué es' has the 3-problems table");
  check((await page.locator("#guia-ears tbody tr").count()) === 5, "guide: EARS table has 5 patterns");
  check((await page.locator("#guia-primeros-pasos pre code").innerText()).includes("specreview <tu-repo> --serve"), "guide: quickstart commands in a code block");
  check((await page.locator(".toc").isVisible()) && (await page.locator(".toc-list a").count()) === 10, "guide: table of contents (10 entries)");
  check((await page.locator(".nav-item").allInnerTexts()).map((s) => s.trim().split(/\s|\n/)[0]).join() === "Revisión,Guía,Asistente", "nav order: Revisión, Guía, Asistente");
  // copy with a rejecting clipboard must not break anything
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true }); });
  await page.locator("#guia-primeros-pasos .copy-btn").click();
  await sleep(200);
  const label = await page.locator("#guia-primeros-pasos .copy-btn").innerText();
  check(/Copiado|No se pudo copiar/.test(label) && page.errors.length === 0, `guide: copy tolerates a rejected clipboard ("${label}")`);
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true }); });
  await page.locator("#guia-primeros-pasos .copy-btn").click();
  await sleep(150);
  check((await page.locator("#guia-primeros-pasos .copy-btn").innerText()) === "Copiado", "guide: copy button confirms when it works");
  // glossary
  check((await page.locator(".rule-card").count()) === 17, "guide: 17 rules in the glossary");
  check((await page.locator(".rule-q").count()) === 4, "guide: rules grouped under the 4 questions");
  await page.getByLabel("Buscar en el glosario de reglas").fill("COV001");
  check((await page.locator(".rule-card").count()) === 1, "guide: glossary search filters");
  await page.locator(".rule-toggle").click();
  const txt = await page.locator(".rule-panel").innerText();
  check(/Qué detecta/i.test(txt) && /Por qué importa/i.test(txt) && /Cómo arreglarlo/i.test(txt) && /Ejemplo que la dispara/i.test(txt) && /Ejemplo correcto/i.test(txt) && /Ojo/i.test(txt), "guide: expanded rule shows detects/why/fix/bad/good/Ojo");
  await ctx.close();
}
{
  // deep link on a fresh load
  const { ctx, page } = await newPage();
  await page.goto(URLS.demo + "/#guia-COV001");
  await page.locator("#guia-COV001 .rule-toggle").waitFor();
  await sleep(300);
  check((await page.locator("#guia-COV001 .rule-toggle").getAttribute("aria-expanded")) === "true", "deep link #guia-COV001: rule expanded");
  const inView = await page.evaluate(() => { const r = document.getElementById("guia-COV001").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; });
  check(inView, "deep link #guia-COV001: rule scrolled into view");
  check(await page.evaluate(() => document.activeElement?.classList.contains("rule-toggle")), "deep link: focus lands on the rule header");
  check((await page.locator(".nav-item[aria-current=page]").innerText()).trim() === "Guía", "deep link: Guía tab active");
  await page.goto(URLS.demo + "/#guia-ears");
  await page.reload();
  await sleep(300);
  check(await page.evaluate(() => { const r = document.getElementById("guia-ears").getBoundingClientRect(); return r.top >= 0 && r.top < 200; }), "deep link #guia-ears: section scrolled into view");
  await ctx.close();
}
await eachView("guide", async (page) => { await page.goto(URLS.demo + "/#guia"); await page.getByRole("heading", { name: "Guía del producto" }).waitFor(); });
await eachView("guide-rule", async (page) => { await page.goto(URLS.demo + "/#guia-QUA002"); await page.locator("#guia-QUA002 .rule-panel").waitFor(); await sleep(300); });

// ---------------------------------------------------------------- 3. inline help, tooltips, ask
const report = await (await fetch(URLS.demo + "/api/review?feature=003-team-invitations")).json();
const withIds = report.findings.findIndex((f) => f.ids.length > 0 && f.rule.startsWith("QUA"));
const target = withIds >= 0 ? withIds : 0;
const tf = report.findings[target];
{
  const { ctx, page } = await newPage();
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  const row = page.locator(`[data-finding="${target}"]`);
  await row.locator(".finding-main").click();
  const btn = row.getByRole("button", { name: "¿Qué significa esta regla?" });
  check((await btn.getAttribute("aria-expanded")) === "false", "rule help: disclosure collapsed by default");
  await btn.click();
  const help = row.locator(".rule-help");
  check(/Qué detecta/i.test(await help.innerText()), "rule help: shows the catalog entry inline");
  const link = help.getByRole("link", { name: "Ver en la guía" });
  check((await link.getAttribute("href")) === `#guia-${tf.rule}`, "rule help: 'Ver en la guía' links to #guia-" + tf.rule);
  await link.click();
  await page.locator(`#guia-${tf.rule} .rule-toggle`).waitFor();
  await sleep(300);
  check((await page.locator(`#guia-${tf.rule} .rule-toggle`).getAttribute("aria-expanded")) === "true", "rule help: link opens the Guía at that rule");
  // rule chip opens the inline help
  await page.locator(".nav-item", { hasText: "Revisión" }).click();
  const row2 = page.locator(`[data-finding="${target}"]`);
  check((await row2.locator(".rule-help").count()) === 1, "review state preserved when coming back from the guide");
  await row2.locator(".finding-main").click(); // collapse
  await row2.locator(".rule-code").click();
  check((await row2.locator(".rule-help").count()) === 1 && (await row2.locator(".finding-main").getAttribute("aria-expanded")) === "true", "rule code chip expands the row and opens the rule help");
  // tooltips on counters and metrics
  const c = page.locator(".counter.c-blocker");
  check((await c.getAttribute("aria-describedby")) === "tip-sev-blocker" && /Resolver antes de implementar/.test(await page.locator("#tip-sev-blocker").textContent()), "tooltips: severity counter has aria-describedby with plain-language text");
  await c.hover();
  await sleep(600);
  check(await page.locator("#tip-sev-blocker").isVisible(), "tooltips: shown on hover");
  await page.keyboard.press("Escape");
  check(!(await page.locator("#tip-sev-blocker").isVisible()), "tooltips: Esc dismisses");
  await page.locator(".metric-in").first().focus();
  await sleep(600);
  check(await page.locator("#tip-m-0").isVisible(), "tooltips: metric chip shows its explanation on keyboard focus");
  check((await page.locator(".metric-in").count()) === 4, "tooltips: 4 metric chips described");
  check(page.errors.length === 0, "review: no page errors " + page.errors.join("|"));
  await ctx.close();
}
await eachView("finding-rulehelp", async (page) => {
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  const row = page.locator(`[data-finding="${target}"]`);
  await row.locator(".finding-main").click();
  await row.getByRole("button", { name: "¿Qué significa esta regla?" }).click();
  await row.scrollIntoViewIfNeeded();
  await page.evaluate((i) => document.querySelector(`[data-finding="${i}"]`).scrollIntoView({ block: "start" }), target);
  await page.evaluate(() => window.scrollBy(0, -70));
});

// ---------------------------------------------------------------- 4. assistant (demo)
{
  const { ctx, page } = await newPage();
  const chatBodies = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/chat") && r.method() === "POST") chatBodies.push(JSON.parse(r.postData())); });
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  check(!(await page.locator(".nav-item", { hasText: "Asistente" }).isDisabled()), "assistant: tab enabled when available");
  check((await page.locator(".nav-item", { hasText: "Asistente" }).innerText()).toLowerCase().includes("demo"), "assistant: nav shows 'demo' marker");
  // ask about a finding
  const row = page.locator(`[data-finding="${target}"]`);
  await row.locator(".finding-main").click();
  await row.getByRole("button", { name: "Preguntar al asistente" }).click();
  await page.locator("textarea.composer-input").waitFor();
  await sleep(300);
  const val = await page.locator("textarea.composer-input").inputValue();
  check(val.includes(tf.rule) && val.includes(tf.ids[0]) && val.includes(tf.message.slice(0, 20)), `assistant: composer prefilled about the finding ("${val.slice(0, 70)}…")`);
  check((await page.locator(".msg").count()) === 0 && chatBodies.length === 0, "assistant: prefill does NOT auto-send");
  check((await page.locator(".nav-item[aria-current=page]").innerText()).includes("Asistente"), "assistant: switched to the Asistente tab");
  check(/Modo demo: respuestas de ejemplo, no de un modelo/.test(await page.locator(".demo-badge").innerText()), "assistant: persistent demo badge text");
  check(/El asistente propone texto: no modifica tus archivos\./.test(await page.locator(".assist").innerText()), "assistant: 'propone texto' notice");
  check(!/se envían al proveedor/.test(await page.locator(".assist").innerText()), "assistant: no provider-privacy line in demo mode");
  check((await page.locator(".focus-chip").innerText()).includes(tf.rule), "assistant: focus chip shows which finding");
  check(await page.evaluate(() => document.activeElement?.matches("textarea.composer-input")), "assistant: composer focused after prefill");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.locator(".msg-assistant .md").waitFor();
  await page.waitForFunction(() => /Con un modelo real/.test(document.querySelector(".msg-assistant")?.textContent ?? ""));
  check(chatBodies.length === 1 && chatBodies[0].focus?.rule === tf.rule && chatBodies[0].focus.ids.includes(tf.ids[0]), "assistant: request carries focus {rule, ids}");
  check(chatBodies[0].feature === "003-team-invitations" && chatBodies[0].messages.at(-1).role === "user" && /Sobre el hallazgo/.test(chatBodies[0].messages.at(-1).content), "assistant: request carries feature and the user message");
  check((await page.locator(".msg-user").count()) === 1 && (await page.locator(".msg-assistant").count()) === 1, "assistant: streamed demo reply rendered");
  check(/modo demo/i.test(await page.locator(".msg-assistant").innerText()), "assistant: reply text is the demo text");
  check((await page.locator(".focus-chip").count()) === 0, "assistant: focus consumed after a successful send");
  // second message: full history, no focus
  await page.locator("textarea.composer-input").fill("¿Y ahora?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".msg-assistant").length === 2);
  await page.waitForFunction(() => /Con un modelo real/.test(document.querySelectorAll(".msg-assistant")[1]?.textContent ?? ""));
  check(chatBodies.length === 2 && chatBodies[1].messages.length === 3 && !chatBodies[1].focus, "assistant: full history re-sent, no stale focus");
  // persists across tabs
  await page.locator(".nav-item", { hasText: "Guía" }).click();
  await page.locator(".nav-item", { hasText: "Revisión" }).click();
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  check((await page.locator(".msg").count()) === 4, "assistant: conversation persists while switching tabs");
  check(page.errors.length === 0, "assistant: no page errors " + page.errors.join("|"));
  await ctx.close();
}
await eachView("assistant-demo", async (page) => {
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  const row = page.locator(`[data-finding="${target}"]`);
  await row.locator(".finding-main").click();
  await row.getByRole("button", { name: "Preguntar al asistente" }).click();
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction(() => /Con un modelo real/.test(document.querySelector(".msg-assistant")?.textContent ?? ""));
  await page.locator("textarea.composer-input").fill("Reescribí el requisito en EARS");
});
await eachView("assistant-empty", async (page) => {
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  await page.locator(".chips").waitFor();
});
{
  // suggestion chips, stop, retry, errors, markdown safety (intercepted /api/chat)
  const { ctx, page } = await newPage();
  await page.goto(URLS.demo + "/");
  await page.waitForSelector(".finding");
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  await page.locator(".chips").waitFor();
  check((await page.locator(".chips .chip-btn").allInnerTexts()).join("|") === ["¿Qué debería arreglar primero?", "Reescribí un requisito en EARS", "Proponé criterios de aceptación Given/When/Then", "¿Este hallazgo puede ser un falso positivo?"].join("|"), "assistant: 4 suggested prompts");
  await page.getByRole("button", { name: "Reescribí un requisito en EARS" }).click();
  check((await page.locator("textarea.composer-input").inputValue()).startsWith("Reescribí en EARS"), "assistant: a chip prefills the composer");
  await page.locator("textarea.composer-input").fill("");
  // Stop button while streaming
  await page.route("**/api/chat", async (route) => { await sleep(2500); try { await route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: 'data: {"delta": "tarde"}\n\ndata: {"done": true}\n\n' }); } catch { /* aborted by the Stop button */ } });
  await page.locator("textarea.composer-input").fill("lento");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByRole("button", { name: "Detener" }).waitFor();
  check(true, "assistant: 'Detener' shown while streaming");
  await page.getByRole("button", { name: "Detener" }).click();
  await page.getByRole("button", { name: "Enviar" }).waitFor();
  check((await page.locator(".msg-error").count()) === 0, "assistant: stopping is not shown as an error");
  await page.unroute("**/api/chat");
  // JSON error before the stream -> readable + retry
  await page.route("**/api/chat", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "x", code: "assistant_unavailable" }) }));
  await page.locator("textarea.composer-input").fill("falla");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.locator(".msg-error").waitFor();
  const e1 = await page.locator(".msg-error").innerText();
  check(/--llm/.test(e1) && !/\{|undefined/.test(e1), `assistant: JSON error shown readable ("${e1.slice(0, 80)}…")`);
  await page.unroute("**/api/chat");
  // mid-stream {"error"}
  await page.route("**/api/chat", (route) => route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: 'data: {"delta": "Empiezo… "}\n\ndata: {"error": "El proveedor del modelo falló (Boom)."}\n\n' }));
  await page.getByRole("button", { name: "Reintentar" }).click();
  await page.waitForFunction(() => /Boom/.test(document.querySelector(".msg-error")?.textContent ?? ""));
  check(/Empiezo/.test(await page.locator(".msg-assistant").last().innerText()), "assistant: retry works; mid-stream error keeps the partial text and shows the message");
  await page.unroute("**/api/chat");
  // markdown safety + code copy
  await page.route("**/api/chat", (route) => route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: [
    'data: {"delta": "**Negrita** y `code` <img src=x onerror=\\"window.__xss=1\\"> <script>window.__xss=2</script>\\n\\n"}\n\n',
    'data: {"delta": "- uno\\n- dos\\n\\n[ok](https://example.com) [mal](javascript:window.__xss=3)\\n\\n```text\\nWhen X, the system MUST Y\\n```\\n"}\n\n',
    'data: {"done": true}\n\n'].join("") }));
  await page.getByRole("button", { name: "Reintentar" }).click().catch(() => {});
  await page.locator("textarea.composer-input").fill("md");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction(() => document.querySelector(".msg-assistant:last-child .codeblock"));
  const last = page.locator(".msg-assistant").last();
  check((await last.locator("img, script").count()) === 0 && !(await page.evaluate(() => window.__xss)), "assistant: raw HTML in a reply is not rendered/executed");
  check((await last.locator("strong").innerText()) === "Negrita" && (await last.locator("ul li").count()) === 2, "assistant: Markdown (bold, list) rendered");
  check((await last.locator("a[href^='https://example.com']").count()) === 1 && (await last.locator("a[href^='javascript']").count()) === 0, "assistant: only http(s) links are linkified");
  check((await last.locator(".codeblock .copy-btn").count()) === 1, "assistant: code block has a copy button");
  await page.unroute("**/api/chat");
  // new conversation, and feature change resets (real repo has several features)
  check(page.errors.length === 0, "assistant (intercepted): no page errors " + page.errors.join("|"));
  await ctx.close();
}
if (haveReal) {
  const { ctx, page } = await newPage();
  await page.goto(URLS.real + "/");
  await page.waitForSelector(".finding");
  const n = await page.locator(".picker select option").count();
  check(n >= 2, `real repo: feature picker lists ${n} features`);
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  await page.locator("textarea.composer-input").fill("hola");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction(() => /Con un modelo real/.test(document.querySelector(".msg-assistant")?.textContent ?? ""));
  const bodies = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/chat")) bodies.push(JSON.parse(r.postData())); });
  await page.locator(".picker select").selectOption({ index: 1 });
  await page.waitForSelector(".finding", { state: "attached" });
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  check((await page.locator(".msg").count()) === 0 && (await page.locator(".chips").count()) === 1, "assistant: conversation resets when the feature changes");
  await page.locator("textarea.composer-input").fill("otra");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".msg-assistant").length === 1);
  check(bodies.length === 1 && bodies[0].feature === (await page.locator(".picker select").inputValue()) && bodies[0].messages.length === 1, "assistant: new feature => request uses the new feature and a fresh history");
  for (let i = 0; i < Math.min(n, 3); i++) {
    await page.locator(".nav-item", { hasText: "Revisión" }).click();
    await page.locator(".picker select").selectOption({ index: i });
    await page.waitForSelector(".finding");
    const first = page.locator(".finding-main").first();
    await first.click();
    await page.locator(".finding-detail").first().getByRole("button", { name: "¿Qué significa esta regla?" }).click();
    check((await page.locator(".rule-help").first().innerText()).length > 40, `real repo feature ${i}: rule help renders`);
  }
  await page.goto(URLS.real + "/");
  await page.waitForSelector(".finding");
  await page.locator(".finding-main").first().click();
  await page.locator(".finding-detail").first().getByRole("button", { name: "¿Qué significa esta regla?" }).click();
  await page.evaluate(() => document.querySelector(".finding").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "screenshots/real-ui-finding-rulehelp-1280-light.png" });
  check(page.errors.length === 0, "real repo: no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- 5. assistant unavailable + states
{
  const { ctx, page } = await newPage();
  await page.goto(URLS.off + "/");
  await page.waitForSelector(".finding");
  check((await page.locator(".banner").count()) === 0, "server mode: no samples banner");
  check((await page.locator("button", { hasText: "Preguntar al asistente" }).count()) === 0, "unavailable: no 'Preguntar al asistente' buttons");
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  const t = await page.locator(".assist-info").innerText();
  check(/--llm anthropic/.test(t) && /ANTHROPIC_API_KEY/.test(t) && /--llm demo/.test(t), "unavailable: explains --llm anthropic / ANTHROPIC_API_KEY / --llm demo");
  check((await page.locator("[role=alert]").count()) === 0 && (await page.locator("textarea").count()) === 0, "unavailable: an explanation, not an error, and no composer");
  await ctx.close();
}
await eachView("assistant-unavailable", async (page) => { await page.goto(URLS.off + "/"); await page.waitForSelector(".finding"); await page.locator(".nav-item", { hasText: "Asistente" }).click(); await page.locator(".assist-info").waitFor(); });
{
  // samples mode
  const { ctx, page } = await newPage();
  await page.goto(URLS.samples + "/#fixture-invitations");
  await page.waitForSelector(".finding");
  check(/Estás viendo datos de ejemplo/.test(await page.locator(".banner").innerText()) && /specreview <repo> --serve/.test(await page.locator(".banner").innerText()), "samples mode: banner with how to run on your repo");
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  check(/servidor local/.test(await page.locator(".assist-info").innerText()), "samples mode: assistant explains it needs the local server");
  await page.locator(".nav-item", { hasText: "Guía" }).click();
  check((await page.locator(".rule-card").count()) === 17, "samples mode: rule glossary loaded from /samples/rules.json");
  await ctx.close();
}
await eachView("samples-banner", async (page) => { await page.goto(URLS.samples + "/#fixture-invitations"); await page.waitForSelector(".banner"); });
{
  // catalog missing: UI still works
  const { ctx, page } = await newPage();
  await page.route("**/samples/rules.json", (r) => r.fulfill({ status: 404, body: "no" }));
  await page.goto(URLS.samples + "/#fixture-invitations");
  await page.waitForSelector(".finding");
  await page.locator(".finding-main").first().click();
  await page.locator(".finding-detail").first().getByRole("button", { name: "¿Qué significa esta regla?" }).click();
  check(/specreview --explain/.test(await page.locator(".rule-help").first().innerText()), "no catalog: inline help degrades to the --explain hint");
  await page.locator(".nav-item", { hasText: "Guía" }).click();
  check((await page.locator(".state-inline").count()) === 1 && (await page.getByRole("heading", { name: "Qué es", exact: true }).count()) === 1, "no catalog: Guía still renders, glossary shows a note");
  check(page.errors.length === 0, "no catalog: no page errors");
  await ctx.close();
}
{
  // server with no features / API error / review failure: friendly, never raw
  const { ctx, page } = await newPage();
  await page.route("**/api/features", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(URLS.off + "/");
  await page.getByText("No encontramos features para revisar").waitFor();
  const t = await page.locator(".help-state").innerText();
  check(/specreview <tu-repo> --serve/.test(t) && /specs\/003-mi-feature/.test(t) && !/HTTP|Error:/.test(t), "no features: friendly instructions with the exact commands");
  await ctx.close();
  const b = await newPage();
  await b.page.route("**/api/features", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }));
  await b.page.goto(URLS.off + "/");
  await b.page.getByText("El servidor respondió con un problema").waitFor();
  check(!/boom|HTTP 500/.test(await b.page.locator(".help-state").innerText()), "API error: friendly state, raw error not shown");
  await b.ctx.close();
  const c = await newPage();
  await c.page.route("**/api/review**", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"kaput"}' }));
  await c.page.goto(URLS.off + "/");
  await c.page.getByText("No pudimos cargar esta revisión").waitFor();
  check((await c.page.locator(".tech").count()) === 1 && !/kaput/.test(await c.page.locator(".help-state > p").innerText()), "review failure: friendly message, technical detail tucked away");
  await c.ctx.close();
  const d = await newPage();
  await d.page.route("**/api/review**", async (r) => { await sleep(1500); await r.continue(); });
  await d.page.goto(URLS.off + "/");
  await d.page.locator(".skeleton").waitFor();
  check(!(await d.page.getByText("Cargando…", { exact: true }).count()), "loading: skeleton instead of a bare 'Cargando…'");
  await d.page.waitForSelector(".finding");
  await d.ctx.close();
}
await eachView("no-features", async (page) => {
  await page.route("**/api/features", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(URLS.off + "/");
  await page.getByText("No encontramos features para revisar").waitFor();
});

// ---------------------------------------------------------------- 6. embedded (single-file) mode
const SINGLE = process.env.SINGLE ?? path.join(WEB, "dist-single/index.html");
if (fs.existsSync(SINGLE)) {
  const html = fs.readFileSync(SINGLE, "utf8");
  const rep = JSON.parse(fs.readFileSync("public/samples/fixture-invitations.report.json", "utf8"));
  const src = JSON.parse(fs.readFileSync("public/samples/fixture-invitations.sources.json", "utf8"));
  const rules = JSON.parse(fs.readFileSync("public/samples/rules.json", "utf8"));
  const out = html.replace("<!--SPECREVIEW_DATA-->", `<script>window.__SPECREVIEW__ = ${JSON.stringify({ report: rep, sources: src, rules })};</script>`);
  const file = path.join(fs.mkdtempSync("/tmp/sr-emb-"), "report.html");
  fs.writeFileSync(file, out);
  console.log(`single-file build: ${(html.length / 1024).toFixed(0)} KiB; assistant-ui in it: ${/ThreadPrimitive|useLocalRuntime/.test(html)}`);
  check(!/ThreadPrimitive|useLocalRuntime|@assistant-ui/.test(html), "single build: assistant-ui is NOT bundled (stub)");
  const { ctx, page } = await newPage();
  const reqs = [];
  page.on("request", (r) => reqs.push(r.url()));
  await page.goto("file://" + file);
  await page.waitForSelector(".finding");
  check((await page.locator(".picker").count()) === 0 && (await page.locator(".banner").count()) === 0, "embedded: no picker, no banner");
  check(!reqs.some((u) => u.includes("/api/") || u.includes("samples")), "embedded: no network requests");
  await page.locator(".finding-main").first().click();
  await page.locator(".finding-detail").first().getByRole("button", { name: "¿Qué significa esta regla?" }).click();
  check(/Qué detecta|Severidad/i.test(await page.locator(".rule-help").first().innerText()), "embedded: inline rule help works from window.__SPECREVIEW__.rules");
  check((await page.locator("button", { hasText: "Preguntar al asistente" }).count()) === 0, "embedded: no 'Preguntar al asistente'");
  await page.locator(".nav-item", { hasText: "Asistente" }).click();
  check(/exportado/.test(await page.locator(".assist-info").innerText()) && /servidor local/.test(await page.locator(".assist-info").innerText()), "embedded: assistant tab explains it needs the local server");
  await page.locator(".nav-item", { hasText: "Guía" }).click();
  check((await page.locator(".rule-card").count()) === 17, "embedded: glossary from the embedded catalog");
  check(page.errors.length === 0, "embedded: no page errors " + page.errors.join("|"));
  await page.screenshot({ path: "screenshots/ui-embedded-guide-1280-light.png" });
  await ctx.close();
}

await browser.close();
killAll();
console.log(fails.length ? "FAILED: " + fails.length + "\n - " + fails.join("\n - ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
