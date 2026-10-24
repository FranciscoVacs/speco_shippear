// /docs/developers (onboarding for people who code): checked in a real browser.
//   cd web && node scripts/verify-developers.mjs      (SKIP_BUILD=1 reuses dist/)
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
const shot = (page, name, full = false) => page.screenshot({ path: `screenshots/${name}.png`, fullPage: full });

// ---------------------------------------------------------------- the page itself
{
  const { ctx, page, errors } = await open();
  await page.goto(`${base}/docs/developers`);
  await page.waitForSelector("main h1");
  check((await page.locator("main h1").innerText()) === "Primeros pasos para desarrolladores", "/docs/developers renders its h1");
  check((await page.locator("main h1").count()) === 1, "exactly one h1");
  check((await page.locator(".sb-link[aria-current=page], .sidebar a[aria-current=page]").count()) >= 0, "page sits under Documentación in the sidebar");
  const demo = await page.locator("#dev-demo .codeblock pre").first().innerText();
  check(demo.includes("uvx --from git+https://github.com/agustindelmonti/speco.ia specreview demo"), "step 1 shows the one-line demo command");
  check((await page.locator("#dev-demo .codeblock").count()) >= 4, "step 1 has the command, the real output, install and own-repo blocks");
  await shot(page, "developers-top-1280-light");

  // TOC deep link scrolls and focuses the section
  await page.locator(".toc-desktop a", { hasText: "Conectá el MCP" }).click();
  await page.waitForTimeout(150);
  check(new URL(page.url()).hash === "#dev-mcp", "TOC link writes #dev-mcp");
  check(await page.evaluate(() => document.activeElement?.id === "dev-mcp" && document.getElementById("dev-mcp").getBoundingClientRect().top < 220), "TOC link scrolls to the section and focuses it");
  await page.goto(`${base}/docs/developers#dev-recetas`);
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.activeElement?.id === "dev-recetas"), "direct #dev-recetas link lands focused on the section");

  // client tabs: all five clients, snippet changes, keyboard, remembered
  await page.goto(`${base}/docs/developers#dev-mcp`);
  const tabs = page.locator("[role=tab]");
  check((await tabs.count()) === 5, "five MCP clients (Claude Code, Cursor, VS Code, Claude Desktop, Codex)");
  check((await page.locator("[role=tab][aria-selected=true]").innerText()) === "Claude Code", "Claude Code is the default tab");
  check((await page.locator("#dev-client-panel").innerText()).includes("/plugin install specreview@specreview"), "Claude Code panel shows the plugin install");
  check((await page.locator("#dev-client-panel .codeblock").count()) === 2 && (await page.locator("#dev-client-panel").innerText()).includes("claude mcp add specreview"), "Claude Code panel also offers the MCP-only command as a copyable block");
  check((await page.locator("nav.crumbs").innerText()).replace(/\s+/g, " ").includes("Documentación Primeros pasos para desarrolladores"), "top bar breadcrumb reads Documentación › Primeros pasos para desarrolladores (not «No encontrada»)");
  await page.locator("[role=tab]", { hasText: "Cursor" }).click();
  const cursor = await page.locator("#dev-client-panel pre").innerText();
  check(cursor.includes('"mcpServers"') && cursor.includes('"specreview", "mcp", "."'), "Cursor panel shows .cursor/mcp.json with the mcp command");
  check(JSON.parse(cursor).mcpServers.specreview.command === "uvx", "the Cursor snippet is valid JSON");
  await page.locator("[role=tab][aria-selected=true]").focus();
  await page.keyboard.press("ArrowRight");
  check((await page.locator("[role=tab][aria-selected=true]").innerText()) === "VS Code" && (await page.evaluate(() => document.activeElement?.textContent === "VS Code")), "ArrowRight moves selection and focus to VS Code");
  check(JSON.parse(await page.locator("#dev-client-panel pre").innerText()).servers.specreview.type === "stdio", "the VS Code snippet is valid JSON with servers/stdio");
  await page.keyboard.press("End");
  check((await page.locator("[role=tab][aria-selected=true]").innerText()) === "Codex CLI", "End goes to the last tab");
  check((await page.locator("#dev-client-panel pre").innerText()).includes("[mcp_servers.specreview]"), "Codex panel shows TOML");
  await page.keyboard.press("Home");
  check((await page.locator("[role=tab][aria-selected=true]").innerText()) === "Claude Code", "Home goes to the first tab");
  await page.locator("[role=tab]", { hasText: "Claude Desktop" }).click();
  check((await page.locator("#dev-client-panel").innerText()).includes("ruta absoluta"), "Claude Desktop panel warns to use an absolute path");
  await shot(page, "developers-mcp-tabs-1280-light");
  await page.reload();
  await page.waitForSelector("[role=tab]");
  check((await page.locator("[role=tab][aria-selected=true]").innerText()) === "Claude Desktop", "the chosen client is remembered after a reload");

  // copy button really copies what is shown
  await page.locator("#dev-client-panel .copy-btn").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.includes('"/ruta/absoluta/a/tu-repo"'), "copy button copies the visible snippet");

  // tools table and recipes
  check((await page.locator("#dev-mcp table tbody tr").count()) === 7, "the table lists the seven MCP tools");
  check((await page.locator(".recipe").count()) === 6, "six recipes");
  const first = page.locator(".recipe").first();
  check((await first.getAttribute("open")) === null, "recipes start collapsed");
  await first.locator("summary").click();
  check((await first.locator(".codeblock").count()) === 1 && (await first.innerText()).includes("tiene 2 bloqueante(s)"), "recipe 1 opens with the real gate output");
  await page.locator(".recipe").nth(4).locator("summary").click();
  check((await page.locator(".recipe").nth(4).innerText()).includes("19 hallazgos registrados"), "baseline recipe shows the real baseline output");
  check((await page.locator(".prompts tbody tr").count()) === 6 && (await page.locator(".prompts .copy-btn").count()) === 6, "six prompts, each with a copy button");
  await page.locator("#dev-recetas").scrollIntoViewIfNeeded();
  await shot(page, "developers-recipes-1280-light");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page scroll at 1280");
  check(errors.length === 0, "no page errors: " + errors.join("; "));
  await ctx.close();
}

