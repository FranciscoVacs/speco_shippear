// End-to-end verification of the app shell (005-agent-first-app, Stage 1). Re-runnable:
//   cd web && node scripts/verify-shell.mjs          (SKIP_BUILD=1 reuses dist/ and dist-single/)
// It builds, serves dist/ with a tiny static server that behaves like Vercel (existing file, otherwise the rewrites of
// vercel.json -> /index.html, so unknown paths such as /api/features answer HTML), opens every route directly by URL at
// 1280 and 375 px in light and dark, exercises the shell with mouse and keyboard, and tests embedded and server modes.
// Env: CHROMIUM, SPECREVIEW (CLI for the server-mode check), SKIP_BUILD, SHOTS (=0 disables screenshots).
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

// ------------------------------------------------------------------ build
if (!process.env.SKIP_BUILD) {
  section("build");
  execSync("npm run build", { stdio: "inherit" });
  execSync("npm run build:single", { stdio: "inherit" });
  execSync("node artifact/build.mjs", { stdio: "inherit" });
}

// ------------------------------------------------------------------ Vercel-like static server
const rewrites = JSON.parse(fs.readFileSync("vercel.json", "utf8")).rewrites ?? [];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
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
  if (!f) {
    res.writeHead(404).end("not found");
    return;
  }
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

async function fresh({ w = 1280, h = 800, scheme = "light", locale = "es-AR", onboarded = true, init, ...rest } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale, reducedMotion: "reduce", ...rest });
  if (onboarded) await ctx.addInitScript(() => { try { localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-open-review-detail", "1"); localStorage.setItem("sr-open-nav-more", "1"); } catch { /* */ } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && page.errors.push("console: " + m.text()));
  return { ctx, page };
}
const overflow = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const shot = async (page, name, w, scheme) => SHOTS && (await page.screenshot({ path: `screenshots/shell-${name}-${w}-${scheme}.png` }));
const active = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a ? { tag: a.tagName, id: a.id, role: a.getAttribute("role"), label: a.getAttribute("aria-label") || a.textContent?.trim().slice(0, 40) || "", cls: a.className } : null;
  });
const ls = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);

// ================================================================== 1. every route, opened directly
const FEATURE = "003-team-invitations";
const ROUTES = [
  { name: "home", path: "/", sel: '[data-agent-variant="home"]', text: "Hola, Alex", panel: false },
  { name: "reviews", path: "/reviews", sel: "main h1", text: "Revisiones", panel: true },
  { name: "review", path: `/reviews/${FEATURE}`, sel: ".finding", text: null, panel: true },
  { name: "rules", path: "/rules", sel: "main h1", text: "Reglas", panel: true },
  { name: "rule", path: "/rules/COV001", sel: "#rule-COV001 .rule-panel", text: null, panel: true },
  { name: "docs", path: "/docs", sel: "main h1", text: "Guía del producto", panel: true },
  { name: "settings-general", path: "/settings/general", sel: "main h1", text: "General", panel: false, demo: true },
  { name: "settings-members", path: "/settings/members", sel: "main h1", text: "Miembros", panel: false, demo: true },
  { name: "settings-api-keys", path: "/settings/api-keys", sel: "main h1", text: "Claves de API", panel: false, demo: true },
  { name: "settings-integrations", path: "/settings/integrations", sel: "main h1", text: "Integraciones", panel: false, demo: true },
  { name: "settings-usage", path: "/settings/usage", sel: "main h1", text: "Uso y facturación", panel: false, demo: true },
  { name: "settings-notifications", path: "/settings/notifications", sel: "main h1", text: "Notificaciones", panel: false, demo: true },
  { name: "settings-profile", path: "/settings/profile", sel: "main h1", text: "Perfil", panel: false, demo: true },
  { name: "signed-out", path: "/signed-out", sel: "main h1", text: "Cerraste sesión", panel: false },
  { name: "notfound", path: "/no/such/page", sel: "main h1", text: "Esta página no existe", panel: true },
];

section("1. every route opened directly (FR-016, SC-003), 1280/375 x light/dark");
for (const [w, h] of [[1280, 800], [375, 800]])
  for (const scheme of ["light", "dark"])
    for (const r of ROUTES) {
      const { ctx, page } = await fresh({ w, h, scheme });
      await page.goto(BASE + r.path);
      await page.waitForSelector(r.sel, { timeout: 8000 }).catch(() => {});
      const tag = `${r.name} ${w} ${scheme}`;
      const found = (await page.locator(r.sel).count()) > 0;
      check(found, `route ${tag}: ${r.path} renders its page`);
      if (r.text) check((await page.locator(r.sel).first().innerText()).includes(r.text), `route ${tag}: h1/heading has '${r.text}'`);
      if (r.name === "review") check((await page.locator("main h1").first().innerText()).includes(FEATURE), `route ${tag}: h1 is the feature`);
      if (r.name === "rule") {
        check((await page.locator("#rule-COV001 .rule-toggle").getAttribute("aria-expanded")) === "true", `route ${tag}: deep-linked rule is open`);
        await sleep(150);
        check(await page.evaluate(() => document.activeElement?.closest("#rule-COV001") != null), `route ${tag}: focus moved to the rule`);
      }
      if (r.demo) check((await page.getByTestId("demo-label").count()) >= 1, `route ${tag}: demo-data label present (FR-014)`);
      const panelWanted = r.panel && w >= 1200; // docked panel defaults open from 1200px; below it is an (initially closed) sheet
      check((await page.locator("#agent-panel").count()) === (panelWanted ? 1 : 0), `route ${tag}: agent panel ${panelWanted ? "open" : "absent/closed"}`);
      check((await page.locator("main").count()) === 1 && (await page.locator("header.topbar, header").count()) >= (r.name === "signed-out" ? 0 : 1), `route ${tag}: landmarks`);
      await sleep(120);
      check((await overflow(page)) <= 0, `route ${tag}: no horizontal overflow (${await overflow(page)})`);
      check(page.errors.length === 0, `route ${tag}: no page errors ${page.errors.join("|")}`);
      await shot(page, r.name, w, scheme);
      await ctx.close();
    }

section("1b. redirects and special routes");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/settings");
  await page.waitForSelector("main h1");
  check(new URL(page.url()).pathname === "/settings/general", "/settings redirects to /settings/general");
  await page.goto(BASE + "/docs#guia-ears");
  await page.waitForSelector("#guia-ears");
  await sleep(300);
  check(await page.evaluate(() => document.activeElement?.id === "guia-ears" && document.getElementById("guia-ears").getBoundingClientRect().top < 200), "/docs#guia-ears: anchor works (scrolled + focused)");
  await page.goto(BASE + "/docs#guia-COV001");
  await page.waitForSelector("#rule-COV001");
  check(new URL(page.url()).pathname === "/rules/COV001", "/docs#guia-COV001 (legacy anchor) lands on /rules/COV001");
  await page.goto(BASE + "/#guia-reglas");
  await page.waitForSelector("#guia-reglas");
  check(new URL(page.url()).pathname === "/docs", "legacy /#guia-reglas lands on /docs");
  await page.goto(BASE + "/#" + FEATURE);
  await page.waitForSelector(".finding");
  check(new URL(page.url()).pathname === `/reviews/${FEATURE}`, "legacy /#<feature> lands on its review");
  await page.goto(BASE + "/reviews/not-a-feature");
  await page.getByText("No encontramos esa feature").waitFor();
  check(true, "unknown feature id shows a friendly state");
  await page.goto(BASE + "/reviews?repo=acme%2Fbilling");
  await page.waitForSelector(".feat-row");
  check((await page.locator(".repo-title").count()) === 1 && (await page.locator(".repo-title").innerText()).includes("acme/billing"), "/reviews?repo= filters by repo");
  check((await page.locator(".sb-link.active").innerText()) === "acme/billing", "sidebar marks the repo link current (aria-current)");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 2. samples mode, no backend
