// End-to-end verification of the agent (005-agent-first-app, Stage 2: FR-001..FR-007, FR-018, FR-019, SC-001, SC-002). Re-runnable:
//   cd web && node scripts/verify-agent.mjs          (SKIP_BUILD=1 reuses dist/, dist-single/ and artifact/template.html)
// Serves dist/ with a Vercel-like static server (no backend: unknown /api/* answers index.html) for the simulated engine, starts
// real `specreview --serve` servers (with and without --llm demo) for the backend engine, and drives everything with Chromium.
// Env: CHROMIUM, SPECREVIEW, SKIP_BUILD, SHOTS (=0 disables screenshots).
import { chromium } from "playwright-core";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(WEB);
const DIST = path.join(WEB, "dist");
const SHOTS = process.env.SHOTS !== "0";
const exe =
  process.env.CHROMIUM ??
  fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
fs.mkdirSync("screenshots", { recursive: true });

const fails = [];
let passes = 0;
const check = (c, m) => {
  if (c) passes++;
  else fails.push(m);
  console.log((c ? "PASS " : "FAIL ") + m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (s) => console.log(`\n== ${s}`);

if (!process.env.SKIP_BUILD) {
  section("build");
  execSync("npm run build", { stdio: "inherit" });
  execSync("npm run build:single", { stdio: "inherit" });
  execSync("node artifact/build.mjs", { stdio: "inherit" });
}

// ------------------------------------------------------------------ Vercel-like static server (no backend)
const rewrites = JSON.parse(fs.readFileSync("vercel.json", "utf8")).rewrites ?? [];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const apiHits = [];
function resolveFile(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const f = path.join(DIST, clean);
  if (f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  for (const r of rewrites) if (new RegExp("^" + r.source + "$").test(urlPath)) return path.join(DIST, r.destination);
  return null;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) apiHits.push(u.pathname);
  const f = resolveFile(u.pathname);
  if (!f) return void res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log("serving dist/ at", BASE);

const procs = [];
const killAll = () => {
  procs.forEach((p) => {
    try {
      process.kill(-p.pid);
    } catch {
      /* gone */
    }
  });
  server.close();
};
process.on("exit", killAll);
process.on("SIGINT", () => process.exit(130));

const browser = await chromium.launch({ executablePath: exe });
async function fresh({ w = 1280, h = 800, scheme = "light", locale = "es-AR", init, ...rest } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale, reducedMotion: "reduce", ...rest });
  await ctx.addInitScript(() => { try { localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-open-review-detail", "1"); localStorage.setItem("sr-open-nav-more", "1"); } catch { /* */ } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && page.errors.push("console: " + m.text()));
  return { ctx, page };
}
const overflow = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const shot = async (page, name, w, scheme) => SHOTS && (await page.screenshot({ path: `screenshots/shell-agent-${name}-${w}-${scheme}.png` }));
const gz = (p) => zlib.gzipSync(fs.readFileSync(path.join(DIST, p)), { level: 9 }).length;

// ---- agent helpers
const composer = (page) => page.getByTestId("agent-composer");
const userMsgs = (page) => page.locator(".ag-msg-user");
const asstMsgs = (page) => page.locator(".ag-msg-assistant");
/** waits until the current answer is complete: every user message has its answer, the answer's action bar is shown (hidden while running), no Stop button */
async function settled(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const u = document.querySelectorAll(".ag-msg-user").length;
      const a = document.querySelectorAll(".ag-msg-assistant");
      return u > 0 && a.length === u && !!a[a.length - 1].querySelector(".ag-actions") && !document.querySelector('[data-testid="agent-stop"]') && !document.querySelector('[data-testid="card-running"]');
    },
    null,
    { timeout },
  );
  await sleep(120);
}
async function say(page, text, { timeout } = {}) {
  const before = await userMsgs(page).count();
  await composer(page).fill(text);
  await composer(page).press("Enter");
  await page.waitForFunction((n) => document.querySelectorAll(".ag-msg-user").length > n, before, { timeout: 15000 });
  await settled(page, timeout);
}

const FEATURE = "003-team-invitations";
const idx = JSON.parse(fs.readFileSync("public/samples/index.json", "utf8"));
const rep = JSON.parse(fs.readFileSync(`public/samples/${FEATURE}.report.json`, "utf8"));
const rules = JSON.parse(fs.readFileSync("public/samples/rules.json", "utf8"));
const healthScore = (s) => (s.blocker ?? 0) * 100 + (s.warning ?? 0) * 10 + (s.suggestion ?? 0);
const worst = [...idx].sort((a, b) => healthScore(b.summary) - healthScore(a.summary))[0].id;

// ================================================================== 1. home: empty chat (FR-001)
section("1. home empty chat (FR-001)");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.waitForSelector('[data-agent-variant="home"]');
  await page.getByTestId("agent-chip").first().waitFor();
  check((await page.locator("h1").first().innerText()) === "Hola, Alex", "greeting uses the session user's first name");
  check((await page.getByText("¿Qué espera tu decisión hoy?").count()) === 1, "question 'what is waiting on your decision today'");
  const chips = await page.getByTestId("agent-chip").allInnerTexts();
  check(JSON.stringify(chips) === JSON.stringify([`Revisá ${worst}`, "¿Qué features hay?", "¿Por dónde empiezo?", "Quiero que mis clientes puedan invitar a su equipo"]), `4 suggested prompts built from real data, first = worst health (${chips.join(" | ")})`);
  check(worst === FEATURE, `worst-health feature by blockers-weigh-most is ${FEATURE}`);
  const ta = page.getByLabel("Mensaje para el asistente");
  check((await ta.count()) === 1 && (await ta.evaluate((e) => e.tagName)) === "TEXTAREA", "composer is a textarea with an accessible label");
  const sel = page.getByTestId("agent-context-select");
  check((await sel.inputValue()) === "" && (await sel.locator("option").first().innerText()) === "Todas las features", "context control defaults to all features");
  check((await sel.locator("option").count()) === idx.length + 1, "context control lists every feature");
  const badge = page.getByTestId("agent-badge");
  check((await badge.getAttribute("data-engine")) === "demo" && (await badge.innerText()).includes("Modo demo: respuestas de ejemplo"), "demo badge visible without a backend (FR-018)");
  check((await page.locator("#agent-panel").count()) === 0, "no side panel on the home page");
  check(!apiHits.includes("/api/chat"), "no /api/chat request while idle");
  // badge explains how to use a real model; Esc closes it
  await badge.locator(".ag-badge-btn").click();
  check((await badge.innerText()).includes("specreview <repo> --serve --llm anthropic"), "badge explains how to use a real model");
  await page.keyboard.press("Escape");
  check((await badge.locator(".ag-badge-btn").getAttribute("aria-expanded")) === "false", "Esc closes the badge popover");
  check((await overflow(page)) <= 0, "no horizontal overflow");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 2. SC-001, streaming, FR-002, cards, follow-ups
section("2. one click -> streamed review card (SC-001), composer at the bottom (FR-002), follow-ups");
let conversation; // kept for the navigation checks
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.getByTestId("agent-chip").first().waitFor();
  let interactions = 0;
  const lens = new Set();
  const poll = setInterval(() => page.evaluate(() => document.querySelector(".ag-msg-assistant")?.textContent?.length ?? 0).then((n) => lens.add(n)).catch(() => {}), 30);
  interactions++;
  await page.getByTestId("agent-chip").first().click();
  await page.waitForSelector(".ag-msg-user");
  check((await page.locator("h1").first().innerText()) !== "Hola, Alex", "after the first message the empty hero is gone (chat layout)");
  check(await page.getByTestId("agent-composer").isVisible(), "composer stays visible after the first message");
  await page.waitForSelector('[data-testid="card-running"]', { timeout: 8000 });
  const log = page.locator('[role="log"]');
  const live = await page.evaluate(() => ({ busy: document.querySelector('[role="log"]')?.getAttribute("aria-busy"), txt: document.querySelector('[data-testid="card-running"]')?.textContent ?? "" }));
  check(live.busy === "true", "thread is role=log with aria-busy while streaming");
  check(live.txt.includes("Revisando 003-team-invitations…"), "running state 'Revisando …' while the tool runs");
  await page.waitForSelector('[data-testid="card-review"]', { timeout: 15000 });
  await settled(page);
  clearInterval(poll);
  check(interactions <= 2, `review card after ${interactions} interaction(s) (SC-001: at most 2)`);
  check(lens.size >= 4, `assistant text streamed in pieces (${lens.size} distinct lengths)`);
  check((await log.getAttribute("aria-busy")) === "false", "aria-busy cleared when the answer completes");
  const card = page.getByTestId("card-review");
  const want = rep.summary;
  const got = {
    blocker: +(await card.getByTestId("count-blocker").innerText()),
    warning: +(await card.getByTestId("count-warning").innerText()),
    suggestion: +(await card.getByTestId("count-suggestion").innerText()),
  };
  check(got.blocker === 6 && got.warning === 10 && got.suggestion === 3, `card counts ${JSON.stringify(got)} = 6/10/3`);
  check(got.blocker === want.blocker && got.warning === want.warning && got.suggestion === want.suggestion, "card counts equal the real report");
  check((await card.getAttribute("data-feature")) === FEATURE && (await card.innerText()).includes("acme/team-app"), "card names the feature and its repo");
  const nFind = await card.getByTestId("card-finding").count();
  check(nFind === 4, `card shows the 4 most serious findings (${nFind})`);
  check((await card.getByTestId("card-finding").first().innerText()).includes("Bloqueante") && /CON001|COV001|QUA\d+/.test(await card.getByTestId("card-finding").first().innerText()), "finding shows severity badge, rule code and ids");
  check((await card.getByRole("link", { name: "Abrir revisión" }).getAttribute("href")) === `/reviews/${FEATURE}`, "'Abrir revisión' links to /reviews/:id");
  check((await card.getByRole("button", { name: "Preguntar sobre este hallazgo" }).count()) === 4, "each finding has 'Preguntar sobre este hallazgo'");
  check((await card.innerText()).includes("Requisitos") && (await card.innerText()).includes("%"), "metrics mini-chips");
  await shot(page, "home-review-card", 1280, "light");
  // FR-002: composer pinned at the bottom, thread scrolls
  const cb = await composer(page).boundingBox();
  const vh = page.viewportSize().height;
  check(cb.y + cb.height > vh - 140 && cb.y + cb.height <= vh, `composer pinned to the bottom (bottom=${Math.round(cb.y + cb.height)} of ${vh})`);
  const vp = await page.locator(".ag-viewport").evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, bottom: e.getBoundingClientRect().bottom }));
  check(vp.bottom <= cb.y + 2, "thread ends above the composer");
  check(vp.sh > vp.ch, "the thread scrolls (long answer) while the composer stays put");
  const page0 = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  check(page0 <= 1, "the page itself does not scroll (only the thread)");
  // follow-up chips under the last answer
  const follow = page.locator(".ag-msg-assistant:last-of-type .ag-chip, .ag-msg-assistant .ag-chips .ag-chip");
  check((await follow.count()) >= 2, `follow-up chips under the last answer (${await follow.count()})`);
  // click one: explain COV001 -> rule card
  const ruleChip = page.locator(".ag-msg-assistant .ag-chip", { hasText: /significa/ }).first();
  const ruleId = /[A-Z]{3}\d{3}/.exec(await ruleChip.innerText())[0];
  await ruleChip.click();
  await page.waitForSelector('[data-testid="card-rule"]', { timeout: 15000 });
  await settled(page);
  const rc = page.getByTestId("card-rule").last();
  const cov = rules.rules.find((r) => r.id === ruleId);
  check((await rc.getAttribute("data-rule")) === ruleId, `follow-up chip sent its text: rule card for ${ruleId}`);
  const rtxt = (await rc.innerText()).toLowerCase();
  check(rtxt.includes(cov.name.toLowerCase()) && rtxt.includes("qué detecta") && rtxt.includes("por qué importa") && rtxt.includes("cómo corregirlo"), "rule card: name, what, why, fix");
  check((await rc.locator(".ag-bad pre").count()) === (cov.bad ? 1 : 0) && (await rc.locator(".ag-good pre").count()) === (cov.good ? 1 : 0), `rule card: bad/good examples when the catalog has them (bad=${!!cov.bad}, good=${!!cov.good})`);
  check((await rc.getByRole("link", { name: "Ver la regla" }).getAttribute("href")) === `/rules/${ruleId}`, "rule card links to /rules/:id");
  // typed question: list features
  await say(page, "¿Qué features hay?");
  const ft = page.getByTestId("card-features").last();
  check((await ft.locator("tbody tr").count()) === idx.length, `FeatureTable lists all ${idx.length} features`);
  check((await ft.locator("tbody tr").first().locator("a").getAttribute("href")).startsWith("/reviews/"), "FeatureTable rows link to /reviews/:id");
  check((await ft.locator(".hc-blocker").first().innerText()).trim().length > 0 && (await ft.innerText()).includes("acme/billing"), "FeatureTable: health badges and repo");
  await shot(page, "home-features-table", 1280, "light");
  // Shift+Enter inserts a newline and does not send
  await composer(page).fill("");
  await composer(page).click();
  await page.keyboard.type("línea uno");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("línea dos");
  check((await composer(page).inputValue()) === "línea uno\nlínea dos", "Shift+Enter adds a line");
  const n0 = await userMsgs(page).count();
  await page.keyboard.press("Enter");
  await page.waitForFunction((n) => document.querySelectorAll(".ag-msg-user").length > n, n0);
  check((await userMsgs(page).last().innerText()).includes("línea dos"), "Enter sends the multi-line message");
  await settled(page);
  // copy / regenerate on the last answer
  check((await page.getByRole("button", { name: "Copiar respuesta" }).count()) >= 1 && (await page.getByRole("button", { name: "Regenerar" }).count()) === 1, "Copy and Regenerate affordances on answers");
  const nBefore = await asstMsgs(page).count();
  await page.getByRole("button", { name: "Regenerar" }).click();
  await settled(page);
  check((await asstMsgs(page).count()) === nBefore, "Regenerate replaces the last answer (same count)");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  conversation = { users: await userMsgs(page).count() };
  // keep this page for the navigation checks
  // ------------------------------------------------------------ 3. navigation: FR-007, FR-006, FR-005
  section("3. same conversation in the side panel (FR-007), context chip (FR-006), collapse keeps it (FR-005)");
  const firstUser = await userMsgs(page).first().innerText();
  await page.getByTestId("card-review").first().getByRole("link", { name: "Abrir revisión" }).click();
  await page.waitForSelector(".finding");
  check(new URL(page.url()).pathname === `/reviews/${FEATURE}`, "'Abrir revisión' navigates client-side to the review");
  const panel = page.locator("#agent-panel");
  check((await panel.count()) === 1, "panel docked on the review page");
  await panel.locator(".ag-msg-user").first().waitFor();
  check((await panel.locator(".ag-msg-user").count()) === conversation.users, `panel shows the same conversation (${conversation.users} user messages)`);
  check((await panel.locator(".ag-msg-user").first().innerText()) === firstUser, "first message is the one sent on the home page");
  check((await panel.getByTestId("card-review").count()) >= 1, "cards are rendered in the panel too");
  const chip = panel.getByTestId("agent-context");
  check((await chip.innerText()).includes(FEATURE) && (await panel.getByTestId("agent-context-name").textContent()).trim() === `Feature: ${FEATURE}`, "context chip shows the page's feature (FR-006)");
  check((await panel.locator('[data-agent-variant="panel"]').getAttribute("data-agent-feature")) === FEATURE, "AgentSlot context = the feature");
  check((await panel.getByTestId("agent-composer").boundingBox()).y + 40 > (await panel.boundingBox()).y + (await panel.boundingBox()).height - 200, "panel composer is at the bottom of the panel");
  await shot(page, "panel-review-conversation", 1280, "light");
  // detach / re-attach the context
  await chip.getByRole("button", { name: "Quitar el contexto de la página" }).click();
  check((await panel.getByTestId("agent-context").getAttribute("data-detached")) === "true", "context can be detached");
  await panel.getByTestId("agent-context").getByRole("button").click();
  check((await panel.getByTestId("agent-context").getAttribute("data-detached")) === "false", "context can be re-attached");
  // collapse by button
  const textBefore = (await panel.locator(".ag-viewport").innerText()).length;
  await panel.getByRole("button", { name: "Ocultar el asistente" }).click();
  check((await page.locator("#agent-panel").count()) === 0 && (await page.getByTestId("panel-toggle").count()) === 1, "collapse closes the panel and shows the reopen button");
  await page.getByTestId("panel-toggle").click();
  await page.locator("#agent-panel .ag-msg-user").first().waitFor();
  check((await page.locator("#agent-panel .ag-msg-user").count()) === conversation.users && (await page.locator("#agent-panel .ag-viewport").innerText()).length === textBefore, "reopening shows the conversation intact (button)");
  // Ctrl+J
  await page.keyboard.press("Control+j");
  check((await page.locator("#agent-panel").count()) === 0, "Ctrl+J collapses");
  await page.keyboard.press("Control+j");
  await page.locator("#agent-panel .ag-msg-user").first().waitFor();
  check((await page.locator("#agent-panel .ag-msg-user").count()) === conversation.users, "reopening shows the conversation intact (Ctrl+J)");
  // collapsed panel keeps the stream going: collapse while answering
  await composer(page).fill("Reescribí FR-006 en EARS");
  await composer(page).press("Enter");
  await page.waitForFunction((n) => document.querySelectorAll("#agent-panel .ag-msg-user").length > n, conversation.users);
  await page.keyboard.press("Control+j");
  await sleep(2500);
  await page.keyboard.press("Control+j");
  await page.locator('#agent-panel [data-testid="card-rewrite"]').waitFor({ timeout: 10000 });
  check(true, "an answer that finished while the panel was collapsed is there on reopening");
  // rewrite card
  const rw = page.getByTestId("card-rewrite").last();
  const rtxt2 = (await rw.innerText()).toLowerCase();
  check(rtxt2.includes("fr-006") && rtxt2.includes("original") && rtxt2.includes("propuesta") && rtxt2.includes("ejemplo"), "RewriteCard: original vs proposal, labelled 'Ejemplo'");
  check(rtxt2.includes("nunca edita tus archivos"), "RewriteCard: states the agent proposes text and never edits files");
  check((await rw.getByTestId("rewrite-proposal").innerText()).includes("MUST"), "RewriteCard: EARS proposal text");
  check((await rw.locator(".ag-questions li").count()) >= 1, "RewriteCard: questions for the team");
  await rw.getByRole("button", { name: "Copiar propuesta" }).click();
  await sleep(250);
  check((await rw.locator(".ag-copy-msg").innerText()).length > 0 && page.errors.length === 0, `copy tolerates clipboard rejection and says so ("${await rw.locator(".ag-copy-msg").innerText()}")`);
  await ctx.close();
}

