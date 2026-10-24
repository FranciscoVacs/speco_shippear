// Spec 011 (simple by default): checks every NFR and success criterion in a real browser, with NO saved choices (a first visit).
//   cd web && node scripts/verify-simple.mjs      (SKIP_BUILD=1 reuses dist/)
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
const FEATURE = "003-team-invitations";
const report = JSON.parse(fs.readFileSync(`public/samples/${FEATURE}.report.json`, "utf8"));
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

// ---------------------------------------------------------------- NFR-001 / SC-001: the sidebar
{
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  const links = await page.$$eval(".sb-nav > a.sb-link", (n) => n.map((a) => a.textContent.trim()));
  check(links.length <= 3 && links.length === 3, `NFR-001/SC-001: first-visit sidebar has ${links.length} links (${links.join(", ")})`);
  const more = page.locator(".sb-more");
  check((await more.count()) === 1 && (await more.getAttribute("aria-expanded")) === "false", "NFR-001: a control to show the rest exists and is collapsed");
  check(!(await visible(page, ".sidebar a[href='/rules']")) && !(await visible(page, ".sidebar a[href='/docs']")), "NFR-001: Reglas and Documentación are not listed yet");
  check(!(await visible(page, ".promo")), "the promo card is not part of the calm first view");
  await shot(page, "simple-decisions-first-view-1280-light");

  // NFR-005 + NFR-008: open More, it persists
  await more.click();
  check((await more.getAttribute("aria-expanded")) === "true" && (await visible(page, ".sidebar a[href='/rules']")), "NFR-005: 'Más' opens in place and states aria-expanded=true");
  await shot(page, "simple-sidebar-more-1280-light");
  await page.reload();
  await page.waitForSelector(".turn-card");
  check((await page.locator(".sb-more").getAttribute("aria-expanded")) === "true", "NFR-008: the open navigation is remembered after a reload");
  await page.locator(".sb-more").click();
  check(!(await visible(page, ".sidebar a[href='/rules']")), "closing 'Más' hides the secondary links again");

  // NFR-007: the palette reaches a page the sidebar hides
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[role=dialog] input");
  await page.fill("[role=dialog] input", "Reglas");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/rules");
  check(true, "NFR-007: the command palette opens /rules although the sidebar does not list it");
  // being ON a secondary page shows its navigation (you can see where you are)
  await page.waitForSelector(".sidebar a[href='/rules'][aria-current]");
  check(true, "on a secondary page the 'more' group is open so the current page is visible");
  check(errors.length === 0, "no console errors " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- NFR-003 + NFR-004: the decisions page
{
  const { ctx, page } = await open();
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  check((await visible(page, ".turn-card")), "NFR-003: what waits for the approver is shown first");
  check(!(await visible(page, ".goal-card")) && !(await visible(page, ".data-table")), "NFR-003: goals, history and the feature list are collapsed");
  const secs = await page.$$eval(".disclosure", (n) => n.map((s) => ({ open: s.classList.contains("is-open"), sum: s.querySelector(".disclosure-sum")?.textContent.trim() ?? "" })));
  check(secs.length === 3 && secs.every((s) => !s.open), `NFR-003: 3 collapsed sections (${secs.length})`);
  check(secs.every((s) => s.sum.length > 0), `NFR-004: every collapsed heading says how much is inside (${secs.map((s) => s.sum).join(" | ")})`);
  // SC-002: each opens with ONE interaction
  let okAll = true;
  for (let i = 0; i < secs.length; i++) {
    const btn = page.locator(".disclosure-btn").nth(i);
    await btn.click();
    const expanded = (await btn.getAttribute("aria-expanded")) === "true";
    const body = await page.locator(".disclosure-body").nth(i).locator("*").count();
    okAll &&= expanded && body > 0;
  }
  check(okAll, "SC-002: every collapsed section on the decisions page opens with one click");
  await ctx.close();
}

// ---------------------------------------------------------------- NFR-002 + NFR-005 + NFR-006: the review
{
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/reviews/${FEATURE}`);
  await page.waitForSelector(".exec");
  check(await visible(page, ".exec"), "NFR-002: the executive summary is shown first");
  check((await page.locator(".finding").count()) === 0, "NFR-002/SC-001: 0 finding rows until the person asks for them");
  const btn = page.locator("#review-detail-h button");
  check((await btn.getAttribute("aria-expanded")) === "false", "NFR-002: the technical detail is collapsed");
  const sum = await page.locator("#review-detail-h .disclosure-sum").textContent();
  check(sum.includes(String(report.findings.length)) && sum.includes("bloqueantes"), `NFR-004: heading says what is inside ("${sum}")`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(!overflow, "no horizontal overflow");
  await shot(page, "simple-review-first-view-1280-light");

  // NFR-005: keyboard
  await btn.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".finding");
  check((await btn.getAttribute("aria-expanded")) === "true", "NFR-005: Enter opens the section from the keyboard and aria-expanded becomes true");
  await shot(page, "simple-review-detail-open-1280-light");
  await page.keyboard.press("Space");
  check((await btn.getAttribute("aria-expanded")) === "false" && (await page.locator(".finding").count()) === 0, "NFR-005: Space closes it again");

  // NFR-006: 'Ver en la spec' opens the detail and writes a shareable address
  await page.locator(".exec .turn-actions .link", { hasText: "Ver en la spec" }).first().click();
  await page.waitForSelector(".finding");
  const hash = new URL(page.url()).hash;
  check(/^#finding-\d+$/.test(hash), `NFR-006: following a finding writes an address that points at it (${hash})`);
  await ctx.close();

  // opening that address in a fresh visit: the section opens by itself with that finding selected
  const f = await open();
  await f.page.goto(`${base}/reviews/${FEATURE}${hash}`);
  await f.page.waitForSelector(".finding");
  const idx = hash.replace("#finding-", "");
  check((await f.page.locator("#review-detail-h button").getAttribute("aria-expanded")) === "true", "NFR-006: an address that points at a finding opens the section that holds it");
  check(await f.page.locator(`[data-finding="${idx}"]`).first().isVisible(), "NFR-006: the finding the address points at is on screen");
  // ...without overwriting the saved choice: a plain visit afterwards is collapsed again
  await f.page.goto(`${base}/reviews/${FEATURE}`);
  await f.page.waitForSelector(".exec");
  check((await f.page.locator(".finding").count()) === 0, "a deep link does not turn the detail on for good");
  await f.ctx.close();
  check(errors.length === 0, "no console errors " + errors.join("|"));
}

// ---------------------------------------------------------------- NFR-008: remembered across reviews
{
  const { ctx, page } = await open();
  await page.goto(`${base}/reviews/${FEATURE}`);
  await page.waitForSelector(".exec");
  await page.locator("#review-detail-h button").click();
  await page.waitForSelector(".finding");
  await page.goto(`${base}/reviews/001-invoice-exports`);
  await page.waitForSelector(".exec");
  await page.waitForSelector(".finding");
  check(true, "NFR-008: the detail the person opened is open on another review and after navigating");
  await ctx.close();
}

// ---------------------------------------------------------------- edge: storage blocked
{
  const { ctx, page, errors } = await open({ init: () => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); } });
  await page.goto(`${base}/reviews/${FEATURE}`);
  await page.waitForSelector(".exec");
  check((await page.locator(".finding").count()) === 0, "edge: with storage blocked the first view is still the calm one");
  await page.keyboard.press("Escape"); // blocked storage cannot remember that onboarding was seen: dismiss it
  await page.locator("#review-detail-h button").click();
  await page.waitForSelector(".finding");
  check(errors.length === 0, "edge: opening a section with storage blocked does not break the page " + errors.join("|"));
  await ctx.close();
}

// ---------------------------------------------------------------- NFR-009: exported report
{
  const sources = JSON.parse(fs.readFileSync(`public/samples/${FEATURE}.sources.json`, "utf8"));
  const rules = JSON.parse(fs.readFileSync("public/samples/rules.json", "utf8"));
  const html = fs.readFileSync("dist-single/index.html", "utf8").replace("<!--SPECREVIEW_DATA-->", `<script>window.__SPECREVIEW__ = ${JSON.stringify({ report, sources, rules }).replace(/</g, "\\u003c")};</script>`);
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await c2.route("**/__export__", (r) => r.fulfill({ contentType: "text/html", body: html }));
  const p2 = await c2.newPage();
  const errs = [];
  p2.on("pageerror", (e) => errs.push(String(e)));
  await p2.goto(`${base}/__export__`);
  await p2.waitForSelector(".finding");
  check((await p2.locator("#review-detail-h button").getAttribute("aria-expanded")) === "true", "NFR-009: an exported report opens with the technical findings shown");
  check(errs.length === 0, "exported report: no console errors " + errs.join("|"));
  await c2.close();
}

// ---------------------------------------------------------------- phone
{
  const { ctx, page } = await open({ w: 390, h: 844 });
  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), "no horizontal overflow at 390px");
  await shot(page, "simple-decisions-first-view-390-light");
  await ctx.close();
}
await browser.close();
server.close();
console.log(`\n${fails.length ? "FAILED: " + fails.length : "ALL PASSED"}`);
process.exit(fails.length ? 1 : 0);
