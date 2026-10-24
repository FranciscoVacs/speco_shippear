// Phase 3 check: the pages for the person who approves (/decisions and the executive summary of a review).
//   cd web && node scripts/verify-decisions.mjs      (SKIP_BUILD=1 reuses dist/)
// Serves dist/ like Vercel (SPA fallback), asserts what the page says against the generated sample reports, and takes screenshots.
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
if (!process.env.SKIP_BUILD) execSync("npm run build", { stdio: "inherit" });

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
const reports = Object.fromEntries(fs.readdirSync("public/samples").filter((n) => n.endsWith(".report.json")).map((n) => [n.replace(".report.json", ""), JSON.parse(fs.readFileSync(`public/samples/${n}`, "utf8"))]));
const products = JSON.parse(fs.readFileSync("public/samples/product.json", "utf8"));
const byVerdict = (v) => Object.values(reports).filter((r) => r.decision.verdict === v).length;
const mineTotal = Object.values(reports).reduce((n, r) => n + r.findings.filter((f) => f.owner === "decision" && f.severity !== "suggestion").length, 0);

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
async function open({ w = 1280, h = 900, theme = "light", lang = "es" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(([l, t]) => { try { localStorage.setItem("sr-lang", l); localStorage.setItem("sr-theme", t); localStorage.setItem("sr-onboarded", "1"); for (const k of ["dec-goals", "dec-hist", "dec-all", "review-detail"]) localStorage.setItem("sr-open-" + k, "1"); if (!window.__keepPanel) localStorage.setItem("sr-panel", "0"); } catch {} }, [lang, theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });

// ---------------------------------------------------------------- /decisions
{
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  const stats = await page.$$eval(".dstat .stat-v", (n) => n.map((x) => Number(x.textContent)));
  check(JSON.stringify(stats) === JSON.stringify(["needs_decision", "blocked", "needs_work", "ready"].map(byVerdict)), `stat tiles match the reports (${stats})`);
  const cards = await page.$$eval(".turn-card", (n) => n.length);
  check(cards === byVerdict("needs_decision"), `one "Tu turno" card per feature waiting on the approver (${cards})`);
  const items = await page.$$eval(".turn-card .turn-item", (n) => n.length);
  check(items === mineTotal, `every decision-owned finding is listed (${items}/${mineTotal})`);
  const text = await page.$eval(".turn-groups", (n) => n.textContent);
  check(!/\b(COV|QUA|CON)\d{3}\b/.test(text), "no rule ids in the approver's list");
  const badge = Number(await page.$eval(".sb-badge", (n) => n.firstChild.textContent));
  check(badge === mineTotal, `sidebar badge counts pending decisions (${badge})`);
  const crumb = await page.$eval(".topbar, header", (n) => n.textContent).catch(() => "");
  check(!crumb.includes("No encontrada"), "breadcrumb knows /decisions");
  const rows = await page.$$eval("section[aria-labelledby=dec-all-h] .data-table tbody tr", (n) => n.map((r) => r.querySelector("th a").textContent));
  check(rows.length === Object.keys(reports).length, `portfolio lists all ${rows.length} features`);
  const firstVerdicts = await page.$$eval("section[aria-labelledby=dec-all-h] .data-table tbody tr .verdict", (n) => n.map((x) => x.className.match(/v-(\w+)/)[1]));
  check(firstVerdicts[0] === "needs_decision" && firstVerdicts.at(-1) === "ready", "portfolio is sorted by urgency");
  // product layer: goals -> features
  const goalCards = await page.$$eval(".goal-card", (n) => n.length);
  check(goalCards === products.length, `one goal card per repository with a product folder (${goalCards})`);
  const gaps = await page.$$eval(".goal.g-gap .goal-id", (n) => n.map((x) => x.textContent).sort());
  const wantGaps = products.flatMap((p) => p.report.goals.filter((g) => !g.covered).map((g) => g.id)).sort();
  check(JSON.stringify(gaps) === JSON.stringify(wantGaps), `uncovered goals are flagged (${gaps})`);
  const chips = await page.$$eval(".goal.g-ok .chip", (n) => n.length);
  check(chips === products.flatMap((p) => p.report.goals.filter((g) => g.covered).flatMap((g) => g.features)).length, `covered goals link their features (${chips})`);
  await page.locator("#dec-goals-h").scrollIntoViewIfNeeded();
  await shot(page, "decisions-goals-1280-light");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "decisions-page-1280-light");
  check(errors.length === 0, "no console errors on /decisions " + errors.join("|"));
  await ctx.close();
}
// ---------------------------------------------------------------- /decisions dark + mobile + English
{
  const { ctx, page } = await open({ theme: "dark" });
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  await shot(page, "decisions-page-1280-dark");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({ w: 390, h: 844 });
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(!overflow, "no horizontal overflow at 390px");
  await shot(page, "decisions-page-390-light");
  check(errors.length === 0, "no console errors at 390px");
  await ctx.close();
}
{
  const { ctx, page } = await open({ lang: "en" });
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  check((await page.textContent("h1")).includes("Decisions") && (await page.textContent(".turn-groups")).includes("agent"), "English UI");
  await ctx.close();
}
// ---------------------------------------------------------------- executive summary on a review
for (const [id, verdict, label, shotName] of [
  ["003-team-invitations", "needs_decision", "Necesita tu decisión", "exec-summary-needs-decision-1280-light"],
  ["002-loyalty-points", "blocked", "Bloqueada", "exec-summary-blocked-1280-light"],
  ["004-push-notifications", "needs_work", "Necesita trabajo del equipo", "exec-summary-needs-work-1280-light"],
  ["003-annual-plans", "needs_decision", "Necesita tu decisión", "exec-summary-product-layer-1280-light"],
  ["005-agent-first-app", "ready", "Lista para construir", null],
]) {
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/reviews/${id}`);
  await page.waitForSelector(".exec");
  const badge = await page.$eval(".exec .verdict", (n) => n.textContent.trim());
  check(badge === label, `${id}: verdict "${badge}"`);
  const cls = await page.$eval(".exec", (n) => n.className);
  check(cls.includes(`v-${verdict}-card`), `${id}: card styled for ${verdict}`);
  const mineShown = await page.$$eval(".exec .turn-item", (n) => n.length);
  const mineExpected = reports[id].findings.filter((f) => f.owner === "decision" && f.severity !== "suggestion").length;
  check(mineShown === mineExpected, `${id}: ${mineShown} items in "Tu turno" (expected ${mineExpected})`);
  const execText = await page.$eval(".exec", (n) => n.textContent);
  check(!/\b(COV|QUA|CON)\d{3}\b/.test(execText), `${id}: no rule ids in the executive summary`);
  if (shotName) await shot(page, shotName);
  if (id === "003-team-invitations") {
    await page.click(".exec-head .btn");
    await page.waitForSelector("[role=status], .toast", { timeout: 3000 }).catch(() => {});
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    check(clip.includes("Estado: Necesita tu decisión") && clip.includes("Esperan tu decisión"), "copy puts a plain-text summary on the clipboard");
    await page.click(".exec .turn-actions .link >> nth=0");
    check(await page.$eval(".exec", (n) => !!n), "'Ver en la spec' does not break the page");
  }
  check(errors.length === 0, `${id}: no console errors ${errors.join("|")}`);
  await ctx.close();
}
// ---------------------------------------------------------------- approvals (demo backend: browser-only)
const seeded = JSON.parse(fs.readFileSync("public/samples/approvals.json", "utf8"));
{
  const { ctx, page, errors } = await open();
  const panel = async (id) => {
    await page.goto(`${base}/reviews/${id}`);
    await page.waitForSelector(".appr-line");
    await page.waitForTimeout(300); // spec hashes are computed async in the browser
    return { line: await page.$eval(".appr-line", (n) => n.textContent), html: await page.$eval(".appr", (n) => n.textContent) };
  };
  let r = await panel("001-spec-review-engine");
  check(r.line.includes("Aprobada por Sofía Ramos"), "001: shows the seeded approval");
  check(r.html.includes("corresponde a la versión actual") && !r.html.includes("cambió desde"), "001: a browser-computed hash equals the backend's: approval is current, not stale");
  r = await panel("005-agent-first-app");
  check(r.html.includes("La spec cambió desde esa decisión (spec.md)"), "005: approval of an older version is flagged stale and names the file");
  await shot(page, "approval-stale-1280-light");
  r = await panel("003-team-invitations");
  check(r.line.includes("Rechazada por Diego Pérez") && r.html.includes("se contradicen"), "003: rejection with its reason");
  r = await panel("003-conversational-assistant");
  check(r.html.includes("Condiciones") && r.html.includes("no escribe en el repo"), "003-assistant: conditions are listed");
  r = await panel("004-push-notifications");
  check(r.line.includes("delegó en Sofía Ramos"), "004: delegation names the delegate");

  // decide on a blocked feature (002-loyalty-points has a blocker)
  r = await panel("002-loyalty-points");
  check(r.line.includes("Todavía nadie aprobó"), "002: no approval yet");
  await page.click(".appr-actions .btn.primary");
  await page.waitForSelector("[role=dialog]");
  await page.click("[role=dialog] .btn.primary");
  check((await page.textContent("[role=dialog] .form-error")).includes("bloqueantes"), "approving a blocked feature requires the override box");
  await page.check("[role=dialog] input[type=checkbox]");
  await page.click("[role=dialog] .btn.primary");
  check((await page.textContent("[role=dialog] .form-error")).includes("motivo"), "override requires a reason");
  await page.fill("[role=dialog] textarea", "Riesgo aceptado: sale detrás de un flag");
  await shot(page, "approval-dialog-override-1280-light");
  await page.click("[role=dialog] .btn.primary");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  const after = await page.$eval(".appr", (n) => n.textContent);
  check(after.includes("Aprobada por Alex Demo") && after.includes("override") && after.includes("Riesgo aceptado"), "decision recorded with the override flag and the reason");
  await shot(page, "approval-recorded-1280-light");
  await page.reload();
  await page.waitForSelector(".appr-line");
  check((await page.$eval(".appr-line", (n) => n.textContent)).includes("Aprobada por Alex Demo"), "the decision survives a reload (browser storage)");

  // reject / conditions / delegate validation on another feature
  await page.goto(`${base}/reviews/004-push-notifications`);
  await page.waitForSelector(".appr-actions");
  await page.click(".appr-actions .btn >> nth=2"); // Rechazar
  await page.click("[role=dialog] .btn.primary");
  check((await page.textContent("[role=dialog] .form-error")).includes("motivo"), "reject requires a reason");
  await page.keyboard.press("Escape");
  await page.click(".appr-actions .btn >> nth=1"); // con condiciones
  await page.fill("[role=dialog] textarea >> nth=0", "porque sí");
  await page.click("[role=dialog] .btn.primary");
  check((await page.textContent("[role=dialog] .form-error")).includes("condición"), "conditions are required for 'approve with conditions'");
  await page.keyboard.press("Escape");
  await page.click(".appr-actions .btn >> nth=3"); // delegar
  await page.fill("[role=dialog] textarea", "x");
  await page.click("[role=dialog] .btn.primary");
  check((await page.textContent("[role=dialog] .form-error")).includes("delegar"), "delegation requires picking someone");
  const opts = await page.$$eval("[role=dialog] select option", (n) => n.map((o) => o.textContent));
  check(opts.includes("Sofía Ramos") && !opts.includes("Alex Demo"), "you cannot delegate to yourself");
  await page.keyboard.press("Escape");

  // history on the decisions page
  await page.goto(`${base}/decisions`);
  await page.waitForFunction((n) => document.querySelectorAll("section[aria-labelledby=dec-hist-h] tbody tr").length >= n, seeded.entries.length + 1);   // the table fills in two steps (seed, then the new entry)
  const rows = await page.$$eval("section[aria-labelledby=dec-hist-h] tbody tr", (n) => n.map((x) => x.textContent));
  check(rows.length === seeded.entries.length + 1 && rows[0].includes("002-loyalty-points"), `history lists seeded + new entries, newest first (${rows.length})`);
  await page.locator("#dec-hist-h").scrollIntoViewIfNeeded();
  await shot(page, "approval-history-1280-light");
  check(errors.length === 0, "no console errors in the approval flows " + errors.join("|"));
  await ctx.close();
}
await browser.close();
server.close();
console.log(`\n${fails.length ? "FAILED: " + fails.length : "ALL PASSED"}`);
process.exit(fails.length ? 1 : 0);