// ================================================================== 4. each tool card (context 003-team-invitations)
section("4. every tool card: rewrite FR-006 with context, acceptance, prioritize (feature and all)");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.getByTestId("agent-chip").first().waitFor();
  await page.getByTestId("agent-context-select").selectOption(FEATURE);
  await say(page, "Reescribí FR-006 en EARS");
  const rw = page.getByTestId("card-rewrite");
  check((await rw.count()) === 1 && (await rw.innerText()).includes("FR-006"), `rewrite FR-006 works with the feature picked in the context control (cards: ${await rw.count()}; ${(await asstMsgs(page).last().innerText()).slice(0, 120).replace(/\n/g, " ")})`);
  check(!(await asstMsgs(page).last().innerText()).includes("¿De qué feature"), "no 'which feature' question: the context was used");
  await shot(page, "home-rewrite-card", 1280, "light");
  await say(page, "Proponé criterios de aceptación para FR-006");
  const ac = page.getByTestId("card-acceptance");
  const act = await ac.innerText();
  check((await ac.getByTestId("card-scenario").count()) >= 2 && act.includes("Dado") && act.includes("Cuando") && act.includes("Entonces"), "AcceptanceCard: Given/When/Then scenarios");
  check((await ac.getByRole("button", { name: "Copiar escenarios" }).count()) === 1 && act.includes("nunca edita"), "AcceptanceCard: copy + never-edits note");
  await shot(page, "home-acceptance-card", 1280, "light");
  await say(page, "¿Qué arreglo primero?");
  const pf = page.getByTestId("card-priority").last();
  check((await pf.getByTestId("priority-item").count()) >= 3 && (await pf.innerText()).includes(FEATURE), "PriorityList (feature): ranked steps");
  check((await pf.getByRole("link", { name: "Abrir revisión" }).getAttribute("href")) === `/reviews/${FEATURE}`, "PriorityList links to the review");
  await page.getByTestId("agent-new").count();
  // all-features ranking
  await page.getByTestId("agent-context-select").selectOption("");
  await say(page, "¿Por dónde empiezo?");
  const pa = page.getByTestId("card-priority").last();
  const items = pa.getByTestId("priority-item");
  check((await items.count()) === idx.length, `PriorityList (all): ranks the ${idx.length} features`);
  check((await items.first().innerText()).includes(FEATURE), "PriorityList (all): worst feature first");
  check((await pa.locator("a").first().getAttribute("href")) === `/reviews/${FEATURE}`, "PriorityList (all): rows link to reviews");
  await shot(page, "home-priority-list", 1280, "light");
  // explain typed rule in English words, and a rule that does not exist
  await say(page, "What does QUA002 mean?");
  check((await page.getByTestId("card-rule").last().getAttribute("data-rule")) === "QUA002", "typed question: rule card QUA002");
  await shot(page, "home-rule-card", 1280, "light");
  await say(page, "hola");
  check((await asstMsgs(page).last().innerText()).includes("Puedo ayudarte"), "unknown request: the agent says what it can do");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 5. stop, new conversation