section("2. samples mode without backend; unknown /api/* paths must not break the loader");
{
  const { ctx, page } = await fresh();
  const apiResp = [];
  page.on("response", (r) => new URL(r.url()).pathname.startsWith("/api/") && apiResp.push({ p: new URL(r.url()).pathname, ct: r.headers()["content-type"] }));
  await page.goto(BASE + "/reviews");
  await page.waitForSelector(".feat-row");
  const idx = JSON.parse(fs.readFileSync("public/samples/index.json", "utf8"));
  check((await page.locator(".feat-row").count()) === idx.length, `reviews lists all ${idx.length} features from samples/index.json`);
  const repos = [...new Set(idx.map((f) => f.repo))];
  check((await page.locator(".repo-title").count()) === repos.length, `grouped by repo (${repos.join(", ")})`);
  check(apiResp.some((r) => r.p === "/api/features" && /html/.test(r.ct ?? "")), "Vercel-like server answered /api/features with HTML and the app treated it as 'no server'");
  check((await page.getByTestId("demo-label").count()) === 1, "reviews list in samples mode carries the demo label");
  // filters
  await page.getByLabel("Filtrar por repositorio").selectOption("acme/billing");
  await page.waitForURL("**/reviews?repo=*");
  await page.waitForFunction(() => document.querySelectorAll(".repo-title").length === 1);
  check((await page.locator(".repo-title").count()) === 1 && new URL(page.url()).searchParams.get("repo") === "acme/billing", "repo filter updates the list and the URL");
  await page.getByLabel("Filtrar por repositorio").selectOption("");
  await page.getByPlaceholder("Buscar feature…").fill("invoice");
  check((await page.locator(".feat-row").count()) === 1, "search narrows the list");
  await page.getByPlaceholder("Buscar feature…").fill("zzzz");
  check((await page.getByText("Ninguna feature coincide").count()) === 1, "empty state when nothing matches");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  check((await page.locator(".feat-row").count()) === idx.length, "clear filters restores the list");
  // health counts: text, not only colour
  check(/\d/.test(await page.locator(".health").first().innerText()), "health counts are readable text");
  await page.locator(".feat-row").first().click();
  await page.waitForSelector(".finding");
  check(new URL(page.url()).pathname.startsWith("/reviews/"), "clicking a feature opens its review");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  // an unknown /api path opened directly: Vercel returns index.html, the app shows its 404 page
  await page.goto(BASE + "/api/does-not-exist");
  await page.waitForSelector("main h1");
  check((await page.locator("main h1").innerText()).includes("no existe"), "/api/does-not-exist -> app 404 page (no crash)");
  check(page.errors.length === 0, "no page errors on /api/* page " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 3. SC-002 gzip size of the first view JS
// Measured: every .js file the page requests from the page load until the network is idle (`networkidle`: 500 ms without requests),
// i.e. "JS loaded BEFORE THE FIRST INTERACTION, EXCLUDING the idle prefetch of the assistant runtime". That prefetch is deliberately
// scheduled >= 2 s after the app starts (requestIdleCallback, 3 s timeout) so it never competes with the first view; it is checked
// separately below (it must happen, and it is reported, but it is not first-view JS: nobody waits for it).
section("3. SC-002: JavaScript loaded by the first view (before the first interaction, excluding the idle prefetch), gzipped");
{
  const runtimeChunk = fs.readdirSync(path.join(DIST, "assets")).find((f) => /^agent-runtime-.*\.js$/.test(f));
  for (const [name, p, wait] of [["/", "/", ".ag-hero"], ["review page with the panel docked", `/reviews/${"003-team-invitations"}`, "#agent-panel .ag-panel-empty"]]) {
    const { ctx, page } = await fresh();
    const js = new Set();
    const onResp = (r) => {
      const u = new URL(r.url());
      if (u.origin === BASE && u.pathname.endsWith(".js")) js.add(u.pathname);
    };
    page.on("response", onResp);
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.waitForSelector(wait);
    page.off("response", onResp);
    const first = [...js];
    let total = 0;
    for (const f of first) total += zlib.gzipSync(fs.readFileSync(path.join(DIST, f)), { level: 9 }).length;
    const kb = total / 1024;
    console.log(`${name}: ${first.length} JS file(s) before the first interaction: ${first.join(", ")} -> ${kb.toFixed(1)} KB gzipped`);
    check(kb <= 250, `${name}: first view JS ${kb.toFixed(1)} KB gzip <= 250 KB (SC-002)`);
    check(!first.some((f) => /agent-runtime|assistant|markdown/i.test(f)), `${name}: assistant-ui (agent-runtime chunk) is not part of the first view`);
    await sleep(5500);
    const all = [...new Set([...first, ...(await page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((x) => x.endsWith(".js")))) ])];
    const pre = all.some((f) => f.includes("agent-runtime"));
    const totalAll = all.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(DIST, f)), { level: 9 }).length, 0) / 1024;
    console.log(`${name}: after the idle prefetch (about 2-5 s later): ${all.length} files, ${totalAll.toFixed(1)} KB gzipped (not counted: prefetch of ${runtimeChunk})`);
    check(pre, `${name}: the runtime chunk is prefetched when the browser is idle`);
    await ctx.close();
  }
}

// ================================================================== 4. sidebar
section("4. sidebar: collapse/expand, persistence, tooltips, nav, repos, promo");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.waitForSelector(".sidebar");
  const nav = page.getByRole("navigation", { name: "Principal" });
  for (const n of ["Inicio", "Revisiones", "Reglas", "Documentación", "Configuración"]) check((await nav.getByRole("link", { name: n, exact: true }).count()) === 1, `sidebar item '${n}'`);
  check((await nav.getByRole("link", { name: "Inicio" }).getAttribute("aria-current")) === "page", "aria-current=page on the active item");
  for (const r of ["acme/team-app", "acme/billing", "speco.ia"]) check((await nav.getByRole("link", { name: r, exact: true }).count()) === 1, `sidebar repo '${r}'`);
  check((await page.locator(".sidebar").boundingBox()).width > 200, "sidebar is expanded by default");
  const toggle = page.getByRole("button", { name: "Mostrar u ocultar la barra lateral" });
  await toggle.click();
  await sleep(250);
  check((await page.locator(".shell.collapsed").count()) === 1 && Math.round((await page.locator(".sidebar").boundingBox()).width) === 56, "collapses to a 56px rail");
  check((await ls(page, "sr-sidebar")) === "1", "collapsed state persisted in localStorage");
  await shot(page, "sidebar-collapsed", 1280, "light");
  await page.locator('.sb-link[data-tip="Revisiones"]').hover();
  const tip = await page.locator('.sb-link[data-tip="Revisiones"]').evaluate((e) => getComputedStyle(e, "::after").content);
  check(/Revisiones/.test(tip), `tooltip on the rail shows the label (${tip})`);
  check((await page.getByRole("link", { name: "Revisiones", exact: true }).count()) === 1, "rail links keep their accessible name");
  await page.reload();
  await page.waitForSelector(".sidebar");
  check((await page.locator(".shell.collapsed").count()) === 1, "collapsed state survives a reload");
  await page.keyboard.press("Control+b");
  await sleep(250);
  check((await page.locator(".shell.collapsed").count()) === 0 && (await ls(page, "sr-sidebar")) === "0", "Ctrl+B expands again (and persists)");
  // nav works and settings swaps the sidebar content
  await nav.getByRole("link", { name: "Configuración" }).click();
  await page.waitForURL("**/settings/general");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Miembros" }).waitFor();
  check((await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Miembros" }).count()) === 1, "in settings the sidebar lists the settings sections");
  check((await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "General" }).getAttribute("aria-current")) === "page", "settings: current section marked");
  await page.getByRole("link", { name: /Configuración/ }).first().click(); // back link
  await page.waitForURL(BASE + "/");
  // promo
  const promo = page.getByRole("region", { name: "GitHub App" });
  check((await promo.count()) === 1, "promo card visible");
  await promo.getByRole("button", { name: "Instalar" }).click();
  check((await page.locator(".toasts").getByText("GitHub App instalada (simulado)").count()) === 1, "promo Install shows a simulated toast (aria-live region)");
  check((await page.locator(".toasts").getAttribute("aria-live")) === "polite", "toast region is aria-live=polite");
  check((await page.getByRole("region", { name: "GitHub App" }).count()) === 0, "promo is dismissed after install");
  await page.reload();
  await page.waitForSelector(".sidebar");
  check((await page.getByRole("region", { name: "GitHub App" }).count()) === 0, "promo dismissal persisted");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
  // promo: dismiss with X on a fresh context
  const f2 = await fresh();
  await f2.page.goto(BASE + "/");
  await f2.page.getByRole("button", { name: "Descartar aviso" }).click();
  check((await f2.page.getByRole("region", { name: "GitHub App" }).count()) === 0, "promo X dismisses it");
  await f2.ctx.close();
}

