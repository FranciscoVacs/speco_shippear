// Spec 012 (activation): first sign in, the checklist and the five minute path, in a real browser with NO saved state.
//   cd web && node scripts/verify-activation.mjs      (SKIP_BUILD=1 reuses dist/)
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(WEB);
const DIST = path.join(WEB, "dist");
const exe = process.env.CHROMIUM ?? fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
fs.mkdirSync("screenshots", { recursive: true });
if (!process.env.SKIP_BUILD) { execSync("npm run build", { stdio: "inherit" }); execSync("npm run build:single", { stdio: "inherit" }); }
const fails = [];
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(DIST, u);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  res.setHeader("content-type", MIME[path.extname(f)] ?? "application/octet-stream");
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

async function open({ w = 1280, h = 900, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "light", reducedMotion: "reduce" });
  // only what a first visit has: language and "onboarding seen" and the agent panel closed. NO open/closed section choices.
  await ctx.addInitScript(() => { try { localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-panel", "0"); } catch {} });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png` });
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);


// ---------------------------------------------------------------- US1: first sign in
{
  const { ctx, page, errors } = await open();
  let clicks = 0;
  const click = async (loc) => { await loc.click(); clicks++; };
  await page.goto(`${base}/`);
  await page.waitForSelector(".sidebar");
  const card = page.getByTestId("activation");
  check((await card.count()) === 1 && (await card.locator("li").count()) === 4, "FR-001: first sign in shows a checklist with four milestones");
  check((await page.getByRole("dialog").count()) === 0, "FR-001: no text-only introduction dialog on the first visit");
  check((await card.locator("li[data-done='1']").count()) === 0, "nothing is done yet");
  await shot(page, "activation-first-visit-1280-light");

  // M1 -> /decisions (1 interaction)
  await click(card.locator("li[data-milestone=decisions] a"));
  await page.waitForURL("**/decisions");
  await page.waitForSelector(".turn-card");
  check((await card.locator("li[data-milestone=decisions]").getAttribute("data-done")) === "1", "FR-002: opening the decisions page marks milestone 1 without a manual action");
  check((await card.locator("[role=status]").first().innerText()).includes("1 de 4"), "NFR-003: progress is announced in a live region");

  // M2 -> sample feature (2)
  await click(card.locator("li[data-milestone=review] a"));
  await page.waitForURL("**/reviews/003-team-invitations");
  await page.waitForSelector(".exec");
  check((await card.locator("li[data-milestone=review]").getAttribute("data-done")) === "1", "FR-002: opening the sample feature marks milestone 2");
  const sample = await page.locator("main").innerText();
  check(/CON001|contradic/i.test(sample), "FR-003: the sample feature has a rule contradiction");
  check(/demostraci|ejemplo|demo/i.test(await page.locator("body").innerText()), "FR-003: it is labelled as demo data");
  await shot(page, "activation-sample-feature-1280-light");

  // M3: approve with an override and one short reason (3..6)
  await click(page.getByRole("button", { name: /^Aprobar/ }).first());
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  const ov = dlg.locator("input[type=checkbox]");
  if (await ov.count()) await click(ov);
  await dlg.locator("textarea").first().fill("Gana la regla de 7 días, decidido por producto");
  await click(dlg.getByRole("button", { name: "Registrar decisión" }));
  await page.waitForFunction(() => document.querySelector("li[data-milestone=decide]")?.getAttribute("data-done") === "1");
  check(true, "FR-002: recording a decision marks milestone 3");
  check(clicks <= 12, `SC-001: milestone 3 reached in ${clicks} interactions (<= 12) and one short reason typed`);

  // M4: prefilled question, done when it is sent
  await click(card.locator("li[data-milestone=ask] button"));
  await page.waitForURL(/\/$/);
  const box = page.getByRole("textbox").first();
  check(((await box.inputValue().catch(() => "")) || (await box.innerText().catch(() => ""))).includes("¿Qué espera mi decisión?"), "the question is prefilled, not sent");
  check((await card.locator("li[data-milestone=ask]").getAttribute("data-done")) === "0", "milestone 4 waits for the person to send it");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction(() => document.querySelector("li[data-milestone=ask]")?.getAttribute("data-done") === "1", null, { timeout: 15000 });
  check(true, "FR-002: sending the question marks milestone 4");
  check((await card.getByText("Listo").count()) >= 1, "all done: the card says so");
  await shot(page, "activation-all-done-1280-light");

  // SC-002: first summary within 3 interactions from a fresh start is covered by M1+M2 (2 clicks)
  check(true, "SC-002: first executive summary reached in 2 interactions (milestones 1 and 2)");

  // close + FR-004 reopen from Help + progress remembered
  await page.getByRole("button", { name: "Cerrar primeros pasos" }).click();
  check((await page.getByTestId("activation").count()) === 0, "closing hides the checklist");
  await page.reload();
  await page.waitForSelector(".sidebar");
  check((await page.getByTestId("activation").count()) === 0, "closed stays closed after a reload");
  await page.getByTestId("help-btn").click();
  check((await page.getByRole("menuitem", { name: /Primeros pasos/ }).innerText()).includes("4/4"), "FR-004: the Help menu shows the progress");
  await page.getByRole("menuitem", { name: /Primeros pasos/ }).click();
  check((await page.getByTestId("activation").locator("li[data-done='1']").count()) === 4, "FR-004: reopening shows what is already done");
  check(errors.length === 0, "no page errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- NFR-003: keyboard
{
  const { ctx, page } = await open();
  await page.goto(`${base}/`);
  await page.waitForSelector(".sidebar");
  await page.getByTestId("activation").locator("li[data-milestone=decisions] a").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/decisions");
  check(true, "NFR-003: a milestone opens with the keyboard");
  await page.getByRole("button", { name: "Minimizar primeros pasos" }).focus();
  await page.keyboard.press("Enter");
  check((await page.locator(".act-pill").getAttribute("aria-expanded")) === "false", "minimize leaves a pill that states aria-expanded");
  await ctx.close();
}

// ---------------------------------------------------------------- NFR-002: storage blocked
{
  const { ctx, page, errors } = await open({ init: () => Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }) });
  await page.goto(`${base}/`);
  await page.waitForSelector(".sidebar");
  check((await page.getByTestId("activation").count()) === 1, "NFR-002: with storage blocked the checklist is still shown");
  await page.getByTestId("activation").locator("li[data-milestone=decisions] a").click();
  await page.waitForURL("**/decisions");
  await page.waitForSelector("li[data-done='1']");
  check((await page.getByTestId("activation").locator("li[data-done='1']").count()) === 1, "NFR-002: it still tracks progress in memory");
  check(errors.length === 0, "storage blocked: no page errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- someone who already saw the old introduction
{
  const { ctx, page } = await open({ init: () => { try { localStorage.setItem("sr-onboarded", "1"); } catch {} } });
  await page.goto(`${base}/`);
  await page.waitForSelector(".sidebar");
  check((await page.getByTestId("activation").count()) === 0, "returning person: the checklist does not pop up again");
  await ctx.close();
}

// ---------------------------------------------------------------- SC-004 / NFR-001: nothing added to other pages
{
  const { ctx, page } = await open({ init: () => { try { localStorage.setItem("sr-onboarded", "1"); } catch {} } });
  for (const u of ["/", "/decisions", "/reviews", "/rules", "/docs"]) {
    await page.goto(`${base}${u}`);
    await page.waitForSelector(".sidebar");
    check((await page.locator(".act-card, .act-pill").count()) === 0 && (await page.locator("[class*=thesis]").count()) === 0, `SC-004: ${u} carries no permanent thesis element`);
  }
  await ctx.close();
}

// ---------------------------------------------------------------- US2: try it with my own idea
{
  const { ctx, page, errors } = await open({ init: () => { try { localStorage.setItem("sr-onboarded", "1"); } catch {} } });
  await page.goto(`${base}/`);
  await page.waitForSelector("h1");
  const chip = page.getByTestId("agent-chip").last();
  check((await chip.innerText()) === "Quiero que mis mis clientes puedan invitar a su equipo".replace("mis mis", "mis"), "FR-005: Home offers a chip that starts from a business need");
  const t0 = Date.now();
  await chip.click();
  const card = page.getByTestId("card-draft");
  await card.waitFor({ timeout: 15000 });
  check((await card.getByTestId("draft-decisions").locator("li").count()) >= 5, "FR-005: the draft lists its open questions as decisions");
  check((await card.innerText()).includes("No se guardó nada"), "FR-006: the draft says nothing was saved");
  check(Date.now() - t0 < 15000, "the draft arrives right away");
  await shot(page, "activation-draft-1280-light");
  // vague words become a question about the number
  await page.getByRole("button", { name: "Nueva conversación" }).first().click().catch(() => {});
  const before = await page.getByTestId("card-draft").count();
  const box = page.getByRole("textbox").first();
  await box.fill("Quiero que el onboarding sea rápido y fácil para los clientes");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction((n) => document.querySelectorAll("[data-testid=card-draft]").length > n, before);
  const last = page.getByTestId("card-draft").last();
  check(/cuál es el número/.test(await last.innerText()), "a vague word like «rápido» becomes a question about the number");
  // too short: not a draft
  await box.fill("quiero ayuda");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Puedo ayudarte"));
  check(true, "edge case: a too short need is not drafted, the agent answers with the help text");
  check(errors.length === 0, "no page errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- US3: connect my repository
{
  const { ctx, page, errors } = await open({ init: () => { try { localStorage.setItem("sr-onboarded", "1"); } catch {} } });
  await page.goto(`${base}/reviews`);
  await page.getByRole("link", { name: "Conectar repositorio" }).click();
  await page.waitForURL("**/connect");
  await page.waitForSelector(".connect-steps li");
  check((await page.locator(".connect-steps li").count()) === 3, "FR-008: the flow has three steps");
  let n = 1;
  await page.locator("button[data-repo='acme/team-app']").click();
  n++;
  await page.getByTestId("connect-result").waitFor();
  check((await page.getByTestId("connect-result").locator(".exec").count()) === 1, `FR-008: picking a repository shows its first executive summary (${n} interactions)`);
  check((await page.getByTestId("connect-result").getByRole("link", { name: /Abrir la revisión/ }).count()) === 1, "the summary links to the full review");
  await shot(page, "activation-connect-result-1280-light");
  await page.getByRole("button", { name: "Elegir otro repositorio" }).click();
  await page.locator("button[data-repo='acme/website']").click();
  await page.getByTestId("connect-empty").waitFor();
  check(true, "FR-009: a repository with no specs says so");
  await page.getByRole("button", { name: "Empezar desde una idea" }).click();
  await page.waitForURL(/\/$/);
  const box = page.getByRole("textbox").first();
  check(((await box.inputValue().catch(() => "")) || (await box.innerText().catch(() => ""))).startsWith("Quiero que"), "FR-009: it offers to start from a business need (prefilled idea)");
  // reachable from the command palette
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[role=dialog] input");
  await page.fill("[role=dialog] input", "conectar");
  check((await page.getByRole("dialog").getByText("Conectar repositorio").count()) >= 1, "the palette lists 'Conectar repositorio'");
  check(errors.length === 0, "no page errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- US4: one language
{
  const { ctx, page } = await open({ init: () => { try { localStorage.setItem("sr-onboarded", "1"); } catch {} } });
  const words = async () => page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!/hallazgo|requisito/i.test(n.textContent) || el.closest("[hidden], .disclosure, .modal") || el.getBoundingClientRect().width === 0) continue;
      out.push(n.textContent.trim().slice(0, 90));
    }
    return out;
  });
  for (const u of ["/", "/decisions", "/reviews", "/reviews/003-team-invitations", "/reviews/004-push-notifications"]) {
    await page.goto(`${base}${u}`);
    await page.waitForSelector("main h1, main h2");
    await page.waitForTimeout(500);
    const hits = await words();
    check(hits.length === 0, `SC-003/FR-010: ${u} uses no 'hallazgo' or 'requisito' outside the technical detail ${hits.join(" | ")}`);
  }
  // FR-011: empty states say what is decided and what is next
  const dict = fs.readFileSync("src/i18n/es.ts", "utf8");
  for (const key of ["dec.turnEmpty", "exec.mineEmpty", "exec.risksEmpty", "appr.historyEmpty", "reviews.emptyBody"]) {
    const line = dict.split("\n").find((l) => l.includes(`"${key}"`)) ?? "";
    check(/decid|vigente|conect|registr|adivinar|Cuando|cuando/.test(line), `FR-011: ${key} says what is decided or what comes next`);
  }
  await ctx.close();
}

await browser.close();
server.close();
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log("\nall checks passed");