section("5. Stop mid-stream, new conversation");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.getByTestId("agent-chip").first().waitFor();
  await composer(page).fill(`Revisá ${FEATURE}`);
  await composer(page).press("Enter");
  await page.locator(".ag-msg-assistant .md").first().waitFor({ timeout: 8000 });
  check((await page.getByTestId("agent-stop").count()) === 1, "Stop button replaces Send while streaming");
  await page.getByTestId("agent-stop").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="agent-stop"]'), null, { timeout: 5000 });
  await sleep(1200); // the tool would have finished by now
  check((await page.getByTestId("card-review").count()) === 0, "Stop: the review card never appears");
  check((await page.getByText("Respuesta detenida.").count()) === 1, "Stop: the message says it was stopped");
  check((await page.getByTestId("agent-send").count()) === 1, "Stop: Send is back");
  await say(page, "¿Qué features hay?");
  check((await page.getByTestId("card-features").count()) === 1, "a new question works after Stop");
  // new conversation (home: via the sidebar link to home? the panel has the button; here we go to a page)
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Reglas", exact: true }).click();
  await page.waitForSelector("#agent-panel .ag-msg-user");
  await page.getByTestId("agent-new").click();
  check((await page.locator("#agent-panel .ag-msg-user").count()) === 0 && (await page.locator("#agent-panel .ag-panel-empty").count()) === 1, "'Nueva conversación' empties the thread (panel shows suggestions again)");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Inicio" }).click();
  await page.waitForSelector("h1");
  check((await page.locator("h1").first().innerText()) === "Hola, Alex", "home shows the empty chat after a new conversation");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 6. panel suggestions and sr:ask