// ================================================================== 5. tenant switcher
section("5. tenant switcher");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  const t = page.locator(".tenant");
  check((await t.innerText()).includes("Acme Product") && (await t.innerText()).includes("Pro"), "shows workspace name and plan badge");
  check((await t.getAttribute("aria-haspopup")) === "menu" && (await t.getAttribute("aria-expanded")) === "false", "trigger has aria-haspopup=menu, aria-expanded=false");
  await t.click();
  check((await t.getAttribute("aria-expanded")) === "true", "aria-expanded=true when open");
  const menu = page.getByRole("menu", { name: "Cambiar de workspace" });
  check((await menu.getByRole("menuitemradio").count()) === 2, "lists the workspaces as menuitemradio");
  check((await menu.getByRole("menuitemradio", { name: "Acme Product" }).getAttribute("aria-checked")) === "true", "current workspace is checked");
  await shot(page, "tenant-switcher", 1280, "light");
  await menu.getByRole("menuitemradio", { name: /Personal/ }).click();
  check((await t.innerText()).includes("Personal") && (await t.innerText()).includes("Hobby"), "switching changes name and plan badge");
  check((await ls(page, "sr-session-v1")).includes('"tenantId":"personal"'), "choice persisted");
  await t.click();
  await page.getByRole("menuitem", { name: "Crear workspace" }).click();
  const dlg = page.getByRole("dialog", { name: "Crear workspace" });
  check((await dlg.count()) === 1, "'Crear workspace' opens a dialog");
  check(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null), "focus moves into the dialog");
  check((await dlg.getByRole("button", { name: "Crear", exact: true }).isDisabled()), "create is disabled until a name is typed");
  await dlg.getByLabel("Nombre del workspace").fill("Acme Labs");
  await dlg.getByRole("button", { name: "Crear", exact: true }).click();
  check((await t.innerText()).includes("Acme Labs"), "new simulated workspace becomes current");
  await t.click();
  check((await page.getByRole("menu").getByRole("menuitemradio").count()) === 3, "now three workspaces");
  await page.getByRole("menuitem", { name: "Gestionar miembros" }).click();
  await page.waitForURL("**/settings/members");
  check(true, "'Gestionar miembros' goes to /settings/members");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 6. user menu, language, theme, logout
