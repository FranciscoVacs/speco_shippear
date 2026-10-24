// Spec 014 (initial portrait) UI: queue, decisions, baseline, drift and consent, in a real browser with NO saved state.
//   cd web && node scripts/verify-portrait.mjs      (SKIP_BUILD=1 reuses dist/)
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
  await ctx.addInitScript(() => { try { localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-panel", "0"); } catch {} });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png` });
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);


const card = (page, code) => page.locator(`article[data-code="${code}"]`);
const num = async (page, id) => Number(await page.getByTestId(id).innerText());
const waitStat = (page, id, n) => page.waitForFunction(([i, v]) => Number(document.querySelector(`[data-testid=${i}]`)?.textContent) === v, [id, n]);

// ---------------------------------------------------------------- the first view
{
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/portrait`);
  await page.waitForSelector("article[data-code]");
  const codes = await page.$$eval("#pt-queue ~ .pt-list article, section[aria-labelledby=pt-queue] article", (n) => n.map((a) => a.dataset.code));
  check(JSON.stringify(codes) === JSON.stringify(["BR-001", "BR-002", "BR-003", "BR-004", "BR-005"]), `queue lists the proposals, high risk first (${codes.join(",")})`);
  check((await num(page, "pt-n-proposed")) === 5 && (await num(page, "pt-n-confirmed")) === 1 && (await num(page, "pt-n-drift")) === 1, "summary: 5 waiting, 1 confirmed, 1 change not decided");
  check((await page.locator("section.pt-drift li[data-drift]").count()) === 1, "a change that touched a confirmed rule is shown before the queue");
  for (const id of ["pt-confirmed", "pt-rejected", "pt-baseline", "pt-repos"]) {
    check((await page.locator(`#${id}-h button`).getAttribute("aria-expanded")) === "false", `${id} is collapsed on the first view`);
  }
  check((await page.locator("article[data-code]").count()) === 5, "only the queue's rule cards are on screen at first (5)");
  check((await card(page, "BR-001").locator(".pt-hypo").count()) === 1 && (await card(page, "BR-002").locator(".pt-hypo").count()) === 0, "a rule inferred from code is labelled as a hypothesis, one from a spec is not");
  check((await card(page, "BR-001").locator("pre").innerText()).includes("days_since_purchase <= 14"), "each card shows the code that supports it");
  await shot(page, "portrait-first-view-1280-light");
  const words = await page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const el = n.parentElement; if (/hallazgo|requisito/i.test(n.textContent) && !el.closest("[hidden], .disclosure") && el.getBoundingClientRect().width) out.push(n.textContent.trim()); } return out; });
  check(words.length === 0, "SC-003: the page does not say 'hallazgo' or 'requisito' " + words.join("|"));
  check(errors.length === 0, "no page errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- deciding
{
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/portrait`);
  await page.waitForSelector("article[data-code]");

  // confirm, with the keyboard
  await card(page, "BR-001").getByRole("button", { name: "Confirmar" }).focus();
  await page.keyboard.press("Enter");
  await waitStat(page, "pt-n-proposed", 4);
  check((await num(page, "pt-n-confirmed")) === 2 && (await card(page, "BR-001").count()) === 0, "confirming moves the rule out of the queue (keyboard)");
  check((await page.locator(".toasts").innerText()).includes("BR-001 confirmada"), "a toast confirms it");

  // correct: empty is refused, a duplicate is refused, a real correction is confirmed
  await card(page, "BR-002").getByRole("button", { name: "Corregir" }).click();
  const ta = card(page, "BR-002").locator("textarea");
  await ta.fill("   ");
  await card(page, "BR-002").getByRole("button", { name: "Guardar y confirmar" }).click();
  check((await card(page, "BR-002").getByRole("alert").innerText()).includes("Escribí cómo debería decir"), "an empty correction is refused");
  await ta.fill("Quien recibe una invitación recibe un email en menos de 60 segundos");
  await card(page, "BR-002").getByRole("button", { name: "Guardar y confirmar" }).click();
  check((await card(page, "BR-002").getByRole("alert").innerText()).includes("Ya existe una regla igual"), "a correction that copies another rule is refused");
  await ta.fill("Solo los dueños pueden invitar miembros nuevos");
  await card(page, "BR-002").getByRole("button", { name: "Guardar y confirmar" }).click();
  await waitStat(page, "pt-n-proposed", 3);

  // reject: a reason is mandatory
  await card(page, "BR-004").getByRole("button", { name: "Rechazar" }).click();
  await card(page, "BR-004").getByRole("button", { name: "Rechazar la regla" }).click();
  check((await card(page, "BR-004").getByRole("alert").innerText()).includes("Contá por qué la rechazás"), "rejecting without a reason is refused");
  await card(page, "BR-004").locator("textarea").fill("Ya no borramos invitaciones");
  await card(page, "BR-004").getByRole("button", { name: "Rechazar la regla" }).click();
  await waitStat(page, "pt-n-proposed", 2);

  // the decided ones are in their sections, with who and why
  await page.locator("#pt-confirmed-h button").click();
  const conf = page.locator("#pt-confirmed-body");
  check((await conf.innerText()).includes("Solo los dueños pueden invitar miembros nuevos") && (await conf.innerText()).includes("Confirmada por Alex Demo"), "a corrected rule appears confirmed with the new text and who decided");
  await page.locator("#pt-rejected-h button").click();
  check((await page.locator("#pt-rejected-body").innerText()).includes("Ya no borramos invitaciones"), "a rejected rule keeps its reason");
  await shot(page, "portrait-decided-1280-light");

  // drift: a reason is mandatory
  await page.getByRole("button", { name: "Reconocer el cambio" }).click();
  await page.getByRole("button", { name: "Reconocer", exact: true }).click();
  check((await page.locator("section.pt-drift").getByRole("alert").innerText()).includes("Contá por qué este cambio está bien"), "acknowledging a change without a reason is refused");
  await page.locator("section.pt-drift textarea").fill("Los dueños decidieron suspender a los 45 días");
  await page.getByRole("button", { name: "Reconocer", exact: true }).click();
  await waitStat(page, "pt-n-drift", 0);
  check((await page.locator("section.pt-drift").count()) === 0, "once acknowledged the change leaves the top of the page");

  // freeze (SC-002)
  await page.getByRole("button", { name: "Congelar línea base" }).first().click();
  const dlg = page.getByRole("dialog");
  check((await dlg.locator("input").inputValue()) === "Línea base 1", "the freeze dialog suggests a name");
  await dlg.getByRole("button", { name: "Congelar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".pt-base")?.textContent?.startsWith("#"));
  const h1 = await page.locator(".pt-base").innerText();
  await page.getByRole("button", { name: "Congelar línea base" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Congelar", exact: true }).click();
  await page.waitForTimeout(300);
  const h2 = await page.locator(".pt-base").innerText();
  check(h1 === h2, `SC-002: the same confirmed rules give the same hash (${h1})`);
  await card(page, "BR-003").getByRole("button", { name: "Confirmar" }).click();
  await waitStat(page, "pt-n-proposed", 1);
  await page.getByRole("button", { name: "Congelar línea base" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Congelar", exact: true }).click();
  await page.waitForFunction((old) => document.querySelector(".pt-base")?.textContent !== old, h1);
  check(true, "SC-002: a different set of confirmed rules gives a different hash");
  await page.locator("#pt-baseline-h button").click();
  check((await page.locator("#pt-baseline-body li").count()) === 3, "the three frozen baselines are listed");

  // everything survives a reload
  await page.reload();
  await page.waitForSelector(".stats");
  check((await num(page, "pt-n-proposed")) === 1 && (await num(page, "pt-n-confirmed")) === 4 && (await page.locator(".pt-base").innerText()).startsWith("#"), "decisions and baselines are remembered after a reload");
  check(errors.length === 0, "no page errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- consent (NFR-001)
{
  const { ctx, page } = await open();
  await page.goto(`${base}/portrait`);
  await page.waitForSelector("article[data-code]");
  await page.locator("#pt-repos-h button").click();
  const box = page.locator("#pt-repos-body input[type=checkbox]").first();
  check(!(await box.isChecked()), "code analysis is off by default");
  check((await page.locator("#pt-repos-body").innerText()).includes("el código no sale hacia ningún modelo"), "the page says what consent means");
  await box.check();
  await page.reload();
  const btn = page.locator("#pt-repos-h button");
  await btn.waitFor();
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();      // an opened section is remembered (spec 011)
  check(await page.locator("#pt-repos-body input[type=checkbox]").first().isChecked(), "the choice is remembered");
  await ctx.close();
}

// ---------------------------------------------------------------- how people get there
{
  const { ctx, page } = await open();
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card, [data-testid=portrait-notice]");
  const notice = page.getByTestId("portrait-notice");
  check((await notice.innerText()).includes("6 reglas de tu software actual esperan tu confirmación"), "Decisions points at the portrait with the count (rules + changes)");
  const links = await page.$$eval(".sb-nav > a.sb-link", (n) => n.length);
  check(links === 3, `the sidebar still has 3 links on the first view (${links})`);
  await notice.getByRole("link").click();
  await page.waitForURL("**/portrait");
  await page.getByRole("button", { name: "Más" }).click();
  check((await page.locator(".sidebar a[href='/portrait']").count()) === 1, "the portrait is under 'Más' in the sidebar");
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[role=dialog] input");
  await page.fill("[role=dialog] input", "retrato");
  check((await page.getByRole("dialog").getByText("Retrato inicial").count()) >= 1, "the command palette finds it");
  await ctx.close();
}

// ---------------------------------------------------------------- English, mobile, storage blocked
{
  const { ctx, page } = await open({ init: () => { try { localStorage.setItem("sr-lang", "en"); } catch {} } });
  await page.goto(`${base}/portrait`);
  await page.waitForSelector("article[data-code]");
  check((await page.locator("h1").first().innerText()).includes("Initial portrait"), "English: title");
  check((await card(page, "BR-001").locator("h3").innerText()) === "Annual plans are refunded in full if cancelled within 14 days", "English: seeded rules are translated");
  await ctx.close();
}
{
  const { ctx, page } = await open({ w: 390, h: 800 });
  await page.goto(`${base}/portrait`);
  await page.waitForSelector("article[data-code]");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "no horizontal overflow at 390px");
  await shot(page, "portrait-first-view-390-light");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({ init: () => Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }) });
  await page.goto(`${base}/portrait`);
  await page.waitForSelector("article[data-code]");
  await card(page, "BR-001").getByRole("button", { name: /^(Confirmar|Confirm)$/ }).click();
  await waitStat(page, "pt-n-proposed", 4);
  check(errors.length === 0, "storage blocked: it works and nothing throws " + errors.join("|"));
  await ctx.close();
}

await browser.close();
server.close();
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log("\nall checks passed");