section("6. panel: page-specific suggestions, 'Preguntar al asistente' prefill without sending (FR-004, FR-006)");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + `/reviews/${FEATURE}`);
  await page.waitForSelector(".finding");
  const panel = page.locator("#agent-panel");
  await panel.getByTestId("agent-chip").first().waitFor();
  const chips = await panel.getByTestId("agent-chip").allInnerTexts();
  check(JSON.stringify(chips) === JSON.stringify(["¿Qué arreglo primero?", "Reescribí un requisito en EARS", "Explicá el hallazgo más grave"]), `review page chips (${chips.join(" | ")})`);
  check((await panel.getByTestId("agent-context-name").textContent()).trim() === `Feature: ${FEATURE}`, "context chip on a cold start");
  await shot(page, "panel-review-empty", 1280, "light");
  // the runtime is not loaded yet on a cold review page: sr:ask must still work (and while the panel is collapsed)
  await panel.getByRole("button", { name: "Ocultar el asistente" }).click();
  await page.locator(".finding-main").first().click();
  const reqs = [];
  await page.locator(".finding-detail").getByRole("button", { name: "Preguntar al asistente" }).first().click();
  await page.waitForSelector("#agent-panel");
  await sleep(300);
  const val = await composer(page).inputValue();
  check(/Sobre el hallazgo [A-Z]{3}\d{3}/.test(val) && val.includes(FEATURE), `'Preguntar al asistente' with the panel collapsed opens it and prefills the composer ("${val.slice(0, 60)}…")`);
  check((await page.locator(".ag-msg-user").count()) === 0, "the question is NOT sent automatically");
  check(await composer(page).evaluate((e) => e === document.activeElement), "composer has the focus");
  const focusTxt = await page.getByTestId("agent-focus").innerText();
  check(/[A-Z]{3}\d{3}/.test(focusTxt), `focus chip shows the finding (${focusTxt.replace(/\n/g, " ")})`);
  await composer(page).press("Enter");
  await page.waitForSelector(".ag-msg-user");
  await settled(page);
  const a1 = await asstMsgs(page).last().innerText();
  check(a1.length > 20 && (await page.getByTestId("agent-focus").count()) === 0, "the focused question was answered and the one-shot focus was spent");
  check((await page.locator('[data-testid="card-rule"], [data-testid="card-rewrite"]').count()) >= 1, "the answer is about the focused finding (rule or rewrite card)");
  await shot(page, "panel-review-asked", 1280, "light");
  // card button sends a focused question straight away
  await panel.getByTestId("agent-new").click();
  await panel.getByTestId("agent-chip").first().click();
  await settled(page);
  check((await panel.getByTestId("card-priority").count()) === 1, "panel chip '¿Qué arreglo primero?' -> PriorityList");
  await page.getByTestId("agent-new").click();
  await panel.getByTestId("agent-chip").nth(2).click();
  await settled(page);
  check((await panel.getByTestId("card-rule").count()) === 1, "panel chip 'Explicá el hallazgo más grave' -> rule card of the worst finding");
  await page.getByTestId("agent-new").click();
  await panel.getByTestId("agent-chip").nth(1).click();
  await settled(page);
  check((await panel.locator(".ag-chip", { hasText: /FR-\d+/ }).count()) >= 1, "panel chip 'Reescribí un requisito en EARS' asks which requirement (chips with FR ids)");
  await panel.locator(".ag-chip", { hasText: /FR-\d+/ }).first().click();
  await settled(page);
  check((await panel.getByTestId("card-rewrite").count()) === 1, "...and picking one gives the rewrite card");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();

  // rule page
  const r = await fresh();
  await r.page.goto(BASE + "/rules/COV001");
  await r.page.waitForSelector("#rule-COV001");
  const rp = r.page.locator("#agent-panel");
  await rp.getByTestId("agent-chip").first().waitFor();
  check((await rp.getByTestId("agent-context-name").textContent()).trim() === "Regla: COV001", "rule page: context chip shows the rule");
  check((await rp.getByTestId("agent-chip").allInnerTexts()).join("|") === "Explicame esta regla", "rule page: 'Explicame esta regla'");
  await shot(r.page, "panel-rule-empty", 1280, "light");
  await rp.getByTestId("agent-chip").first().click();
  await settled(r.page);
  check((await rp.getByTestId("card-rule").getAttribute("data-rule")) === "COV001", "rule page chip explains COV001");
  await shot(r.page, "panel-rule", 1280, "light");
  check(r.page.errors.length === 0, "no page errors " + r.page.errors.join("|"));
  await r.ctx.close();
  // generic chips elsewhere
  const g = await fresh();
  await g.page.goto(BASE + "/reviews");
  await g.page.waitForSelector(".feat-row");
  const gc = await g.page.locator("#agent-panel").getByTestId("agent-chip").allInnerTexts();
  check(gc.length === 4 && gc[0] === `Revisá ${worst}`, `generic chips on /reviews (${gc.join(" | ")})`);
  await g.ctx.close();
}