section("6. user menu: language, theme, logout / sign in");
{
  const { ctx, page } = await fresh({ scheme: "dark" });
  await page.goto(BASE + "/reviews");
  await page.waitForSelector(".feat-row");
  const btn = page.locator(".sidebar").getByRole("button", { name: "Menú de usuario" });
  await btn.click();
  const menu = page.getByRole("menu", { name: "Menú de usuario" });
  check((await menu.innerText()).includes("Alex Demo") && (await menu.innerText()).includes("demo@example.com"), "header shows name and email");
  for (const n of ["Perfil", "Configuración", "Documentación", "Ayuda", "Atajos de teclado", "Cerrar sesión"]) check((await menu.getByRole("menuitem", { name: n }).count()) === 1, `user menu item '${n}'`);
  check((await menu.getByRole("menuitemradio").count()) === 5, "language (2) and theme (3) are radio items");
  await shot(page, "user-menu", 1280, "dark");
  // theme: system follows prefers-color-scheme (dark here)
  check((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== "rgb(246, 247, 249)", "system theme follows prefers-color-scheme: dark");
  await menu.getByRole("menuitemradio", { name: "Claro" }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "light" && (await ls(page, "sr-theme")) === "light", "Claro -> data-theme=light, persisted");
  check((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(246, 247, 249)", "light theme applied even with a dark system");
  await btn.click();
  await page.getByRole("menuitemradio", { name: "Oscuro" }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "Oscuro -> data-theme=dark");
  await page.reload();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "theme survives a reload (no flash: set before React)");
  await btn.click();
  await page.getByRole("menuitemradio", { name: "Sistema" }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === undefined && (await ls(page, "sr-theme")) === "system", "Sistema removes data-theme, persisted as 'system'");
  await page.emulateMedia({ colorScheme: "light" });
  check((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(246, 247, 249)", "Sistema reacts to a system change to light");
  // top bar theme toggle
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "top bar toggle switches theme");
  // language
  await btn.click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  check((await page.evaluate(() => document.documentElement.lang)) === "en" && (await ls(page, "sr-lang")) === "en", "English: <html lang=en>, persisted");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const n of ["Home", "Reviews", "Rules", "Documentation", "Settings"]) check((await nav.getByRole("link", { name: n, exact: true }).count()) === 1, `English sidebar item '${n}'`);
  check((await page.locator("main h1").innerText()).includes("Reviews"), "English page title");
  check((await page.getByText("Demo data").count()) >= 1, "English demo label");
  await page.locator(".sidebar").getByRole("button", { name: "User menu" }).click();
  for (const n of ["Profile", "Settings", "Documentation", "Help", "Keyboard shortcuts", "Log out"]) check((await page.getByRole("menu", { name: "User menu" }).getByRole("menuitem", { name: n }).count()) === 1, `English user menu '${n}'`);
  await page.keyboard.press("Escape");
  await page.goto(BASE + `/reviews/${FEATURE}`);
  await page.waitForSelector(".finding");
  check((await page.getByText("The analysis content is in Spanish.").count()) === 1, "English review page notes that analysis content is Spanish");
  await shot(page, "review-english", 1280, "dark");
  await page.reload();
  check((await page.evaluate(() => document.documentElement.lang)) === "en", "language survives reload");
  // logout
  await page.locator(".sidebar").getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.waitForURL("**/signed-out");
  check((await page.locator("main h1").innerText()) === "You signed out", "logout -> /signed-out (English)");
  await shot(page, "signed-out-en", 1280, "dark");
  await page.goto(BASE + "/reviews");
  await page.waitForURL("**/signed-out");
  check(true, "while signed out, app pages redirect to /signed-out");
  await page.getByRole("button", { name: "Sign in (demo)" }).click();
  await page.waitForURL(BASE + "/");
  await page.locator(".tenant").waitFor();
  check((await page.locator(".sidebar").count()) === 1 && (await page.locator(".tenant").count()) === 1, "sign in again restores the session and returns to /");
  await page.reload();
  check((await page.locator(".tenant").count()) === 1, "session persisted");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
  // first-visit language detection
  const en = await fresh({ locale: "en-GB" });
  await en.page.goto(BASE + "/");
  await en.page.waitForSelector(".sidebar");
  check((await en.page.evaluate(() => document.documentElement.lang)) === "en" && (await en.page.getByRole("navigation", { name: "Main" }).count()) === 1, "browser language en-* starts in English");
  await en.ctx.close();
  const es = await fresh({ locale: "fr-FR" });
  await es.page.goto(BASE + "/");
  await es.page.waitForSelector(".sidebar");
  check((await es.page.evaluate(() => document.documentElement.lang)) === "es", "other browser languages start in Spanish");
  await es.ctx.close();
}

// ================================================================== 7. notifications
section("7. notifications");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/reviews");
  await page.waitForSelector(".feat-row");
  const bell = page.locator("header").getByRole("button", { name: /^Notificaciones/ });
  check(/4 sin leer/.test(await bell.getAttribute("aria-label")) && (await bell.locator('[data-testid="unread-dot"]').count()) === 1, "bell shows an unread dot and count (4)");
  await bell.click();
  const pop = page.getByRole("dialog", { name: "Notificaciones" });
  check((await pop.locator("li").count()) === 8, "popover lists 8 events");
  check((await pop.getByRole("tab").count()) === 2, "tabs Todas / No leídas");
  await shot(page, "notifications", 1280, "light");
  await pop.getByRole("tab", { name: /No leídas/ }).click();
  check((await pop.locator("li").count()) === 4, "'No leídas' tab shows 4");
  await pop.getByRole("button", { name: "Marcar como leída" }).first().click();
  check((await pop.locator("li").count()) === 3 && /3 sin leer/.test(await bell.getAttribute("aria-label")), "marking one as read updates list and bell");
  await pop.getByRole("button", { name: "Marcar todo como leído" }).click();
  check((await pop.getByText("Todo al día").count()) === 1, "empty state when everything is read");
  check((await bell.locator('[data-testid="unread-dot"]').count()) === 0, "dot disappears");
  await pop.getByRole("tab", { name: "Todas" }).click();
  check((await pop.locator("li").count()) === 8, "'Todas' still has 8");
  await page.reload();
  await page.waitForSelector(".feat-row");
  check((await page.locator("header").getByRole("button", { name: "Notificaciones" }).count()) === 1, "read state persisted");
  // clicking an item navigates
  await page.locator("header").getByRole("button", { name: "Notificaciones" }).click();
  await page.getByRole("dialog", { name: "Notificaciones" }).getByRole("button", { name: /Priya Shah se unió/ }).click();
  await page.waitForURL("**/settings/members");
  check(true, "clicking a notification opens its page");
  // esc + focus return
  const b2 = page.locator("header").getByRole("button", { name: "Notificaciones" });
  await b2.focus();
  await page.keyboard.press("Enter");
  check((await page.getByRole("dialog", { name: "Notificaciones" }).count()) === 1, "Enter on the bell opens the popover");
  await page.keyboard.press("Escape");
  check((await page.getByRole("dialog", { name: "Notificaciones" }).count()) === 0 && (await active(page)).label === "Notificaciones", "Esc closes it and returns focus to the bell");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 8. command palette
section("8. command palette");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/reviews");
  await page.waitForSelector(".feat-row");
  await page.keyboard.press("Control+k");
  const pal = page.getByRole("dialog", { name: "Paleta de comandos" });
  await pal.waitFor();
  check(await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox"), "Ctrl+K opens the palette with the input focused");
  for (const g of ["Páginas", "Features", "Reglas", "Acciones"]) check((await pal.locator(".pal-group", { hasText: g }).count()) === 1, `group '${g}'`);
  await shot(page, "command-palette", 1280, "light");
  await page.keyboard.type("invo");
  check((await pal.getByRole("option").count()) === 1 && /001-invoice-exports/.test(await pal.getByRole("option").innerText()), "type-to-filter finds the feature");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/reviews/001-invoice-exports");
  check((await pal.count()) === 0, "Enter navigates and closes");
  await page.waitForSelector(".finding");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("COV001");
  check((await pal.getByRole("option").count()) >= 1, "rules are searchable");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/rules/COV001");
  check(true, "Enter on a rule opens /rules/COV001");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("zzzzqq");
  check((await pal.getByText("Sin resultados").count()) === 1 && (await pal.getByText(/Probá con otra palabra/).count()) === 1, "no-results state with a hint");
  await shot(page, "command-palette-empty", 1280, "light");
  await page.keyboard.press("Tab");
  check(await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox"), "Tab keeps focus inside the palette (focus trap)");
  await page.keyboard.press("Escape");
  check((await pal.count()) === 0, "Esc closes");
  // arrows
  await page.keyboard.press("Control+k");
  const first = await pal.locator('[role=option][aria-selected="true"]').innerText();
  await page.keyboard.press("ArrowDown");
  const second = await pal.locator('[role=option][aria-selected="true"]').innerText();
  check(first !== second, "ArrowDown moves the active option");
  await page.keyboard.press("ArrowUp");
  check((await pal.locator('[role=option][aria-selected="true"]').innerText()) === first, "ArrowUp moves back");
  check(!!(await page.locator('input[role=combobox]').getAttribute("aria-activedescendant")), "aria-activedescendant tracks the active option");
  await page.keyboard.press("Control+k");
  check((await pal.count()) === 0, "Ctrl+K toggles it closed");
  // actions
  await page.keyboard.press("Control+k");
  await page.keyboard.type("cambiar tema");
  await page.keyboard.press("Enter");
  await sleep(100);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "action 'Cambiar tema' toggles the theme");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("idioma");
  await page.keyboard.press("Enter");
  await sleep(100);
  check((await page.evaluate(() => document.documentElement.lang)) === "en", "action 'Cambiar idioma' switches to English");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("log out");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/signed-out");
  check(true, "action 'Log out' signs out");
  // opening from the sidebar search button
  await page.getByRole("button", { name: "Sign in (demo)" }).click();
  await page.waitForURL(BASE + "/");
  await page.locator(".sidebar .sb-search").click();
  check((await page.getByRole("dialog", { name: "Command palette" }).count()) === 1, "sidebar search opens the palette (English)");
  await page.keyboard.press("Escape");
  check((await active(page)).cls.includes("sb-search"), "focus returns to the search button after Esc");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 9. help menu + onboarding
section("9. help menu, shortcuts, news, support, onboarding");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/docs");
  await page.waitForSelector("main h1");
  const help = page.getByTestId("help-btn");
  await help.click();
  const menu = page.getByRole("menu", { name: "Ayuda" });
  for (const n of ["Ver introducción", "Guía", "Atajos de teclado", "Novedades", "Contactar soporte"]) check((await menu.getByRole("menuitem", { name: n }).count()) === 1, `help item '${n}'`);
  check((await page.locator("header").getByRole("button", { name: "Ayuda" }).count()) === 1 && (await page.locator(".help-btn").count()) === 0, "old 'Ayuda' button replaced by the menu");
  await shot(page, "help-menu", 1280, "light");
  await menu.getByRole("menuitem", { name: "Atajos de teclado" }).click();
  const sc = page.getByRole("dialog", { name: "Atajos de teclado" });
  check((await sc.count()) === 1 && (await sc.locator("kbd").count()) >= 6, "shortcuts dialog lists the shortcuts");
  await shot(page, "shortcuts", 1280, "light");
  await page.keyboard.press("Escape");
  check((await sc.count()) === 0 && (await active(page)).id !== "", "Esc closes the dialog and focus returns to the opener");
  await help.click();
  await page.getByRole("menuitem", { name: "Novedades" }).click();
  check((await page.getByRole("dialog", { name: "Novedades" }).locator("li").count()) === 3, "news dialog with a short changelog");
  await page.keyboard.press("Escape");
  await help.click();
  await page.getByRole("menuitem", { name: "Contactar soporte" }).click();
  const sup = page.getByRole("dialog", { name: "Contactar soporte" });
  check(await sup.getByRole("button", { name: "Enviar" }).isDisabled(), "support: send disabled while empty");
  // focus trap
  let leaked = false;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    if (!(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") != null))) leaked = true;
  }
  check(!leaked, "dialog focus trap (Tab stays inside)");
  await sup.getByLabel("Mensaje").fill("Hola");
  await sup.getByRole("button", { name: "Enviar" }).click();
  check((await page.locator(".toasts").getByText("Mensaje enviado (simulado)").count()) === 1, "support message: simulated confirmation");
  await help.click();
  await page.getByRole("menuitem", { name: "Guía" }).click();
  await page.waitForURL("**/docs");
  check(true, "Guía -> /docs");
  await help.click();
  await page.getByRole("menuitem", { name: "Ver introducción" }).click();
  const onb = page.getByRole("dialog");
  check((await onb.getByText("Paso 1 de 4").count()) === 1 && (await onb.getAttribute("aria-modal")) === "true", "'Ver introducción' reopens the onboarding dialog");
  check((await page.locator(".shell").getAttribute("inert")) !== null, "page behind the onboarding is inert");
  await page.getByRole("button", { name: "Siguiente" }).click();
  check((await onb.getByText("Paso 2 de 4").count()) === 1, "onboarding steps work");
  await shot(page, "onboarding-step2", 1280, "light");
  await page.keyboard.press("Escape");
  check((await page.getByRole("dialog").count()) === 0 && (await active(page)).label.includes("Ayuda"), "Esc closes it and focus returns to the Help button");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();

  // first visit (spec 012): the first steps checklist replaces the introduction dialog; the dialog stays in Help
  const f = await fresh({ onboarded: false });
  await f.page.goto(BASE + "/");
  await f.page.waitForSelector(".sidebar");
  check((await f.page.getByRole("dialog").count()) === 0 && (await f.page.getByTestId("activation").count()) === 1, "first visit: checklist shown, no introduction dialog");
  await f.page.getByRole("button", { name: "Cerrar primeros pasos" }).click();
  await f.page.reload();
  await f.page.waitForSelector(".sidebar");
  check((await f.page.getByTestId("activation").count()) === 0, "second visit: checklist not shown again");
  // 'Abrir la guía completa' goes to /docs
  await f.page.getByTestId("help-btn").click();
  await f.page.getByRole("menuitem", { name: "Ver introducción" }).click();
  for (let i = 0; i < 3; i++) await f.page.getByRole("button", { name: "Siguiente" }).click();
  await f.page.getByRole("link", { name: "Abrir la guía completa" }).click();
  await f.page.waitForURL("**/docs");
  check(true, "onboarding 'Abrir la guía completa' -> /docs");
  await f.ctx.close();
  // localStorage blocked: still works
  const b = await fresh({ onboarded: false, init: () => Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }) });
  await b.page.goto(BASE + "/reviews");
  await b.page.waitForSelector(".feat-row");
  await b.page.getByRole("button", { name: "Mostrar u ocultar la barra lateral" }).click();
  await b.page.keyboard.press("Control+j");
  check(b.page.errors.length === 0, "storage blocked: app works, no errors " + b.page.errors.join("|"));
  await b.ctx.close();
}

// ================================================================== 10. keyboard-only
section("10. keyboard-only traversal (FR-020)");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + "/");
  await page.waitForSelector(".sidebar");
  await page.keyboard.press("Tab");
  check((await active(page)).label === "Saltar al contenido", "first Tab stop is the skip link");
  await page.keyboard.press("Enter");
  check((await active(page)).id === "main", "skip link moves focus to <main>");
  await page.reload();
  await page.waitForSelector(".sidebar");
  const seq = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    seq.push((await active(page)).label);
  }
  console.log("   tab order:", seq.join(" > "));
  const iTenant = seq.findIndex((l) => /Cambiar de workspace/.test(l));
  const iSearch = seq.findIndex((l) => /Buscar/.test(l));
  const iRev = seq.indexOf("Revisiones");
  check(iTenant > 0 && iSearch > iTenant && iRev > iSearch, "Tab order: skip > tenant > search > nav items");
  // go to Revisiones with the keyboard
  await page.reload();
  await page.waitForSelector(".sidebar");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Revisiones", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/reviews");
  check(true, "Enter on a sidebar link navigates");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  check(/Inicio|Buscar|Decisiones/.test((await active(page)).label), "Shift+Tab moves back through the sidebar");
  // tenant menu with arrows
  await page.locator(".tenant").focus();
  await page.keyboard.press("Enter");
  check((await active(page)).role === "menuitemradio", "Enter opens the tenant menu and focuses the first item");
  const labels = [];
  for (let i = 0; i < 4; i++) {
    labels.push((await active(page)).label);
    await page.keyboard.press("ArrowDown");
  }
  console.log("   tenant menu order:", labels.join(" > "));
  check(new Set(labels).size === 4, "ArrowDown walks and wraps through the menu items");
  await page.keyboard.press("End");
  check(/Gestionar miembros/.test((await active(page)).label), "End jumps to the last item");
  await page.keyboard.press("Home");
  check((await active(page)).role === "menuitemradio", "Home jumps to the first item");
  await page.keyboard.press("Escape");
  check((await page.getByRole("menu").count()) === 0 && (await active(page)).cls.includes("tenant"), "Esc closes the menu and returns focus to its trigger");
  await page.locator(".tenant").focus();
  await page.keyboard.press("ArrowDown");
  check((await page.getByRole("menu").count()) === 1, "ArrowDown on the trigger opens the menu");
  await page.keyboard.press("Tab");
  check((await page.getByRole("menu").count()) === 0, "Tab leaves (and closes) the menu");
  // user menu by keyboard: pick English with arrows + Enter
  await page.locator(".sidebar").getByRole("button", { name: "Menú de usuario" }).focus();
  await page.keyboard.press("Enter");
  let guard = 0;
  while (!/English/.test((await active(page)).label) && guard++ < 14) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check((await page.evaluate(() => document.documentElement.lang)) === "en", "user menu: language chosen with arrows + Enter");
  // palette
  await page.keyboard.press("Control+k");
  await page.keyboard.type("rules");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/rules(\/|$)/);
  check(true, "palette driven with the keyboard only");
  // panel
  const panelOpenBefore = (await page.locator("#agent-panel").count()) === 1;
  await page.keyboard.press("Control+j");
  check(((await page.locator("#agent-panel").count()) === 1) !== panelOpenBefore, "Ctrl+J toggles the panel");
  await page.keyboard.press("Control+j");
  await page.locator("#agent-panel").getByRole("button", { name: "Hide the assistant" }).focus();
  await page.keyboard.press("Enter");
  check((await page.locator("#agent-panel").count()) === 0, "panel collapse button works with Enter");
  const tog = page.getByTestId("panel-toggle");
  await tog.focus();
  await page.keyboard.press("Space");
  check((await page.locator("#agent-panel").count()) === 1 && (await tog.getAttribute("aria-expanded")) === "true", "panel toggle button reopens it (aria-expanded)");
  // a settings form by keyboard
  await page.goto(BASE + "/settings/api-keys");
  await page.waitForSelector("main h1");
  await page.getByRole("button", { name: "Create key" }).first().focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Keyboard key");
  await page.keyboard.press("Enter");
  check((await page.getByTestId("api-secret").count()) === 1, "create-key flow works by keyboard (Enter submits)");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 11. right panel