// ---------------------------------------------------------------- reaching it from the rest of the app
{
  const { ctx, page } = await open();
  await page.goto(`${base}/docs`);
  await page.waitForSelector("main h1");
  check((await page.locator("main h1").innerText()) === "Guía del producto", "the product guide keeps its title");
  await page.locator(".guide-dev-link a").click();
  await page.waitForURL("**/docs/developers");
  check(true, "the guide's header links to the developer page");
  await page.goto(`${base}/docs#guia-primeros-pasos`);
  await page.waitForTimeout(150);
  check((await page.locator("#guia-primeros-pasos .codeblock pre").innerText()).includes("specreview demo"), "guide quickstart starts with specreview demo");
  await page.locator("#guia-primeros-pasos .callout a").click();
  await page.waitForURL("**/docs/developers");
  check(true, "the guide's quickstart section links to the developer page");

  await page.goto(`${base}/decisions`);
  await page.locator("[data-testid=help-btn]").click();
  await page.locator("[role=menuitem]", { hasText: "Para desarrolladores" }).click();
  await page.waitForURL("**/docs/developers");
  check(true, "Ayuda → Para desarrolladores opens the page");

  await page.goto(`${base}/decisions`);
  await page.waitForSelector(".turn-card");
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[role=dialog] input");
  await page.keyboard.type("desarroll");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/docs/developers");
  check(true, "the command palette finds it by typing «desarroll»");
  await ctx.close();
}

// ---------------------------------------------------------------- mobile, dark, english
{
  const { ctx, page, errors } = await open({ w: 390, h: 844, scheme: "dark" });
  await page.goto(`${base}/docs/developers`);
  await page.waitForSelector("main h1");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page scroll at 390px");
  check((await page.locator(".toc-mobile").isVisible()) && !(await page.locator(".toc-desktop").isVisible()), "mobile shows the collapsible table of contents");
  await shot(page, "developers-top-390-dark");
  await page.goto(`${base}/docs/developers#dev-mcp`);
  await page.waitForTimeout(150);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page scroll in the MCP section at 390px");
  await shot(page, "developers-mcp-390-dark");
  check(errors.length === 0, "no page errors on mobile");
  await ctx.close();
}
{
  const { ctx, page, errors } = await open({ lang: "en" });
  await page.goto(`${base}/docs/developers`);
  await page.waitForSelector("main h1");
  check((await page.locator("main h1").innerText()) === "Getting started for developers", "English: translated title");
  check((await page.locator(".content-note").count()) === 0, "English: no 'content is in Spanish' notice (FR-014)");
  const heads = await page.locator("main h2").allInnerTexts();
  check(heads.join("|") === "1 · Try it in 60 seconds|2 · Connect the MCP to your agent|3 · Let the whole team see it|What you can achieve|Prompts to copy|If something doesn't work", "English: all six section headings are translated: " + heads.join(" | "));
  const body = await page.locator("main article").innerText();
  check(!/Probalo|Conectá|Qué ganás|Pegale|Instalarlo|El problema/.test(body), "English: no Spanish prose left in the body (FR-014)");
  check(body.includes("Open your repo with the agent and paste:") && body.includes("Review feature 003 with specreview"), "English: the first prompt is in English");
  // same structure as Spanish (SC-004)
  const counts = async () => page.evaluate(() => ({ h2: document.querySelectorAll("main h2").length, tabs: document.querySelectorAll("[role=tab]").length, recipes: document.querySelectorAll(".recipe").length, prompts: document.querySelectorAll(".prompts tbody tr").length, tools: document.querySelectorAll("#dev-mcp table tbody tr").length, faq: document.querySelectorAll(".faq-item").length, code: document.querySelectorAll(".codeblock").length }));
  const en = await counts();
  await page.evaluate(() => localStorage.setItem("sr-lang", "es"));
  await page.reload();
  await page.waitForSelector("main h1");
  const es = await counts();
  check(JSON.stringify(en) === JSON.stringify(es), `SC-004: same structure in English and Spanish ${JSON.stringify(en)}`);
  await page.evaluate(() => localStorage.setItem("sr-lang", "en"));
  await page.reload();
  await page.waitForSelector("main h1");
  await page.locator("[role=tab]", { hasText: "Cursor" }).click();
  check((await page.locator("#dev-client-panel").innerText()).includes(".cursor/mcp.json in your repo"), "English: the client panel text is translated");
  await page.locator("#dev-client-panel .copy-btn").click();
  await page.waitForFunction(() => document.querySelector("#dev-client-panel .copy-btn")?.textContent === "Copied", null, { timeout: 2000 }).catch(() => {});
  const cb = (await page.locator("#dev-client-panel .copy-btn").innerText()); check(cb === "Copied", "English: the copy button confirms with Copied (got: " + cb + ")");
  await page.locator(".recipe").first().locator("summary").click();
  check((await page.locator(".recipe").first().innerText()).includes("What you gain."), "English: recipe labels are translated");
  await shot(page, "developers-top-1280-en");
  check(errors.length === 0, "no page errors in English");
  await ctx.close();
}

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