// ================================================================== 7. language
section("7. English translates the agent UI");
{
  const { ctx, page } = await fresh({ locale: "en-US" });
  await page.goto(BASE + "/");
  await page.getByTestId("agent-chip").first().waitFor();
  check((await page.locator("h1").first().innerText()) === "Hi, Alex" && (await page.getByText("What is waiting on your decision today?").count()) === 1, "greeting and question in English");
  check((await page.getByTestId("agent-chip").allInnerTexts()).join("|") === `Review ${worst}|What features are there?|Where should I start?|I want my customers to be able to invite their team`, "chips in English");
  check((await page.getByTestId("agent-badge").innerText()).includes("Demo mode: example answers"), "badge in English");
  check((await page.getByLabel("Message to the assistant").count()) === 1, "composer label in English");
  await page.getByTestId("agent-chip").first().click();
  await page.waitForSelector('[data-testid="card-review"]', { timeout: 15000 });
  await settled(page);
  const t = await page.locator("main").innerText();
  check(t.includes("Blockers") && t.includes("Open review") && t.includes("Ask about this finding") && /Reviewing|Most serious/i.test(t), "review answer and card labels in English");
  await page.getByRole("button", { name: "Hola" }).count();
  // switching language mid-conversation re-renders labels
  await page.getByRole("button", { name: "ES", exact: true }).click();
  check((await page.getByText("Abrir revisión").count()) >= 1 && (await page.getByText("Bloqueantes").count()) >= 1, "switching to Spanish re-labels the card");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 8. keyboard only
section("8. keyboard-only (FR-020)");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.getByTestId("agent-chip").first().waitFor();
  const tabsTo = async (pred, max = 40) => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(pred)) return i + 1;
    }
    return -1;
  };
  const n = await tabsTo(() => document.activeElement?.getAttribute("data-testid") === "agent-composer");
  check(n > 0, `Tab reaches the composer (${n} presses from the top)`);
  await page.keyboard.type("¿Qué features hay?");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="card-features"]', { timeout: 15000 });
  await settled(page);
  check(true, "typing + Enter sends and gets an answer (keyboard only)");
  // follow-up chips are focusable and Enter activates them
  const chipN = await tabsTo(() => document.activeElement?.classList.contains("ag-chip") ?? false, 80);
  const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
  check(chipN > 0, `Tab reaches a follow-up chip (${label})`);
  const before = await userMsgs(page).count();
  await page.keyboard.press("Enter");
  await page.waitForFunction((b) => document.querySelectorAll(".ag-msg-user").length > b, before);
  await settled(page);
  check((await userMsgs(page).last().innerText()).includes(label.trim()), "Enter on a chip sends its text");
  // Esc closes the user menu (stage 1) and the badge popover
  await page.getByRole("button", { name: /Alex|Cuenta|Menú de usuario/ }).first().click().catch(() => {});
  await page.keyboard.press("Escape");
  const badgeBtn = page.getByTestId("agent-badge").locator(".ag-badge-btn");
  await badgeBtn.focus();
  await page.keyboard.press("Enter");
  check((await badgeBtn.getAttribute("aria-expanded")) === "true", "badge opens with Enter");
  await page.keyboard.press("Escape");
  check((await badgeBtn.getAttribute("aria-expanded")) === "false", "Esc closes it");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 9. SC-002