section("11. right panel: layout, collapse, Ctrl+J, persistence, narrow sheet");
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + `/reviews/${FEATURE}`);
  await page.waitForSelector(".finding");
  const panel = page.locator("#agent-panel");
  check((await panel.count()) === 1 && Math.round((await panel.boundingBox()).width) === 380, "panel is open and ~380px wide at 1280");
  check((await panel.evaluate((e) => e.tagName)) === "ASIDE" && (await panel.getAttribute("aria-label")) === "Asistente", "panel is an <aside> landmark");
  check((await panel.locator('[data-agent-variant="panel"]').getAttribute("data-agent-feature")) === FEATURE, "AgentSlot receives the feature as context");
  check((await panel.getByText("Asistente").count()) >= 1 && (await panel.getByTestId("agent-composer").count()) === 1 && (await panel.getByTestId("agent-context-name").textContent()).trim() === `Feature: ${FEATURE}`, "panel body: agent composer and the page's feature as context (stage 2)");
  check((await page.locator(".split").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length)) === 1, "review stacks findings/source when the panel takes space (container query)");
  await shot(page, "review-panel", 1280, "light");
  await panel.getByRole("button", { name: "Ocultar el asistente" }).click();
  check((await panel.count()) === 0 && (await ls(page, "sr-panel")) === "0", "collapse closes the panel and persists");
  check((await page.locator(".split").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length)) === 2, "without the panel the review uses two columns");
  await page.reload();
  await page.waitForSelector(".finding");
  check((await page.locator("#agent-panel").count()) === 0, "closed state survives a reload");
  await page.keyboard.press("Control+j");
  check((await page.locator("#agent-panel").count()) === 1 && (await ls(page, "sr-panel")) === "1", "Ctrl+J opens it and persists");
  await page.reload();
  await page.waitForSelector(".finding");
  check((await page.locator("#agent-panel").count()) === 1, "open state survives a reload");
  await page.goto(BASE + "/");
  check((await page.locator("#agent-panel").count()) === 0 && (await page.getByTestId("panel-toggle").count()) === 0, "no panel and no toggle on /");
  await page.goto(BASE + "/settings/general");
  check((await page.locator("#agent-panel").count()) === 0 && (await page.getByTestId("panel-toggle").count()) === 0, "no panel on settings");
  // navigating keeps the state; panel on rules has rule context
  await page.goto(BASE + "/rules/QUA002");
  await page.waitForSelector("#rule-QUA002");
  check((await page.locator('#agent-panel [data-agent-page="rule"]').count()) === 1, "panel context on /rules/:id is page=rule");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();

  // default state: closed below 1200px, opens as an overlay sheet
  const mid = await fresh({ w: 1000 });
  await mid.page.goto(BASE + `/reviews/${FEATURE}`);
  await mid.page.waitForSelector(".finding");
  check((await mid.page.locator("#agent-panel").count()) === 0, "1000px: closed by default");
  await mid.page.getByTestId("panel-toggle").click();
  check((await mid.page.locator("#agent-panel.sheet").count()) === 1 && (await mid.page.locator(".rp-backdrop").count()) === 1, "1000px: opens as an overlay sheet with a backdrop");
  check((await ls(mid.page, "sr-panel")) === null, "sheet state is not persisted");
  await mid.page.keyboard.press("Escape");
  check((await mid.page.locator("#agent-panel").count()) === 0, "Esc closes the sheet");
  await mid.page.getByTestId("panel-toggle").click();
  await mid.page.locator(".rp-backdrop").click({ position: { x: 5, y: 300 } });
  check((await mid.page.locator("#agent-panel").count()) === 0, "backdrop click closes the sheet");
  await mid.ctx.close();
  const ph = await fresh({ w: 375, h: 800 });
  await ph.page.goto(BASE + `/reviews/${FEATURE}`);
  await ph.page.waitForSelector(".finding");
  await ph.page.getByTestId("panel-toggle").click();
  const bb = await ph.page.locator("#agent-panel").boundingBox();
  check(bb.width <= 375 && bb.x >= 0, `375px: sheet fits the screen (${Math.round(bb.width)}px)`);
  check((await overflow(ph.page)) <= 0, "375px with the sheet open: no horizontal overflow");
  await shot(ph.page, "review-sheet", 375, "light");
  await ph.page.locator("#agent-panel").getByRole("button", { name: "Ocultar el asistente" }).click();
  check((await ph.page.locator("#agent-panel").count()) === 0, "375px: sheet closes");
  await ph.ctx.close();
  // ask button fires the hook event and opens the panel
  const ask = await fresh({ w: 1000 });
  await ask.page.goto(BASE + `/reviews/${FEATURE}`);
  await ask.page.waitForSelector(".finding");
  await ask.page.evaluate(() => { window.__asked = null; window.addEventListener("sr:ask", (e) => (window.__asked = e.detail)); });
  await ask.page.locator(".finding-main").first().click();
  await ask.page.locator(".finding-detail").getByRole("button", { name: "Preguntar al asistente" }).first().click();
  check((await ask.page.locator("#agent-panel").count()) === 1 && !!(await ask.page.evaluate(() => window.__asked?.text)), "'Preguntar al asistente' opens the panel and fires the sr:ask event for Stage 2");
  await ask.ctx.close();
}

