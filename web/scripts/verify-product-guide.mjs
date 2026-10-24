// /docs/product (guide for product and management): checked in a real browser.
//   cd web && node scripts/verify-product-guide.mjs      (SKIP_BUILD=1 reuses dist/)
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
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

async function open({ w = 1280, h = 900, scheme = "light", lang = "es" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript((l) => { try { localStorage.setItem("sr-lang", l); localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-panel", "0"); } catch {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const IDS = ["ciclo", "setup", "dia", "recetas", "cuello", "limites"];

for (const lang of ["es", "en"]) {
  const { ctx, page, errors } = await open({ lang });
  await page.goto(base + "/docs/product");
  await page.waitForSelector("#pm-ciclo");
  check(await page.locator("h1").innerText() === (lang === "es" ? "Speco para producto y gerencia" : "Speco for product and management"), `${lang}: title in the language`);
  for (const id of IDS) check(await page.locator(`#pm-${id}`).count() === 1, `${lang}: section ${id}`);
  check(await page.locator("#pm-ciclo tbody tr").count() === 4, `${lang}: four touchpoints`);
  check(await page.locator("#pm-recetas details.recipe").count() === 7, `${lang}: seven recipes`);
  check(!/Spanish|español/i.test(await page.locator("article").innerText()) || lang === "es", `${lang}: no language notice`);
  // a recipe with a prompt copies exactly that prompt
  await page.locator("#pm-receta-3 summary").click();
  await page.locator("#pm-receta-3 button:has-text('Copiar'), #pm-receta-3 button:has-text('Copy')").first().click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(/pending_decisions/.test(clip), `${lang}: copy button copies the recipe prompt`);
  check(errors.length === 0, `${lang}: no page errors ${errors.join("|")}`);
  await ctx.close();
}

{ // deep link scrolls and focuses
  const { ctx, page } = await open();
  await page.goto(base + "/docs/product#pm-limites");
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.activeElement?.id === "pm-limites"), "deep link focuses its section");
  await ctx.close();
}
{ // reachable from the help menu
  const { ctx, page } = await open();
  await page.goto(base + "/decisions");
  await page.locator("[data-testid=help-btn]").click();
  await page.locator("[role=menuitem]", { hasText: "Para producto y gerencia" }).click();
  await page.waitForURL("**/docs/product");
  check(true, "help menu leads to the page");
  await ctx.close();
}
for (const scheme of ["light", "dark"]) { // phone width: no sideways scroll
  const { ctx, page } = await open({ w: 390, h: 800, scheme });
  await page.goto(base + "/docs/product");
  await page.waitForSelector("#pm-ciclo");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 0, `390px ${scheme}: no horizontal page scroll (${over})`);
  await page.screenshot({ path: `screenshots/product-guide-390-${scheme}.png`, fullPage: false });
  await ctx.close();
}
{ const { ctx, page } = await open(); await page.goto(base + "/docs/product"); await page.waitForSelector("#pm-ciclo"); await page.screenshot({ path: "screenshots/product-guide-1280-light.png" }); await ctx.close(); }

await browser.close(); server.close();
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log("\nall good");