section("9. SC-002: first-view JavaScript (gzip), before the first interaction");
const sizes = {};
for (const [name, p] of [["/", "/"], ["review + docked panel", `/reviews/${FEATURE}`]]) {
  const { ctx, page } = await fresh();
  const js = new Set();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin === BASE && u.pathname.endsWith(".js")) js.add(u.pathname);
  });
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  if (p.startsWith("/reviews")) await page.waitForSelector("#agent-panel .ag-panel-empty");
  const first = [...js];
  const kb = first.reduce((n, f) => n + gz(f), 0) / 1024;
  const runtime = fs.readdirSync(path.join(DIST, "assets")).find((f) => /^agent-runtime-.*\.js$/.test(f));
  sizes[name] = { kb, files: first.length };
  console.log(`${name}: ${first.length} JS file(s) before first interaction -> ${kb.toFixed(1)} KB gzip`);
  check(kb <= 250, `first view JS on ${name}: ${kb.toFixed(1)} KB gzip <= 250 KB`);
  check(!first.some((f) => f.includes("agent-runtime")), "assistant-ui runtime chunk NOT loaded before interaction");
  await sleep(5500); // the idle prefetch (after ~2 s, requestIdleCallback timeout 3 s)
  const after = [...js];
  const total = after.reduce((n, f) => n + gz(f), 0) / 1024;
  sizes[name].afterPrefetch = total;
  console.log(`${name}: after the idle prefetch -> ${after.length} files, ${total.toFixed(1)} KB gzip (runtime chunk ${(gz("assets/" + runtime) / 1024).toFixed(1)} KB)`);
  check(after.some((f) => f.includes("agent-runtime")), "the runtime chunk is prefetched when the browser is idle");
  await ctx.close();
}
{
  // the first message hands over to the real thread without waiting: with the chunk already prefetched
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(4500);
  const t0 = Date.now();
  await page.getByTestId("agent-chip").first().click();
  await page.waitForSelector(".ag-msg-assistant .md", { timeout: 8000 });
  console.log(`first token after ${Date.now() - t0} ms with the chunk prefetched`);
  await ctx.close();
  // and without the prefetch (click immediately): the placeholder shows the user's message until the thread is ready
  const c2 = await fresh();
  await c2.page.route("**/agent-runtime-*.js", async (r) => { await sleep(1200); await r.continue(); });
  await c2.page.goto(BASE + "/", { waitUntil: "networkidle" });
  await c2.page.getByTestId("agent-chip").first().click();
  check((await c2.page.locator(".ag-msg-user .ag-plain").first().innerText()).includes("Revisá"), "while the runtime chunk downloads, the user's message is already shown (no jump)");
  check((await c2.page.getByText("Cargando el asistente…").count()) === 1, "...with a loading line");
  await c2.page.waitForSelector('[data-testid="card-review"]', { timeout: 15000 });
  check(true, "the queued first message is delivered once the runtime arrives");
  check(c2.page.errors.length === 0, "no page errors " + c2.page.errors.join("|"));
  await c2.ctx.close();
}