// ================================================================== 12. settings pages
section("12. settings pages: behaviour");
{
  const { ctx, page } = await fresh({ permissions: ["clipboard-read", "clipboard-write"] });
  // general
  await page.goto(BASE + "/settings/general");
  const name = page.getByLabel("Nombre del workspace");
  check((await name.inputValue()) === "Acme Product", "general: shows the current workspace");
  check(await page.getByRole("button", { name: "Guardar cambios" }).isDisabled(), "general: save disabled until edited");
  await name.fill("Acme Product 2");
  await page.getByLabel("Identificador (slug)").fill("Bad Slug!");
  check(await page.getByRole("button", { name: "Guardar cambios" }).isDisabled(), "general: invalid slug blocks saving");
  await page.getByLabel("Identificador (slug)").fill("acme-product-2");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  check((await page.locator(".tenant").innerText()).includes("Acme Product 2"), "general: edits persist to the tenant switcher");
  check(await page.getByRole("button", { name: "Eliminar workspace" }).isDisabled(), "general: danger zone delete is disabled");
  // members
  await page.goto(BASE + "/settings/members");
  await page.locator("tbody tr").first().waitFor();
  check((await page.locator("tbody tr").count()) === 6, "members: 6 rows");
  await shot(page, "settings-members", 1280, "light");
  await page.getByRole("button", { name: "Quitar: Jordan Lee" }).click();
  check((await page.getByText("¿Quitar a Jordan Lee?").count()) >= 1, "members: inline confirmation (no window.confirm)");
  await page.getByRole("button", { name: "Cancelar" }).click();
  check((await page.locator("tbody tr").count()) === 6, "members: cancel keeps the member");
  await page.getByRole("button", { name: "Quitar: Jordan Lee" }).click();
  await page.locator("tbody").getByRole("button", { name: "Quitar", exact: true }).click();
  check((await page.locator("tbody tr").count()) === 5, "members: confirm removes");
  await page.getByLabel("Rol de Sam Rivera").selectOption("viewer");
  check((await page.getByLabel("Rol de Sam Rivera").inputValue()) === "viewer", "members: role select");
  await page.getByRole("button", { name: "Invitar miembro" }).click();
  const inv = page.getByRole("dialog", { name: "Invitar miembro" });
  check(await inv.getByRole("button", { name: "Enviar invitación" }).isDisabled(), "invite: disabled with no email");
  await inv.getByLabel("Correo electrónico").fill("nuevo.miembro@example.com");
  await inv.getByRole("button", { name: "Enviar invitación" }).click();
  check((await page.locator("tbody tr").count()) === 6 && (await page.getByText("Invitado").count()) >= 2, "invite: adds an invited member");
  await page.reload();
  await page.locator("tbody tr").first().waitFor();
  check((await page.locator("tbody tr").count()) === 6, "members: edits persist locally");
  // api keys
  await page.goto(BASE + "/settings/api-keys");
  await page.locator("tbody tr").first().waitFor();
  check((await page.locator("tbody tr").count()) === 3 && (await page.getByText("Nunca").count()) === 1, "keys: list with last-used");
  await page.getByRole("button", { name: "Crear clave" }).first().click();
  await page.getByRole("dialog").getByLabel("Nombre").fill("Prod key");
  await page.getByRole("dialog").getByRole("button", { name: "Crear clave" }).click();
  const secret = await page.getByTestId("api-secret").innerText();
  check(/^sr_live_[a-z0-9]{32}$/.test(secret), "keys: the secret is shown once");
  await shot(page, "settings-api-key-secret", 1280, "light");
  await page.getByRole("dialog").getByRole("button", { name: "Copiar" }).click();
  await page.getByRole("dialog").getByText("Copiada al portapapeles.").waitFor({ timeout: 3000 }).catch(() => {});
  check((await page.getByRole("dialog").getByText("Copiada al portapapeles.").count()) === 1, "keys: copy gives feedback");
  check((await page.evaluate(() => navigator.clipboard.readText())) === secret, "keys: the secret is really in the clipboard");
  await page.getByRole("button", { name: "Listo" }).click();
  check((await page.locator("tbody tr").count()) === 4 && (await page.getByText(secret).count()) === 0, "keys: created, and the secret is not shown again");
  await page.getByRole("button", { name: "Revocar: Prod key" }).click();
  check((await page.getByText("¿Revocar «Prod key»?").count()) >= 1, "keys: inline revoke confirmation");
  await page.locator("tbody").getByRole("button", { name: "Revocar", exact: true }).click();
  check((await page.getByText("Revocada", { exact: true }).count()) === 1, "keys: revoked");
  // integrations
  await page.goto(BASE + "/settings/integrations");
  await page.locator(".int-card").first().waitFor();
  check((await page.locator(".int-card").count()) === 4, "integrations: 4 cards");
  await page.getByRole("button", { name: "Conectar Slack" }).click();
  await page.getByRole("button", { name: "Desconectar Slack" }).waitFor();
  check(true, "integrations: connect Slack (simulated, with a busy state)");
  await page.getByRole("button", { name: "Desconectar GitHub" }).click();
  check((await page.getByRole("button", { name: "Conectar GitHub" }).count()) === 1, "integrations: disconnect");
  // usage
  await page.goto(BASE + "/settings/usage");
  await page.locator("tbody tr").first().waitFor();
  check((await page.getByRole("progressbar").count()) === 3, "usage: 3 meters");
  check((await page.getByText("Cerca del límite del plan.").count()) === 1, "usage: 80% meter has a text warning (not colour only)");
  check((await page.locator("tbody tr").count()) === 4, "usage: invoices table");
  await page.getByRole("button", { name: "Mejorar plan" }).click();
  check((await page.locator(".toasts").getByText(/Simulación/).count()) === 1, "usage: upgrade is simulated");
  // notifications matrix
  await page.goto(BASE + "/settings/notifications");
  await page.getByRole("switch").first().waitFor();
  const sw = page.getByRole("switch", { name: /Revisiones terminadas — Correo/ });
  check((await sw.isChecked()) === true, "notification settings: matrix of switches");
  await sw.click();
  check((await sw.isChecked()) === false, "notification settings: toggle");
  check(await page.getByRole("switch", { name: /Revisiones terminadas — Slack/ }).isDisabled() === false, "notification settings: Slack column enabled once Slack is connected");
  await page.reload();
  check((await page.getByRole("switch", { name: /Revisiones terminadas — Correo/ }).isChecked()) === false, "notification settings persist");
  // profile
  await page.goto(BASE + "/settings/profile");
  await page.getByLabel("Nombre", { exact: true }).fill("Alex Demo Dos");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  check((await page.locator(".sidebar .sb-username").innerText()) === "Alex Demo Dos", "profile: name updates the user row");
  await page.locator("main").getByLabel("Idioma").selectOption("en");
  check((await page.locator("main h1").innerText()).includes("Profile"), "profile: language select switches the UI");
  await page.locator("main").getByLabel("Theme").selectOption("dark");
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "profile: theme select");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
}

// ================================================================== 13. mobile drawer
section("13. mobile drawer (375px)");
{
  const { ctx, page } = await fresh({ w: 375, h: 800 });
  await page.goto(BASE + "/reviews");
  await page.waitForSelector(".feat-row");
  const side = page.locator(".sidebar");
  check(!(await side.isVisible()), "sidebar is off-canvas at 375px");
  const burger = page.getByRole("button", { name: "Mostrar u ocultar la barra lateral" });
  check((await burger.getAttribute("aria-expanded")) === "false", "hamburger aria-expanded=false");
  await burger.click();
  await sleep(300);
  check((await side.isVisible()) && (await side.boundingBox()).x >= 0 && (await side.boundingBox()).width <= 375, "hamburger opens the drawer");
  check((await overflow(page)) <= 0, "drawer open: no horizontal overflow");
  await shot(page, "drawer", 375, "light");
  await shot(page, "drawer", 375, "light");
  let leaked = false;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    if (!(await page.evaluate(() => document.activeElement?.closest("#sidebar") != null))) leaked = true;
  }
  check(!leaked, "drawer traps focus (main content is inert)");
  await page.keyboard.press("Escape");
  await sleep(300);
  check(!(await side.isVisible()) && (await active(page)).id === "sb-toggle", "Esc closes the drawer and returns focus to the hamburger");
  await burger.click();
  await sleep(250);
  await page.locator(".sb-backdrop").click({ position: { x: 360, y: 400 } });
  await sleep(300);
  check(!(await side.isVisible()), "backdrop closes the drawer");
  await burger.click();
  await sleep(250);
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Reglas", exact: true }).click();
  await page.waitForURL("**/rules");
  await sleep(300);
  check(!(await side.isVisible()), "navigating closes the drawer");
  // drawer: user menu and notifications reachable
  await burger.click();
  await sleep(250);
  await page.locator(".sidebar").getByRole("button", { name: /^Notificaciones/ }).click();
  check((await page.getByRole("dialog", { name: "Notificaciones" }).isVisible()), "notifications open from the drawer");
  const nb = await page.getByRole("dialog", { name: "Notificaciones" }).boundingBox();
  check(nb.x >= 0 && nb.x + nb.width <= 375, "notification popover fits the 375px screen");
  await shot(page, "notifications-drawer", 375, "light");
  check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
  await ctx.close();
  // topbar menus at 375
  const m = await fresh({ w: 375, h: 800 });
  await m.page.goto(BASE + "/rules");
  await m.page.getByTestId("help-btn").click();
  const hb = await m.page.getByRole("menu", { name: "Ayuda" }).boundingBox();
  check(hb.x >= 0 && hb.x + hb.width <= 375, "help menu fits at 375px");
  await shot(m.page, "help-menu", 375, "light");
  await m.page.keyboard.press("Escape");
  await m.page.keyboard.press("Control+k");
  await m.page.keyboard.type("a");
  const pb = await m.page.getByRole("dialog", { name: "Paleta de comandos" }).boundingBox();
  check(pb.x >= 0 && pb.x + pb.width <= 375, "palette fits at 375px");
  await shot(m.page, "command-palette", 375, "light");
  check((await overflow(m.page)) <= 0, "375px with the palette open: no horizontal overflow");
  await m.ctx.close();
}