// ================================================================== 10. visuals: overflow, errors, screenshots
section("10. 1280/375 x light/dark: no overflow, no errors, screenshots");
for (const [w, h] of [[1280, 800], [375, 800]])
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await fresh({ w, h, scheme });
    await page.goto(BASE + "/");
    await page.getByTestId("agent-chip").first().waitFor();
    check((await overflow(page)) <= 0, `home empty ${w} ${scheme}: no horizontal overflow`);
    await shot(page, "home-empty", w, scheme);
    await page.getByTestId("agent-chip").first().click();
    await page.waitForSelector('[data-testid="card-review"]', { timeout: 15000 });
    await settled(page);
    await sleep(300);
    check((await overflow(page)) <= 0, `home chat ${w} ${scheme}: no horizontal overflow (${await overflow(page)})`);
    const cb = await composer(page).boundingBox();
    check(cb.y + cb.height <= h + 1 && cb.y > 0, `home chat ${w} ${scheme}: composer inside the viewport`);
    await shot(page, "home-chat", w, scheme);
    await page.locator(".ag-viewport").evaluate((e) => (e.scrollTop = 0));
    await shot(page, "home-chat-top", w, scheme);
    await say(page, "¿Qué features hay?");
    await shot(page, "home-features", w, scheme);
    // panel on a review page (docked at 1280, sheet at 375)
    await page.getByRole("navigation", { name: "Principal" }).count();
    await page.goto(BASE + `/reviews/${FEATURE}`);
    await page.waitForSelector(".finding");
    if (w < 1100) await page.getByTestId("panel-toggle").click();
    await page.getByTestId("agent-chip").first().waitFor();
    check((await overflow(page)) <= 0, `review + panel ${w} ${scheme}: no horizontal overflow`);
    await shot(page, w < 1100 ? "mobile-sheet-empty" : "panel-review-empty", w, scheme);
    await page.getByTestId("agent-chip").first().click();
    await page.waitForSelector('[data-testid="card-priority"]', { timeout: 15000 });
    await settled(page);
    await say(page, "Reescribí FR-006 en EARS");
    check((await overflow(page)) <= 0, `review + panel with cards ${w} ${scheme}: no horizontal overflow (${await overflow(page)})`);
    const pb = await page.locator("#agent-panel").boundingBox();
    check(pb.x >= 0 && pb.x + pb.width <= w + 1, `panel inside the viewport ${w} (${Math.round(pb.width)}px)`);
    await shot(page, w < 1100 ? "mobile-sheet" : "panel-review", w, scheme);
    if (w >= 1100) {
      // client-side navigation (a reload would drop the in-memory conversation)
      await page.evaluate(() => { history.pushState({}, "", "/rules/COV001"); dispatchEvent(new PopStateEvent("popstate")); });
      await page.waitForSelector("#rule-COV001");
      await page.waitForSelector("#agent-panel .ag-msg-user");
      check((await page.locator('#agent-panel [data-agent-page="rule"]').count()) === 1, `${w} ${scheme}: same conversation on a rule page`);
      await shot(page, "panel-rule-conversation", w, scheme);
    }
    check(page.errors.length === 0, `${w} ${scheme}: no page errors ${page.errors.join("|")}`);
    await ctx.close();
  }
{
  // 375: the sheet keeps the conversation of the home page
  const { ctx, page } = await fresh({ w: 375, h: 800 });
  await page.goto(BASE + "/");
  await page.getByTestId("agent-chip").first().click();
  await page.waitForSelector('[data-testid="card-review"]', { timeout: 15000 });
  await settled(page);
  await page.getByTestId("card-review").getByRole("link", { name: "Abrir revisión" }).click();
  await page.waitForSelector(".finding");
  await page.getByTestId("panel-toggle").click();
  await page.waitForSelector("#agent-panel .ag-msg-user");
  check((await page.locator("#agent-panel.sheet").count()) === 1 && (await page.locator("#agent-panel .ag-msg-user").count()) === 1, "375: the mobile sheet shows the conversation started on the home page");
  await page.keyboard.press("Escape");
  check((await page.locator("#agent-panel").count()) === 0, "375: Esc closes the sheet");
  await page.getByTestId("panel-toggle").click();
  check((await page.locator("#agent-panel .ag-msg-user").count()) === 1, "375: and reopening keeps it");
  await ctx.close();
}

// ================================================================== 11. server mode: backend engine (FR-019) and its negative
section("11. server mode: --llm demo uses the backend engine; without --llm the simulated one (FR-019)");
{
  const CLI = process.env.SPECREVIEW ?? path.resolve(WEB, "../.venv/bin/specreview");
  const FIXTURE = path.resolve(WEB, "../examples/invitations");
  async function serve(port, extra) {
    const p = spawn(CLI, [FIXTURE, "--serve", "--port", String(port), ...extra], { stdio: "ignore", detached: true });
    procs.push(p);
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/api/features`)).ok) return `http://127.0.0.1:${port}`;
      } catch { await sleep(200); }
    }
    return null;
  }
  if (fs.existsSync(CLI) && fs.existsSync(FIXTURE)) {
    const url = await serve(8793, ["--llm", "demo"]);
    check(!!url, "specreview --serve --llm demo is up");
    if (url) {
      const info = await (await fetch(url + "/api/assistant")).json();
      check(info.available === true && info.demo === true && info.provider === "demo", `GET /api/assistant -> ${JSON.stringify(info)}`);
      const feats = await (await fetch(url + "/api/features")).json();
      const fid = (Array.isArray(feats) ? feats : feats.features)[0];
      const featId = typeof fid === "string" ? fid : fid.id ?? fid.feature;
      const { ctx, page } = await fresh();
      const chat = [];
      page.on("request", (r) => r.url().endsWith("/api/chat") && chat.push(r));
      await page.goto(url + "/");
      await page.getByTestId("agent-chip").first().waitFor();
      const badge = page.getByTestId("agent-badge");
      check((await badge.getAttribute("data-engine")) === "backend-demo" && (await badge.innerText()).includes("Modo demo: respuestas de ejemplo, no de un modelo"), "badge reflects provider demo (backend)");
      await say(page, "Hola, ¿qué podés hacer?");
      check(chat.length === 1, "the message went to POST /api/chat (backend engine)");
      const body = chat[0].postDataJSON();
      check(body.feature === featId && body.messages.at(-1).content === "Hola, ¿qué podés hacer?" && !("focus" in body), `request body: feature=${body.feature}, history, no focus`);
      check((await asstMsgs(page).last().innerText()).trim().length > 10 && (await page.locator('[data-testid^="card-"]').count()) === 0, "streamed text answer (no simulated cards)");
      // sr:ask carries focus
      await page.goto(url + `/reviews/${featId}`);
      await page.waitForSelector(".finding");
      await page.locator(".finding-main").first().click();
      await page.locator(".finding-detail").getByRole("button", { name: "Preguntar al asistente" }).first().click();
      await sleep(400);
      check((await composer(page).inputValue()).length > 20 && (await page.locator(".ag-msg-user").count()) === 0, "backend: sr:ask prefills without sending");
      const nChat = chat.length;
      await composer(page).press("Enter");
      await page.waitForSelector(".ag-msg-user");
      await settled(page);
      const last = chat.at(-1).postDataJSON();
      check(chat.length === nChat + 1 && last.feature === featId && last.focus && /^[A-Z]{3}\d{3}$/.test(last.focus.rule) && Array.isArray(last.focus.ids), `next request carries focus ${JSON.stringify(last.focus)} and feature ${last.feature}`);
      // the next one has no focus any more
      await say(page, "gracias");
      check(!("focus" in chat.at(-1).postDataJSON()), "focus is one-shot");
      // a failing backend: friendly error and Retry (the affordance of the previous panel is kept)
      await page.route("**/api/chat", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "sin modelo", code: "assistant_unavailable" }) }));
      await composer(page).fill("esto falla");
      await composer(page).press("Enter");
      await page.locator(".ag-error").waitFor({ timeout: 8000 });
      check((await page.locator(".ag-error").innerText()).includes("El asistente no está configurado") && (await page.getByRole("button", { name: "Reintentar" }).count()) === 1, "backend failure: friendly error and 'Reintentar'");
      await page.unroute("**/api/chat");
      await page.getByRole("button", { name: "Reintentar" }).click();
      await page.waitForFunction(() => !document.querySelector(".ag-error") && !document.querySelector('[data-testid="agent-stop"]'), null, { timeout: 8000 });
      check((await asstMsgs(page).last().innerText()).trim().length > 10, "Retry gets an answer once the backend is back");
      check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
      await shot(page, "server-backend", 1280, "light");
      await ctx.close();
    }
    const url2 = await serve(8794, []);
    check(!!url2, "specreview --serve (no --llm) is up");
    if (url2) {
      const info = await (await fetch(url2 + "/api/assistant")).json();
      check(info.available === false, `GET /api/assistant without --llm -> available:false`);
      const { ctx, page } = await fresh();
      const chat = [];
      page.on("request", (r) => r.url().endsWith("/api/chat") && chat.push(r));
      await page.goto(url2 + "/");
      await page.getByTestId("agent-chip").first().waitFor();
      check((await page.getByTestId("agent-badge").getAttribute("data-engine")) === "demo", "no --llm: simulated engine with the demo badge");
      await page.getByTestId("agent-chip").first().click();
      await page.waitForSelector('[data-testid="card-review"]', { timeout: 15000 });
      await settled(page);
      check(chat.length === 0, "no --llm: no request to /api/chat");
      check((await page.getByTestId("card-review").locator(".ag-count-n").count()) === 3, "simulated agent reviews the server's real data");
      check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
      await ctx.close();
    }
  } else console.log("   (skipped: no specreview CLI at", CLI, ")");
}

// ================================================================== 12. embedded: single file and hosted demo page
section("12. embedded: exported single file (no agent) and hosted artifact (simulated agent, offline)");
{
  const src = JSON.parse(fs.readFileSync(`public/samples/${FEATURE}.sources.json`, "utf8"));
  const inject = (html) => html.replace("<!--SPECREVIEW_DATA-->", `<script>window.__SPECREVIEW__ = ${JSON.stringify({ report: rep, sources: src, rules }).replace(/</g, "\\u003c")};</script>`);
  const tmp = fs.mkdtempSync("/tmp/sr-agent-emb-");
  const single = fs.readFileSync("dist-single/index.html", "utf8");
  check(!/ThreadPrimitive|useLocalRuntime|@assistant-ui|demoAgent|review_feature/.test(single), "single build: no assistant-ui and no simulated agent");
  fs.writeFileSync(path.join(tmp, "report.html"), inject(single));
  {
    const { ctx, page } = await fresh();
    await page.goto("file://" + path.join(tmp, "report.html"));
    await page.waitForSelector(".finding");
    await sleep(300);
    check((await page.locator("#agent-panel").count()) === 0 && (await page.getByTestId("panel-toggle").count()) === 0, "single file: no agent panel, no toggle (it needs the local server)");
    check(page.errors.length === 0, "single file: no page errors " + page.errors.join("|"));
    await ctx.close();
  }
  if (fs.existsSync("artifact/template.html")) {
    fs.writeFileSync(path.join(tmp, "artifact.html"), inject(fs.readFileSync("artifact/template.html", "utf8")));
    for (const [w, scheme] of [[1280, "light"], [375, "dark"]]) {
      const { ctx, page } = await fresh({ w, scheme });
      await page.route("https://cdnjs.cloudflare.com/**", (route) => {
        const u = route.request().url();
        const f = /react-dom/.test(u) ? "node_modules/react-dom/umd/react-dom.production.min.js" : "node_modules/react/umd/react.production.min.js";
        route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(f) });
      });
      const reqs = [];
      page.on("request", (r) => !r.url().startsWith("file://") && !r.url().startsWith("data:") && !r.url().includes("cdnjs.cloudflare.com") && reqs.push(r.url()));
      await page.goto("file://" + path.join(tmp, "artifact.html"));
      await page.waitForSelector(".finding", { timeout: 10000 });
      if (w < 1100) await page.getByTestId("panel-toggle").click();
      const panel = page.locator("#agent-panel");
      await panel.getByTestId("agent-chip").first().waitFor();
      check((await panel.getByTestId("agent-context-name").textContent()).trim() === `Feature: ${rep.feature}`, `artifact ${w}: context chip names the embedded report's feature`);
      check((await panel.getByTestId("agent-badge").getAttribute("data-engine")) === "demo", `artifact ${w}: demo badge`);
      await panel.getByTestId("agent-chip").first().click(); // ¿Qué arreglo primero?
      await panel.getByTestId("card-priority").waitFor({ timeout: 15000 });
      await settled(page);
      check((await panel.getByTestId("priority-item").count()) >= 3, `artifact ${w}: the simulated agent answers offline over the embedded report`);
      await page.getByTestId("agent-new").click();
      await composer(page).fill(`Revisá ${rep.feature}`);
      await composer(page).press("Enter");
      await panel.getByTestId("card-review").waitFor({ timeout: 15000 });
      await settled(page);
      check(+(await panel.getByTestId("count-blocker").innerText()) === rep.summary.blocker, `artifact ${w}: review card counts come from the embedded report`);
      await panel.getByRole("link", { name: "Abrir revisión" }).click();
      await page.waitForSelector(".finding");
      check(reqs.length === 0, `artifact ${w}: no network requests (${reqs.length})`);
      check((await overflow(page)) <= 0, `artifact ${w}: no horizontal overflow`);
      check(page.errors.length === 0, `artifact ${w}: no page errors ${page.errors.join("|")}`);
      await shot(page, "artifact", w, scheme);
      await ctx.close();
    }
  }
  console.log(`sizes: dist-single/index.html ${(fs.statSync("dist-single/index.html").size / 1024).toFixed(0)} KB (${(zlib.gzipSync(fs.readFileSync("dist-single/index.html")).length / 1024).toFixed(0)} KB gz); artifact/template.html ${(fs.statSync("artifact/template.html").size / 1024).toFixed(0)} KB (${(zlib.gzipSync(fs.readFileSync("artifact/template.html")).length / 1024).toFixed(0)} KB gz)`);
}

console.log("\nsummary:", JSON.stringify(sizes));
await browser.close();
killAll();
console.log(`\n${passes} checks passed, ${fails.length} failed`);
console.log(fails.length ? "FAILED:\n - " + fails.join("\n - ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