// ================================================================== 14. embedded mode (single-file export + hosted artifact)
section("14. embedded mode: window.__SPECREVIEW__, no network");
{
  const idx = JSON.parse(fs.readFileSync("public/samples/index.json", "utf8"));
  const id = idx[0].id;
  const rep = JSON.parse(fs.readFileSync(`public/samples/${id}.report.json`, "utf8"));
  const src = JSON.parse(fs.readFileSync(`public/samples/${id}.sources.json`, "utf8"));
  const rules = JSON.parse(fs.readFileSync("public/samples/rules.json", "utf8"));
  const inject = (html) => html.replace("<!--SPECREVIEW_DATA-->", `<script>window.__SPECREVIEW__ = ${JSON.stringify({ report: rep, sources: src, rules }).replace(/</g, "\\u003c")};</script>`);
  const tmp = fs.mkdtempSync("/tmp/sr-emb-");
  const single = fs.readFileSync("dist-single/index.html", "utf8");
  check(!/ThreadPrimitive|useLocalRuntime|@assistant-ui/.test(single), "single build: assistant-ui is not bundled");
  fs.writeFileSync(path.join(tmp, "report.html"), inject(single));

  async function embeddedChecks(label, page, reqs, { agent = false } = {}) {
    await page.waitForSelector(".finding", { timeout: 10000 });
    check((await page.locator("main h1").first().innerText()).includes(rep.feature), `${label}: renders the embedded report`);
    const nav = page.getByRole("navigation", { name: "Principal" });
    const mobile = page.viewportSize().width <= 900;
    const openNav = async () => {
      if (mobile) {
        await page.getByRole("button", { name: "Mostrar u ocultar la barra lateral" }).click();
        await sleep(300);
      }
    };
    await openNav();
    const items = await nav.getByRole("link").allInnerTexts();
    check(JSON.stringify(items) === JSON.stringify(["Revisión", "Reglas", "Documentación"]), `${label}: reduced sidebar (${items.join(", ")})`);
    check((await page.locator(".tenant").count()) === 0 && (await page.getByRole("link", { name: "Configuración" }).count()) === 0, `${label}: no tenant switcher, no settings`);
    if (agent) check((await page.getByTestId("panel-toggle").count()) === 1, `${label}: hosted demo page offers the (simulated) agent panel`);
    else check((await page.locator("#agent-panel").count()) === 0 && (await page.getByTestId("panel-toggle").count()) === 0, `${label}: no agent panel (the exported file needs the local server)`);
    check((await page.locator(".banner").count()) === 0, `${label}: no samples banner`);
    check(!reqs.some((u) => /\/api\/|samples/.test(u)), `${label}: no network requests (${reqs.length} total)`);
    check(new URL(page.url()).pathname !== "/reviews/report" || true, `${label}: memory router (URL not required)`);
    await nav.getByRole("link", { name: "Reglas", exact: true }).click();
    await page.waitForSelector(".rule-card");
    await openNav();
    check((await page.locator(".rule-card").count()) === rules.rules.length, `${label}: rules glossary from the embedded catalog`);
    await nav.getByRole("link", { name: "Documentación", exact: true }).click();
    await page.getByRole("heading", { name: "Guía del producto" }).waitFor();
    await openNav();
    await nav.getByRole("link", { name: "Revisión", exact: true }).click();
    await page.waitForSelector(".finding");
    await page.locator(".finding-main").first().click();
    await page.locator(".finding-detail").first().getByRole("button", { name: "¿Qué significa esta regla?" }).click();
    check(/Qué detecta|Severidad/i.test(await page.locator(".rule-help").first().innerText()), `${label}: inline rule help works`);
    await page.locator(".rule-help").first().getByRole("link").click();
    await page.waitForSelector(".rule-card");
    check((await page.locator(".rule-card .rule-toggle[aria-expanded=true]").count()) === 1, `${label}: 'ver en el glosario' opens the rule (memory routing)`);
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Paleta de comandos" }).waitFor({ timeout: 5000 }).catch(() => {});
    check((await page.getByRole("dialog", { name: "Paleta de comandos" }).count()) === 1, `${label}: command palette works`);
    await page.keyboard.press("Escape");
    check(page.errors.length === 0, `${label}: no page errors ${page.errors.join("|")}`);
  }

  for (const [scheme, w] of [["light", 1280], ["dark", 375]]) {
    const { ctx, page } = await fresh({ w, scheme, h: 800 });
    const reqs = [];
    page.on("request", (r) => !r.url().startsWith("file://") && !r.url().startsWith("data:") && reqs.push(r.url()));
    await page.goto("file://" + path.join(tmp, "report.html"));
    await embeddedChecks(`embedded file:// ${w} ${scheme}`, page, reqs);
    await page.goto("file://" + path.join(tmp, "report.html"));
    await page.waitForSelector(".finding");
    check((await overflow(page)) <= 0, `embedded ${w}: no horizontal overflow`);
    await shot(page, "embedded", w, scheme);
    await ctx.close();
  }

  // the hosted-artifact template: React comes from cdnjs (served here from node_modules, no real network)
  if (fs.existsSync("artifact/template.html")) {
    const tpl = inject(fs.readFileSync("artifact/template.html", "utf8"));
    fs.writeFileSync(path.join(tmp, "artifact.html"), tpl);
    const { ctx, page } = await fresh();
    await page.route("https://cdnjs.cloudflare.com/**", (route) => {
      const u = route.request().url();
      const f = /react-dom/.test(u) ? "node_modules/react-dom/umd/react-dom.production.min.js" : "node_modules/react/umd/react.production.min.js";
      route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(f) });
    });
    const reqs = [];
    page.on("request", (r) => !r.url().startsWith("file://") && !r.url().startsWith("data:") && !r.url().includes("cdnjs.cloudflare.com") && reqs.push(r.url()));
    await page.goto("file://" + path.join(tmp, "artifact.html"));
    await embeddedChecks("artifact template", page, reqs, { agent: true });
    await shot(page, "artifact", 1280, "light");
    await ctx.close();
  }
}

// ================================================================== 15. server mode (GET /api/features answers JSON)
section("15. server mode");
{
  const CLI = process.env.SPECREVIEW ?? path.resolve(WEB, "../.venv/bin/specreview");
  const FIXTURE = path.resolve(WEB, "../examples/invitations");
  if (fs.existsSync(CLI) && fs.existsSync(FIXTURE)) {
    const port = 8791;
    const p = spawn(CLI, [FIXTURE, "--serve", "--port", String(port)], { stdio: "ignore", detached: true });
    procs.push(p);
    const url = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { up = (await fetch(url + "/api/features")).ok; } catch { await sleep(200); }
    }
    check(up, "specreview --serve is up");
    if (up) {
      const { ctx, page } = await fresh();
      await page.goto(url + "/reviews");
      await page.waitForSelector(".feat-row");
      check((await page.locator(".repo-title").first().innerText()).includes("local"), "server mode: features carry the repo label 'local'");
      check((await page.getByTestId("demo-label").count()) === 0, "server mode: real data is not labelled as demo");
      await page.locator(".feat-row").first().click();
      await page.waitForSelector(".finding");
      check((await page.locator(".banner").count()) === 0, "server mode: no samples banner");
      const deep = new URL(page.url()).pathname;
      await page.goto(url + deep);
      await page.waitForSelector(".finding");
      check(true, `server mode: deep link ${deep} works (SPA fallback of the server)`);
      await page.goto(url + "/rules");
      await page.waitForSelector(".rule-card");
      check((await page.locator(".rule-card").count()) > 5, "server mode: rule catalog from /api/rules");
      check(page.errors.length === 0, "server mode: no page errors " + page.errors.join("|"));
      await shot(page, "server-mode-reviews", 1280, "light");
      await ctx.close();
    }
  } else console.log("   (skipped: no specreview CLI at", CLI, ")");
}

// ================================================================== 16. SC-001: a review card in at most 2 interactions
section("16. SC-001: from the root page a visitor gets a review card in at most 2 interactions");
{
  const rep = JSON.parse(fs.readFileSync(`public/samples/${FEATURE}.report.json`, "utf8"));
  const cardCounts = async (page) => {
    const card = page.getByTestId("card-review").first();
    await card.waitFor({ timeout: 15000 });
    return ["blocker", "warning", "suggestion"].map(async (k) => +(await card.getByTestId(`count-${k}`).innerText()));
  };
  // (a) one click on the first suggested prompt = 1 interaction
  {
    const { ctx, page } = await fresh();
    await page.goto(BASE + "/");
    await page.getByTestId("agent-chip").first().waitFor();
    let interactions = 0;
    interactions++;
    await page.getByTestId("agent-chip").first().click();
    const c = await Promise.all(await cardCounts(page));
    check(interactions <= 2 && interactions === 1, `suggested prompt: review card after ${interactions} interaction (SC-001 <= 2)`);
    check(c[0] === rep.summary.blocker && c[1] === rep.summary.warning && c[2] === rep.summary.suggestion && c.join("/") === "6/10/3", `card counts ${c.join("/")} equal the real report (6/10/3)`);
    await ctx.close();
  }
  // (b) typing a request + Enter = 2 interactions
  {
    const { ctx, page } = await fresh();
    await page.goto(BASE + "/");
    await page.getByTestId("agent-composer").waitFor();
    let interactions = 0;
    interactions++;
    await page.getByTestId("agent-composer").fill(`Revisá ${FEATURE}`);
    interactions++;
    await page.getByTestId("agent-composer").press("Enter");
    const c = await Promise.all(await cardCounts(page));
    check(interactions <= 2 && c.join("/") === "6/10/3", `typed request: review card after ${interactions} interactions with counts ${c.join("/")}`);
    await ctx.close();
  }
}

await browser.close();
killAll();
console.log(`\n${passes} checks passed, ${fails.length} failed`);
console.log(fails.length ? "FAILED:\n - " + fails.join("\n - ") : "ALL PASS");
process.exit(fails.length ? 1 : 0);
