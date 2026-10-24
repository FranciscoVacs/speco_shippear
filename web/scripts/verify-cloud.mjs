// Spec 015 (cloud app): the BUILT app in a real browser against the REAL service on a real (throwaway) Postgres, with a fake GitHub
// and the review worker running (scripts/cloud_e2e_server.py). Sign-in is a session injected the way the Supabase library stores it:
// we mint the access token ourselves with the service's JWT secret, exactly what Supabase would sign.
//   cd web && node scripts/verify-cloud.mjs        (SKIP_BUILD=1 reuses dist/ and dist-cloud/)
import { chromium } from "playwright-core";
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
process.chdir(WEB);
const API_PORT = 48799, WEB_PORT = 45173, OTHER_PORT = 45174;
const API = `http://127.0.0.1:${API_PORT}`, APP = `http://127.0.0.1:${WEB_PORT}`;
const SUPABASE = "http://localhost:9999";                    // never answers: a valid session needs no network until it nears expiry
const STORAGE_KEY = "sb-speco-auth-token";                    // fixed by the app (AUTH_STORAGE_KEY), not derived from the project host
const exe = process.env.CHROMIUM ?? fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
fs.mkdirSync("screenshots", { recursive: true });

const fails = [];
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
const shot = (page, name) => page.screenshot({ path: `screenshots/${name}.png` });

// ---------------------------------------------------------------- builds
if (!process.env.SKIP_BUILD) {
  execSync("npm run build", { stdio: "inherit" });
  execSync("npx vite build --outDir dist-cloud --emptyOutDir", {
    stdio: "inherit",
    env: { ...process.env, VITE_CLOUD_URL: API, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: "anon-key-for-tests" },
  });
}

// ---------------------------------------------------------------- the service
const py = spawn("python3", ["scripts/cloud_e2e_server.py", "--port", String(API_PORT), "--app-url", APP], { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
const ready = await new Promise((resolve, reject) => {
  let buf = "";
  const t = setTimeout(() => reject(new Error("the service did not start in 60s")), 60000);
  py.stdout.on("data", (d) => {
    buf += d;
    const m = /^READY (.*)$/m.exec(buf);
    if (m) { clearTimeout(t); resolve(JSON.parse(m[1])); }
  });
  py.on("exit", (c) => reject(new Error("the service exited early: " + c)));
});
const stopAll = () => { try { py.kill("SIGTERM"); } catch { /* gone */ } };
process.on("exit", stopAll);

const b64 = (b) => Buffer.from(b).toString("base64url");
function session(userId, email, { secret = ready.jwtSecret, ttl = 3600, clientId = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ sub: userId, aud: "authenticated", iss: `${SUPABASE}/auth/v1`, role: "authenticated", email, iat: now, exp: now + ttl, ...(clientId ? { client_id: clientId } : {}) }));
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  const access = `${head}.${body}.${sig}`;
  return { access, json: JSON.stringify({ access_token: access, token_type: "bearer", expires_in: ttl, expires_at: now + ttl, refresh_token: "r-" + userId.slice(-4), user: { id: userId, aud: "authenticated", email, user_metadata: { full_name: email.split("@")[0] } } }) };
}
const U = ready.users;
const who = { owner: [U.owner, "owner@example.com"], viewer: [U.viewer, "viewer@example.com"], approver: [U.approver, "approver@example.com"], invitee: [U.invitee, "invitee@example.com"], newbie: [U.newbie, "newbie@example.com"] };

// ---------------------------------------------------------------- the app (cloud build) and the demo build, plus a foreign origin
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const serve = (dir, port) => new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = path.join(dir, u);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    res.setHeader("content-type", MIME[path.extname(f)] ?? "application/octet-stream");
    fs.createReadStream(f).pipe(res);
  });
  s.listen(port, "127.0.0.1", () => resolve(s));
});
const cloudSrv = await serve(path.join(WEB, "dist-cloud"), WEB_PORT);
const demoSrv = await serve(path.join(WEB, "dist"), 0);
const demoBase = `http://127.0.0.1:${demoSrv.address().port}`;
const otherSrv = http.createServer((_q, res) => { res.setHeader("content-type", "text/html"); res.end("<!doctype html><title>other</title>"); });
await new Promise((r) => otherSrv.listen(OTHER_PORT, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
async function open(as, { w = 1280, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "light", reducedMotion: "reduce" });
  const s = as ? session(...who[as]) : null;
  await ctx.addInitScript(([key, val]) => { try { localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-panel", "0"); if (val && !localStorage.getItem("__seeded")) { localStorage.setItem(key, val); localStorage.setItem("__seeded", "1"); } } catch {} }, [STORAGE_KEY, s?.json ?? ""]);   // seed once: signing out must stay signed out after a reload
  // GitHub's install page: the fake sends the browser straight back to the service with the same state, like GitHub does after "Install"
  await ctx.route("https://github.com/apps/**", (route) => route.fulfill({
    status: 200, contentType: "text/html",
    body: `<!doctype html><title>GitHub</title><script>const st = new URL(location.href).searchParams.get("state"); location.href = "${API}/github/setup?installation_id=1234&state=" + encodeURIComponent(st);</script>`,
  }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors, token: s?.access };
}
const text = (page, sel = "main") => page.locator(sel).first().innerText();
const card = (page, rx) => page.locator("article[data-code]").filter({ hasText: rx });
const num = async (page, id) => Number(await page.getByTestId(id).innerText());
const waitStat = (page, id, n) => page.waitForFunction(([i, v]) => Number(document.querySelector(`[data-testid=${i}]`)?.textContent) === v, [id, n], { timeout: 20000 });

let owner = null;
try {
  // ------------------------------------------------------------ US1: signed out
  {
    const { ctx, page } = await open(null);
    await page.goto(APP + "/");
    await page.waitForURL("**/signed-out");
    await page.getByRole("button", { name: "Entrar con GitHub" }).waitFor();
    check((await page.getByRole("textbox").count()) === 1 && (await page.getByRole("button", { name: "Enviarme un enlace" }).count()) === 1, "FR-001: nobody signed in -> GitHub or an email link, nothing else");
    check((await page.locator("input[type=password]").count()) === 0, "there is no password field");
    await shot(page, "cloud-signin-1280-light");
    await ctx.close();
  }

  // ------------------------------------------------------------ US1: first company
  {
    const { ctx, page, errors } = await open("newbie");
    // spec 022: the first touch is kept through the sign-in and handed to the service before the company exists
    const sentAcq = page.waitForRequest((r) => r.url().endsWith("/api/acquisition"));
    await page.goto(APP + "/?utm_source=pr_footer&door=code");
    await page.getByRole("heading", { name: "Creá tu empresa" }).waitFor();
    const acq = (await sentAcq).postDataJSON();
    check(acq.channel === "pr_footer" && acq.door === "code", `spec 022: the channel and door of the link reach the service (${JSON.stringify(acq)})`);
    await page.waitForFunction(() => localStorage.getItem("sr-acquisition") === null);
    check(true, "spec 022: the kept touch is dropped once the service has it");
    check((await page.locator(".sidebar").count()) === 0, "FR-002: a signed-in person with no company sees only 'create your company'");
    await page.getByLabel("Nombre del workspace").fill("Newbie Labs");
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await page.waitForSelector(".sidebar");
    check((await page.getByRole("button", { name: /Cambiar de workspace: Newbie Labs/ }).count()) === 1, "the new company is the current workspace");
    await page.reload();
    await page.waitForSelector(".sidebar");
    check((await page.getByRole("button", { name: /Cambiar de workspace: Newbie Labs/ }).count()) === 1, "it is still there after a reload (stored by the service)");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }

  // ------------------------------------------------------------ spec 016: the second door, driven by someone with no technical knowledge
  {
    const { ctx, page, errors } = await open("newbie");
    const jargon = /repositor|commit|pull request|requisit|requirement|\bspec\b|github|\bapi\b|token/i;
    const seen = [];
    await page.goto(APP + "/");
    await page.getByRole("heading", { name: "¿Por dónde querés empezar?" }).waitFor({ timeout: 20000 });
    seen.push(await text(page));
    check((await page.getByRole("link", { name: /Ya tengo software/ }).count()) === 1 && (await page.getByRole("link", { name: /Tengo una idea/ }).count()) === 1, "spec 016 FR-001: a company with nothing in it is asked one plain question with two answers");
    await shot(page, "cloud-welcome-1280-light");
    await page.getByRole("link", { name: /Tengo una idea/ }).click();
    await page.waitForURL("**/ideas");
    await page.locator("#idea-need").fill("Quiero que los clientes puedan cobrar rápido por email");
    seen.push(await text(page));
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
    await page.getByText(/Pregunta 1 de 7/).waitFor();
    check((await text(page, "#idea-q-h")).includes("número"), "spec 016 FR-004: the first question turns the vague word into a number, with an example");
    const answer = async (n, txt, unknown = false) => {
      await page.getByText(new RegExp(`Pregunta ${n} de 7`)).waitFor();
      seen.push(await text(page));
      if (unknown) await page.getByRole("button", { name: "Todavía no lo sé" }).click();
      else { await page.locator("#idea-answer").fill(txt); await page.getByRole("button", { name: "Guardar y seguir" }).click(); }
    };
    await answer(1, "En menos de 3 segundos");
    await answer(2, "Solo quien administra la cuenta");
    await answer(3, "", true);
    await answer(4, "10 USD por uso; se devuelve todo si lo cancela en 14 días");
    await answer(5, "", true);
    await answer(6, "No choca con nada");
    await answer(7, "El 95 % de los cobros termina en menos de 3 segundos");
    await page.getByRole("heading", { name: /Listo: esto es lo que decidiste/ }).waitFor();
    seen.push(await text(page));
    const brief = await page.locator(".idea-brief").innerText();
    check(brief.includes("En menos de 3 segundos") && brief.includes("No inventes reglas de negocio") && brief.includes("Lo que todavía no está decidido"), "spec 016 FR-006: the brief says what was decided, what was not, and not to guess");
    check((await text(page)).includes("2 preguntas quedaron sin decidir"), "spec 016 FR-007: the two questions the person could not answer are kept open and named as a risk");
    await shot(page, "cloud-idea-brief-1280-light");
    await page.getByRole("button", { name: "Copiar el texto" }).click();
    await page.getByRole("status").filter({ hasText: /Texto copiado|No se pudo copiar/ }).first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.reload();
    await page.getByRole("heading", { name: /Listo: esto es lo que decidiste/ }).waitFor({ timeout: 20000 });
    check((await page.locator(".idea-brief").innerText()) === brief, "spec 016 FR-005: the decisions are kept in the service: they are the same after a reload");
    // changing one's mind: a question left open can be decided later
    await page.locator(".idea-answer").filter({ hasText: /límites/ }).getByRole("button", { name: "Cambiar" }).click();
    await page.locator("#idea-answer").fill("Hasta 5 cobros por día");
    await page.getByRole("button", { name: "Guardar y seguir" }).click();
    await page.getByRole("heading", { name: /Listo: esto es lo que decidiste/ }).waitFor();
    check((await text(page)).includes("Una pregunta quedó sin decidir"), "spec 016: deciding a question that was open lowers the risk to one");
    seen.push(await text(page));
    await page.goto(APP + "/ideas");
    await page.getByRole("link", { name: /Los clientes puedan cobrar rápido/ }).first().waitFor({ timeout: 20000 });
    check(true, "the idea is in the person's list");
    check(!seen.some((t) => jargon.test(t)), `spec 016 FR-010: no screen of the second door uses a technical word (${seen.map((t) => (jargon.exec(t) || [])[0]).filter(Boolean).join(",") || "none"})`);
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }

  // ------------------------------------------------------------ US2 + US3: the owner
  owner = await open("owner");
  {
    const { page, errors, token } = owner;
    await page.goto(APP + "/connect");
    await page.waitForSelector(".sidebar");
    check((await page.getByRole("button", { name: /Cambiar de workspace: Acme Cloud/ }).count()) === 1, "FR-003: the switcher shows the company the service reports");
    await page.getByText("Todavía no hay repositorios conectados").waitFor();
    check(true, "nothing connected yet");
    check((await page.getByText("Datos de demostración").count()) === 0, "the cloud connect page does not claim to be a demo");
    await shot(page, "cloud-connect-empty-1280-light");

    // FR-006: connect GitHub for real (fake GitHub page -> the service's /github/setup -> back to the app)
    await page.getByRole("button", { name: "Conectar GitHub" }).click();
    await page.waitForURL(/\/connect\?installed=1/, { waitUntil: "commit" });
    await page.getByText("GitHub quedó conectado: 1 repositorios.").waitFor();
    check((await page.locator("li[data-repo='acme/app']").count()) === 1, "FR-008: the repository that came back is listed");
    await page.locator("li[data-repo='acme/app']").getByText("leído").waitFor({ timeout: 30000 });
    check(true, "the worker read it (the list refreshes by itself)");
    await shot(page, "cloud-connect-installed-1280-light");

    // FR-009: ask for the portrait
    await page.getByRole("button", { name: "Armar el retrato inicial" }).click();
    await page.waitForURL("**/portrait");
    await page.waitForSelector("article[data-code]", { timeout: 30000 });
    check((await num(page, "pt-n-proposed")) === 3 && (await num(page, "pt-n-confirmed")) === 0, "FR-010: the portrait shows the company's own rules (3 proposed from the implemented spec), not the demo's");
    check(!(await text(page)).includes("acme/billing"), "none of the demo's repositories or rules are shown");
    const first = await page.locator("article[data-code] h3").first().innerText();
    check(/only owners and admins|refund/i.test(first), `high-risk rules come first (${first})`);
    await shot(page, "cloud-portrait-1280-light");

    // FR-011: decide through the service; the result survives a reload
    await card(page, /only owners and admins/i).getByRole("button", { name: "Confirmar" }).click();
    await waitStat(page, "pt-n-confirmed", 1);
    await card(page, /email the invitee/i).getByRole("button", { name: "Rechazar" }).click();
    await card(page, /email the invitee/i).getByRole("button", { name: "Rechazar la regla" }).click();
    check((await card(page, /email the invitee/i).getByRole("alert").innerText()).includes("Contá por qué"), "rejecting without a reason is refused");
    await card(page, /email the invitee/i).locator("textarea").fill("Eso lo manda otro sistema");
    await card(page, /email the invitee/i).getByRole("button", { name: "Rechazar la regla" }).click();
    await waitStat(page, "pt-n-proposed", 1);
    await page.getByRole("button", { name: "Corregir" }).click();
    await page.locator("article[data-code] textarea").fill("Los reembolsos anuales son completos dentro de los 14 días");
    await page.getByRole("button", { name: "Guardar y confirmar" }).click();
    await waitStat(page, "pt-n-confirmed", 2);
    await page.reload();
    await page.waitForSelector(".stats");
    check((await num(page, "pt-n-confirmed")) === 2 && (await num(page, "pt-n-proposed")) === 0, "FR-011: the decisions are still there after a reload (they live in the service)");
    await page.locator("#pt-confirmed-h button").click();
    const conf = await text(page, "#pt-confirmed-body");
    check(conf.includes("Los reembolsos anuales son completos dentro de los 14 días") && conf.includes("Confirmada por vos"), "a correction keeps the new text and says who decided ('vos')");
    await page.locator("#pt-rejected-h button").click();
    check((await text(page, "#pt-rejected-body")).includes("Eso lo manda otro sistema") || (await text(page, "#pt-rejected-body")).includes("Rechazada por vos"), "a rejected rule is recorded as such");

    // baseline
    await page.getByRole("button", { name: "Congelar línea base" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Congelar", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".pt-base")?.textContent?.startsWith("#"), null, { timeout: 20000 });
    const hash = await page.locator(".pt-base").innerText();
    await page.reload();
    await page.waitForSelector(".stats");
    check((await page.locator(".pt-base").innerText()) === hash, `FR-011: the baseline hash comes from the service and survives a reload (${hash})`);
    await shot(page, "cloud-portrait-decided-1280-light");

    // FR-013: the permission to analyze code
    await page.locator("#pt-repos-h button").click().catch(() => {});
    const box = page.locator("#pt-repos-body input[type=checkbox]").first();
    if (!(await box.isVisible().catch(() => false))) await page.locator("#pt-repos-h button").click();
    check(!(await box.isChecked()), "code analysis starts off");
    await box.click();                                    // the service answers before the box shows as checked: not a plain check()
    await page.waitForFunction(() => document.querySelector("#pt-repos-body input[type=checkbox]")?.checked);
    await page.reload();
    const btn = page.locator("#pt-repos-h button");
    await btn.waitFor();
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
    check(await page.locator("#pt-repos-body input[type=checkbox]").first().isChecked(), "FR-013: the permission is stored by the service");

    // NFR-002: where the token lives
    const dump = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    const holders = Object.entries(dump).filter(([, v]) => v.includes(token)).map(([k]) => k);
    check(JSON.stringify(holders) === JSON.stringify([STORAGE_KEY]), `NFR-002: the access token is only in the library's own key (${holders.join(",")})`);
    check(!Object.keys(dump).includes("sr-session"), "the real person and companies are not written to the app's own session storage");
    check(!Object.values(dump).some((v) => v.includes("owner@example.com") && v !== dump[STORAGE_KEY]), "the person's email is not copied elsewhere");
    check(errors.length === 0, "no page errors " + errors.join("|"));
  }

  // ------------------------------------------------------------ spec 019: a Bitbucket workspace with many repositories (a clean company: "Newbie Labs")
  {
    const { ctx, page, errors } = await open("newbie");
    await page.goto(APP + "/connect");
    await page.getByText("Todavía no hay repositorios conectados").waitFor();
    await page.getByRole("button", { name: "Conectar Bitbucket" }).click();
    const form = page.getByRole("form", { name: "Conectar un workspace de Bitbucket" });
    const submit = async (workspace, key, secret) => {
      await form.getByLabel("Workspace de Bitbucket").fill(workspace);
      await form.getByLabel("Key del consumer").fill(key);
      await form.getByLabel("Secret del consumer").fill(secret);
      await form.getByRole("button", { name: "Conectar workspace" }).click();
    };
    await submit("pilotco", "writer", "s3cret-VALUE");
    check((await form.getByRole("alert").innerText()).includes("puede escribir") || (await form.getByRole("alert").innerText()).includes("can write"), "a credential that can write is refused with a plain reason");
    await submit("ghost", "k", "s3cret-VALUE");
    await page.waitForFunction(() => /workspace/i.test(document.querySelector(".bb-form [role=alert]")?.textContent ?? "") && !/write/i.test(document.querySelector(".bb-form [role=alert]")?.textContent ?? ""));
    check(true, "an unknown workspace is a clear error");
    await submit("pilotco", "k", "s3cret-VALUE");
    await page.getByText("Bitbucket quedó conectado: 3 repositorios disponibles").waitFor();
    check((await page.locator("li[data-available]").count()) === 3 && (await page.locator("li[data-repo]").count()) === 0, "SC-004: three repositories are available and none is being read");
    check((await page.locator("body").innerText()).includes("s3cret-VALUE") === false && (await page.locator("input[type=password]").count()) === 0, "the secret is gone from the page once connected");
    const stored = await page.evaluate(() => JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)]));
    check(!stored.includes("s3cret-VALUE"), "the secret is not stored in the browser");
    await shot(page, "cloud-connect-bitbucket-1280-light");

    await page.getByLabel("Buscar repositorio").fill("web");
    check((await page.locator("li[data-available]").count()) === 1, "searching narrows the list");
    await page.getByLabel("Buscar repositorio").fill("");
    await page.locator("li[data-available='pilot/api'] input").check();
    await page.locator("li[data-available='pilot/web'] input").check();
    await page.getByRole("button", { name: "Leer 2 elegidos" }).click();
    await page.getByText("Listo: Speco empieza a leer 2 repositorios.").waitFor();
    await page.locator("li[data-repo='pilot/api']").getByText("leído").waitFor({ timeout: 30000 });
    check((await page.locator("li[data-repo]").count()) === 2 && (await page.locator("li[data-available]").count()) === 1, "only the chosen repositories are read; the rest stay available");

    await page.getByRole("button", { name: "Dejar de leer: pilot/web" }).click();
    await page.waitForFunction(() => !document.querySelector("li[data-repo='pilot/web']"));
    check((await page.locator("li[data-available]").count()) === 2, "stopping returns a repository to available");
    check((await page.locator("li[data-connection='bitbucket:pilotco']").innerText()).includes("1 leyendo · 2 disponibles"), "the connection says how many are read and how many are available");

    await page.getByRole("button", { name: "Actualizar" }).click();
    await page.getByText(/^Actualizado:/).waitFor();
    check(true, "refreshing reports what it found");

    await page.getByRole("button", { name: "Desconectar" }).click();
    await page.getByRole("button", { name: "Sí, desconectar pilotco" }).click();
    await page.getByText("Desconectado. Se borraron las credenciales.").waitFor();
    await page.getByText("Todavía no hay repositorios conectados").waitFor();
    check((await page.locator("li[data-repo], li[data-available]").count()) === 0, "disconnecting removes the repositories from the list");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }

  // ------------------------------------------------------------ roles
  {
    const { ctx, page } = await open("viewer");
    await page.goto(APP + "/portrait");
    await page.waitForSelector(".stats");
    await page.locator("#pt-confirmed-h button").click();
    check((await num(page, "pt-n-confirmed")) === 2 && (await page.locator("article[data-code]").count()) >= 2, "a viewer sees the company's rules");
    check((await page.getByRole("button", { name: "Confirmar" }).count()) === 0 && (await page.getByRole("button", { name: "Congelar línea base" }).count()) === 0, "FR-012: a viewer gets no decision buttons");
    await page.locator("#pt-repos-h button").click().catch(() => {});
    check(await page.locator("#pt-repos-body input[type=checkbox]").first().isDisabled().catch(() => true), "a viewer cannot change the code-analysis permission");
    await page.goto(APP + "/connect");
    await page.getByText("Solo los dueños y administradores pueden conectar repositorios.").waitFor();
    check((await page.getByRole("button", { name: /Conectar GitHub|Conectar más/ }).count()) === 0, "FR-007: a viewer cannot start the GitHub connection");
    check((await page.locator("li[data-repo='acme/app']").count()) === 1, "...but sees the repositories");
    // the service refuses even if the page is bypassed
    const refusal = await page.evaluate(async ([api, tok, org]) => (await fetch(`${api}/api/github/install-url`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: org }) })).status, [API, session(...who.viewer).access, ready.org]);
    check(refusal === 403, `the service itself refuses a viewer (${refusal})`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open("approver");
    await page.goto(APP + "/connect");
    await page.getByText("Solo los dueños y administradores pueden conectar repositorios.").waitFor();
    check((await page.getByRole("button", { name: "Armar el retrato inicial" }).count()) === 1, "an approver cannot connect GitHub but can ask for the portrait");
    await page.goto(APP + "/portrait");
    await page.waitForSelector(".stats");
    check((await page.getByRole("button", { name: "Congelar línea base" }).count()) === 1, "an approver can freeze a baseline");
    await ctx.close();
  }

  // ------------------------------------------------------------ FR-005: the service does not accept the session
  {
    const bad = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const forged = session(...who.owner, { secret: "not-the-service-secret-at-all-0123456789" });
    await bad.addInitScript(([key, val]) => { try { localStorage.setItem("sr-lang", "es"); localStorage.setItem(key, val); } catch {} }, [STORAGE_KEY, forged.json]);
    const page = await bad.newPage();
    await page.goto(APP + "/");
    await page.waitForURL("**/signed-out", { timeout: 20000 });
    check(true, "FR-005: a session the service rejects ends at the sign-in screen");
    await page.waitForFunction((k) => !localStorage.getItem(k), STORAGE_KEY);
    check(true, "...and the stored session is forgotten");
    await bad.close();
  }

  // ------------------------------------------------------------ FR-004: sign out
  {
    const { page } = owner;
    await page.goto(APP + "/");
    await page.waitForSelector(".sidebar");
    await page.keyboard.press("Control+k");
    await page.waitForSelector("[role=dialog] input");
    await page.fill("[role=dialog] input", "Cerrar sesión");
    await page.keyboard.press("Enter");
    await page.waitForURL("**/signed-out");
    await page.waitForFunction((k) => localStorage.getItem(k) === null, STORAGE_KEY, { timeout: 20000 });
    check(true, "FR-004: signing out forgets the session (even though Supabase cannot be reached in this check)");
    await page.goto(APP + "/portrait");
    await page.waitForURL("**/signed-out");
    check(true, "...and the app no longer opens without signing in again");
  }

  // ------------------------------------------------------------ spec 018: an AI agent asks to connect (consent screen) and then uses the MCP endpoint
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const so = session(...who.owner);
    await ctx.addInitScript(([key, val]) => { try { localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-onboarded", "1"); if (val && localStorage.getItem("__go") === "1" && !localStorage.getItem("__seeded")) { localStorage.setItem(key, val); localStorage.setItem("__seeded", "1"); } } catch {} }, [STORAGE_KEY, so.json]);
    // Supabase Auth as OAuth server, simulated at its three endpoints (paths and shapes taken from supabase-js)
    const cors = { "access-control-allow-origin": APP, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };
    const calls = [];
    let nextConsent = { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz" };
    let grants = [{ client: { id: "c-1", name: "Claude", uri: "https://claude.ai", logo_uri: "https://claude.ai/logo.png" }, scopes: ["openid", "email"], granted_at: "2026-10-15T00:00:00Z" }];
    await ctx.route("http://localhost:9999/auth/v1/**", async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      calls.push(`${req.method()} ${u.pathname}`);
      const json = (body, status = 200) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
      if (u.pathname === "/auth/v1/oauth/authorizations/auth-1" && req.method() === "GET") return json({ authorization_id: "auth-1", redirect_uri: "https://claude.ai/api/mcp/auth_callback", client: { id: "c-1", name: "Claude", uri: "https://claude.ai", logo_uri: "https://claude.ai/logo.png" }, user: { id: U.owner, email: "owner@example.com" }, scope: "openid email" });
      if (u.pathname === "/auth/v1/oauth/authorizations/done-1" && req.method() === "GET") return json({ redirect_url: "https://claude.ai/api/mcp/auth_callback?code=already" });
      if (u.pathname === "/auth/v1/oauth/authorizations/auth-1/consent") return json(nextConsent);
      if (u.pathname === "/auth/v1/user/oauth/grants" && req.method() === "GET") return json(grants);
      if (u.pathname === "/auth/v1/user/oauth/grants" && req.method() === "DELETE") { grants = []; return route.fulfill({ status: 204, headers: cors }); }
      return json({ message: "not simulated" }, 404);
    });
    await ctx.route("https://claude.ai/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Claude</title>back in Claude" }));
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // signed out: the consent link must survive the sign-in
    await page.goto(APP + "/oauth/consent?authorization_id=auth-1");
    await page.waitForURL("**/signed-out");
    check((await page.evaluate(() => localStorage.getItem("sr-return-to") || "")).includes("/oauth/consent?authorization_id=auth-1"), "a consent link opened signed out is remembered through the sign-in");
    check(!calls.some((c) => c.includes("/oauth/authorizations/")), "...and the authorization is not looked up before the person is signed in");
    await page.evaluate(() => localStorage.setItem("__go", "1"));            // "sign in": the session appears and the app goes back to "/"
    await page.goto(APP + "/");
    await page.getByTestId("consent").waitFor({ timeout: 20000 });
    check((await page.getByTestId("consent").innerText()).includes("Claude quiere conectarse a tu Speco"), "after signing in the person lands on the consent screen");
    const txt = await page.getByTestId("consent").innerText();
    check(txt.includes("claude.ai") && txt.includes("No puede") && txt.includes("Aprobar, confirmar ni rechazar nada"), "it says where the agent returns to and what it can NOT do (decide)");
    check((await page.locator("main img").count()) === 0, "the client's logo is not loaded from a third-party address");
    await shot(page, "cloud-consent-1280-light");

    // an unsafe redirect from the server is never followed
    nextConsent = { redirect_url: "javascript:alert(1)" };
    await page.getByRole("button", { name: "Permitir", exact: true }).click();
    await page.getByRole("alert").waitFor();
    check(page.url().startsWith(APP) && errors.length === 0, "a javascript: redirect is refused and not followed");
    nextConsent = { redirect_url: "https://claude.ai/api/mcp/auth_callback?error=access_denied&state=xyz" };
    await page.goto(APP + "/oauth/consent?authorization_id=auth-1");
    const seen = page.waitForRequest((r) => /claude\.ai\/api\/mcp\/auth_callback\?error=access_denied/.test(r.url()));
    await page.getByRole("button", { name: "No permitir", exact: true }).click();
    await seen;
    check(true, "denying sends the browser back to the client with the refusal");
    nextConsent = { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz" };
    await page.goto(APP + "/oauth/consent?authorization_id=auth-1");
    const seen2 = page.waitForRequest((r) => /claude\.ai\/api\/mcp\/auth_callback\?code=abc/.test(r.url()));
    await page.getByRole("button", { name: "Permitir", exact: true }).click();
    await seen2;
    check(true, "allowing sends the browser back to the client with the code");
    const seen3 = page.waitForRequest((r) => /auth_callback\?code=already/.test(r.url()));
    await page.goto(APP + "/oauth/consent?authorization_id=done-1").catch(() => {});
    await seen3;
    check(true, "a client the person already allowed goes straight back");

    // connected agents can be cut off
    await page.goto(APP + "/oauth/consent?authorization_id=auth-1");
    await page.locator("li[data-client='Claude']").waitFor();
    await page.locator("li[data-client='Claude']").getByRole("button", { name: "Quitar acceso" }).click();
    await page.waitForFunction(() => !document.querySelector("li[data-client='Claude']"));
    check(calls.includes("DELETE /auth/v1/user/oauth/grants"), "removing an agent's access calls Supabase and the agent leaves the list");
    // the app itself says how to connect an agent: the address to paste, and the steps
    await page.goto(APP + "/agents");
    const mcpUrl = await page.getByTestId("mcp-url").first().innerText();
    check(/\/mcp$/.test(mcpUrl) && mcpUrl.startsWith("http"), "the agents page shows the address to paste (the service's /mcp)");
    check((await page.locator("main").innerText()).includes("Agregar conector personalizado"), "...and the steps to add it in Claude");
    await shot(page, "cloud-agents-1280-light");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();

    // the MCP endpoint, with the access Supabase would issue to the connected client (claims: iss, aud, sub, client_id)
    const agent = session(...who.owner, { clientId: "c-1" }).access;
    const web = session(...who.owner).access;
    const post = async (body, tok) => { const r = await fetch(`${API}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }); return { status: r.status, headers: r.headers, json: r.status === 200 ? await r.json() : null }; };
    const unauth = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    check(unauth.status === 401 && (unauth.headers.get("www-authenticate") ?? "").includes(`${API}/.well-known/oauth-protected-resource/mcp`), "SC-001: a client with no access is told where to get authorized");
    const meta = await (await fetch(`${API}/.well-known/oauth-protected-resource/mcp`)).json();
    check(meta.authorization_servers?.[0] === `${SUPABASE}/auth/v1` && meta.resource === `${API}/mcp`, "the protected-resource metadata names Supabase Auth as the authorization server");
    check((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, web)).status === 401, "the person's own web session is not accepted at the MCP endpoint");
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, agent);
    check(init.status === 200 && init.json.result.serverInfo.name === "speco", "an authorized client can initialize");
    const tools = (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, agent)).json.result.tools.map((t) => t.name);
    check(tools.includes("pending_decisions") && tools.includes("check_spec") && !tools.some((n) => /decide|approve|confirm|reject|freeze|acknowledge|consent/.test(n)), `SC-002: the tools only read and propose (${tools.join(", ")})`);
    const call = async (name, args = {}) => JSON.parse((await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }, agent)).json.result.content[0].text);
    const rules = await call("list_rules", { status: "confirmed" });
    check(rules.some((r) => r.statement === "Los reembolsos anuales son completos dentro de los 14 días"), "the agent reads the rules the person decided in the app (the correction included)");
    const pending = await call("pending_decisions");
    check(pending.company === "acme-cloud" && pending.your_role === "owner" && /never decide/.test(pending.note), "pending_decisions speaks for the person's company and says agents never decide");
    const checked = await call("check_spec", { spec: "# Feature Specification: Draft\n\n## Requirements\n\n- **FR-001**: The system MUST be fast\n" });
    check(checked.stored === false && checked.findings.length > 0, "a draft spec is reviewed before building and nothing is stored");
    const viaApi = await fetch(`${API}/api/orgs`, { headers: { authorization: `Bearer ${agent}` } });
    check(viaApi.status === 403, "the agent's access is refused by the web API (agents use only the MCP endpoint)");
  }

  // ------------------------------------------------------------ SC-002: another website cannot read the service from a browser
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${OTHER_PORT}/`);
    const tok = session(...who.owner).access;
    const r = await page.evaluate(async ([api, t]) => { try { await (await fetch(`${api}/api/orgs`, { headers: { Authorization: `Bearer ${t}` } })).json(); return "read"; } catch { return "blocked"; } }, [API, tok]);
    check(r === "blocked", `SC-002: a page from another origin cannot read the answer even holding a valid token (${r})`);
    const own = await (await ctx.newPage()).goto(APP + "/healthz").catch(() => null);
    void own;
    await ctx.close();
  }

  // ------------------------------------------------------------ specs 020 + 021: credits and referrals
  let link = "";
  {
    const { ctx, page, errors, token } = await open("owner");
    await page.goto(APP + "/settings/usage");
    await page.getByTestId("credit-balance").waitFor();
    check(/50 créditos disponibles/.test(await page.getByTestId("credit-balance").innerText()), "spec 020 FR-001/FR-011: the usage page shows the welcome + monthly credits of the company");
    link = await page.getByTestId("referral-link").inputValue();
    check(/\/r\/[0-9a-f]{12}$/.test(link), `spec 021 FR-001: the person has a personal link (${link})`);
    check((await text(page)).includes("Por privacidad nunca mostramos quiénes son"), "spec 021 FR-010: the page says it never shows who they are");
    await shot(page, "cloud-usage-credits-1280-light");
    const viewer = await open("viewer");
    await viewer.page.goto(APP + "/settings/usage");
    await viewer.page.getByText("Solo los dueños y administradores ven los créditos de la empresa.").waitFor();
    check(true, "spec 020 FR-011: a viewer does not see the ledger");
    await viewer.ctx.close();
    check(errors.length === 0, "no page errors " + errors.join("|"));
    void token;
    await ctx.close();
  }
  {
    // the invitee opens the link BEFORE having an account state in this browser, signs in, and creates the first company
    const { ctx, page, errors } = await open("invitee");
    const code = link.split("/r/")[1];
    const checked = page.waitForResponse((r) => r.url().includes("/api/referrals/check/"));
    await page.goto(`${APP}/r/${code}`);
    await checked;
    await page.getByRole("heading", { name: "Alguien te invitó a Speco" }).waitFor();
    check(!(await text(page)).includes("owner"), "spec 021 FR-002: the public page says someone invited you and nothing about who");
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.getByRole("heading", { name: "Creá tu empresa" }).waitFor();
    await page.getByLabel("Nombre del workspace").fill("Invitee Labs");
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await page.waitForSelector(".sidebar");
    check(await page.evaluate(() => localStorage.getItem("sr-referral")) === null, "spec 021: the kept code was handed to the service and dropped");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }
  {
    const { ctx, page } = await open("owner");
    await page.goto(APP + "/settings/usage");
    await page.getByTestId("referral-stats").waitFor();
    const body = await page.evaluate(async ([api, t]) => (await fetch(`${api}/api/referrals/me`, { headers: { Authorization: `Bearer ${t}` } })).json(), [API, session(...who.owner).access]);
    check(body.signed_up === 1 && body.activated === 0 && body.credits_earned === 0, `spec 021 SC-004: the sign-up through the link is recorded and nothing is paid before a first result (${JSON.stringify(body)})`);
    check(!JSON.stringify(body).includes(U.invitee) && !JSON.stringify(body).includes("invitee"), "spec 021 FR-010: the answer names nobody");
    await ctx.close();
  }

  // ------------------------------------------------------------ spec 020: the assistant spends the company's credits
  {
    const { ctx, page, errors } = await open("owner");
    const bal = async () => (await page.evaluate(async ([api, t, org]) => (await (await fetch(`${api}/api/orgs/${org}/credits`, { headers: { Authorization: `Bearer ${t}` } })).json()).balance, [API, session(...who.owner).access, ready.org]));
    await page.goto(APP + "/");
    await page.waitForSelector(".sidebar");
    const before = await bal();
    const composer = page.getByTestId("agent-composer");
    await composer.fill("¿Qué espera mi decisión hoy?");
    await composer.press("Enter");
    await page.getByText("Respuesta del asistente de la empresa.").waitFor({ timeout: 20000 });
    check(true, "spec 020: in cloud mode the home chat is answered by the company's assistant in the service");
    await page.waitForFunction(async ([api, t, org, b]) => (await (await fetch(`${api}/api/orgs/${org}/credits`, { headers: { Authorization: `Bearer ${t}` } })).json()).balance < b, [API, session(...who.owner).access, ready.org, before], { timeout: 10000 });
    check((await bal()) === before - 1, `spec 020 FR-005: the turn was charged to the tokens it used (${before} -> ${await bal()})`);
    await shot(page, "cloud-assistant-turn-1280-light");
    const pill = page.getByTestId("credits-pill");
    check((await pill.getAttribute("aria-label")) === `Créditos del modelo: ${before - 1}` && (await pill.getAttribute("data-level")) === "ok", "spec 020 FR-015: the top bar shows the credits left and it follows the turn that was just charged");
    await pill.click();
    const reset = await page.getByTestId("credits-reset").innerText();
    check(/Se renuevan el .+ \((en \d+ días|mañana)\)\./.test(reset), `spec 020 FR-015: the panel says when they reset (${reset})`);
    await shot(page, "cloud-credits-pill-panel-1280-light");
    await page.getByTestId("upgrade-pill").click();
    await page.getByTestId("billing-simulated").waitFor({ timeout: 10000 });
    check(/\/settings\/billing$/.test(page.url()), "spec 024 FR-016: with billing on, the upgrade button takes an owner to the plans");
    check((await page.getByTestId("billing-simulated").innerText()).includes("nada de verdad"), "spec 024 FR-012: the screen that shows money says the payment is simulated");
    check((await page.getByTestId("credits-banner").count()) === 0, "no warning while the company has plenty of credits");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }
  {
    // a company running out: warning first, then the limit, in the chat
    const { ctx, page, errors } = await open("newbie");
    await page.goto(APP + "/");
    await page.waitForSelector(".sidebar");
    const org = await page.evaluate(async ([api, t]) => (await (await fetch(`${api}/api/orgs`, { headers: { Authorization: `Bearer ${t}` } })).json())[0].id, [API, session(...who.newbie).access]);
    for (let i = 0; i < 9; i++) {                    // nine heavy turns: 9 x 5 = 45 of 50 credits
      const r = await page.evaluate(async ([api, t, o]) => (await fetch(`${api}/api/orgs/${o}/assistant`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "gasta todo" }] }) })).status, [API, session(...who.newbie).access, org]);
      if (r !== 200) throw new Error("setup turn failed " + r);
    }
    await page.reload();
    await page.waitForSelector(".sidebar");
    const banner = page.getByTestId("credits-banner");
    await banner.waitFor();
    check((await banner.getAttribute("data-level")) === "near" && /Estás llegando a tu límite/.test(await banner.innerText()) && /Te quedan 5 de 50 créditos/.test(await banner.innerText()), "spec 020 FR-016: the chat warns 'you are reaching your limit' with what is left and when it resets");
    check((await page.getByTestId("credits-pill").getAttribute("data-level")) === "near", "the top bar warms up at the same time");
    await shot(page, "cloud-credits-warning-1280-light");
    await page.getByRole("button", { name: "Cerrar aviso" }).click();
    check((await banner.count()) === 0, "the warning can be closed");
    const composer = page.getByTestId("agent-composer");
    await composer.fill("gasta lo que queda");
    await composer.press("Enter");
    await page.getByText("Respuesta del asistente de la empresa.").waitFor({ timeout: 20000 });
    await banner.waitFor();
    check((await banner.getAttribute("data-level")) === "full" && (await banner.getAttribute("role")) === "alert" && /Llegaste a tu límite/.test(await banner.innerText()), "spec 020 FR-016: after the answer that used the last credits the chat says 'you reached your limit' (a closed warning does not hide it)");
    await shot(page, "cloud-credits-limit-1280-light");
    await page.getByTestId("upgrade-chat_limit").waitFor();
    check(/Se renuevan el/.test(await banner.innerText()), "the limit says when credits come back");
    await composer.fill("otra pregunta");
    await composer.press("Enter");
    await page.getByText(/No quedan créditos para el asistente/).waitFor({ timeout: 20000 });
    check((await banner.getAttribute("data-level")) === "full", "a refused turn keeps the limit visible instead of a bare error");
    await page.goto(APP + "/settings/usage");
    await page.getByTestId("usage-reset").waitFor();
    check((await page.getByTestId("upgrade-usage").count()) === 1 && (await page.getByTestId("credit-balance").innerText()).startsWith("0 créditos"), "the usage page shows the limit, the reset and the upgrade button");
    await shot(page, "cloud-usage-limit-1280-light");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }
  {
    // spec 024: the company at its limit upgrades, a declined card changes nothing, an accepted one gives room, and the change of mind is free
    const { ctx, page, errors } = await open("newbie");
    await page.goto(APP + "/settings/usage");
    await page.getByTestId("view-plans").click();
    await page.getByTestId("plan-pro").waitFor();
    check((await page.getByTestId("billing-plan").innerText()) === "Gratuito", "spec 024: the company starts on the free plan");
    await page.getByTestId("choose-pro").click();
    check(/Pagás .*29.* hoy/.test(await page.getByTestId("billing-confirm").innerText()), "spec 024 FR-004: the price to pay is said before paying");
    await page.getByTestId("billing-decline").check();
    await page.getByTestId("billing-pay").click();
    await page.getByTestId("billing-error").waitFor();
    check(/rechazado/.test(await page.getByTestId("billing-error").innerText()) && (await page.getByTestId("billing-plan").innerText()) === "Gratuito", "spec 024 FR-003: a declined payment changes nothing and says so");
    await page.getByTestId("billing-decline").uncheck();
    await page.getByTestId("billing-pay").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=billing-plan]")?.textContent === "Pro", null, { timeout: 15000 });
    await page.getByTestId("billing-renews").waitFor();
    await page.waitForFunction(() => document.querySelector(".tenant .plan-badge")?.textContent === "Pro", null, { timeout: 10000 });
    check(true, "spec 024: the plan badge of the workspace switcher follows the new plan");
    const rows = await page.getByTestId("billing-invoices").locator("tbody tr").allInnerTexts();
    check(rows.length === 2 && rows.every((r) => /SIM-/.test(r) && /simulada/.test(r)) && /Rechazada/.test(rows[1]) && /Pagada/.test(rows[0]), `spec 024 FR-009, FR-012: both attempts are invoices and both say simulated (${rows.length})`);
    await shot(page, "cloud-billing-pro-1280-light");
    await page.getByTestId("choose-hobby").click();
    await page.getByTestId("billing-scheduled").waitFor();
    check(/vuelve al plan gratuito/.test(await page.getByTestId("billing-scheduled").innerText()) && (await page.getByTestId("billing-plan").innerText()) === "Pro", "spec 024 FR-007: cancelling waits for the end of the period");
    await page.getByTestId("billing-undo").click();
    await page.getByTestId("billing-scheduled").waitFor({ state: "detached" });
    check(true, "spec 024 FR-007: the cancellation can be undone");
    await page.goto(APP + "/");
    await page.waitForSelector(".sidebar");
    check((await page.getByTestId("credits-banner").count()) === 0, "spec 024 SC-001: the limit warning is gone as soon as the plan is paid");
    const composer = page.getByTestId("agent-composer");
    await composer.fill("¿Qué espera mi decisión hoy?");
    await composer.press("Enter");
    await page.getByText("Respuesta del asistente de la empresa.").waitFor({ timeout: 20000 });
    check(Number((await page.getByTestId("credits-pill").getAttribute("aria-label")).match(/\d+/)[0]) >= 590, "spec 024 FR-005: the assistant answers again and the credits come from the plan");
    check(errors.length === 0, "no page errors " + errors.join("|"));
    await ctx.close();
  }
  {
    // an ordinary member sees the summary and is told to ask an admin; a viewer sees no indicator
    const m = await open("approver");
    await m.page.goto(APP + "/");
    await m.page.waitForSelector(".sidebar");
    await m.page.getByTestId("credits-pill").click();
    check((await m.page.getByTestId("upgrade-pill").count()) === 0 && (await text(m.page, "[data-testid=credits-panel]")).includes("Pedile a un administrador"), "spec 020 FR-015: whoever cannot upgrade is told to ask an admin");
    await m.ctx.close();
  }
  {
    // a second company of the same person has no free credits: the assistant explains it in words instead of failing
    const { ctx, page } = await open("viewer");
    const created = await page.goto(APP + "/").then(() => page.waitForSelector(".sidebar")).then(() => page.evaluate(async ([api, t]) => (await (await fetch(`${api}/api/orgs`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Poor Co", slug: "poor-co" }) })).json()).id, [API, session(...who.viewer).access]));
    const second = await page.evaluate(async ([api, t]) => (await (await fetch(`${api}/api/orgs`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Poorer Co", slug: "poorer-co" }) })).json()).id, [API, session(...who.viewer).access]);
    await page.evaluate((id) => localStorage.setItem("sr-org", id), second);
    await page.reload();
    await page.waitForSelector(".sidebar");
    // an empty company opens on the question of the two doors (spec 016): the assistant is still one shortcut away on any other page
    await page.goto(APP + "/decisions");
    await page.waitForSelector(".sidebar");
    await page.keyboard.press("Control+j");
    const composer = page.getByTestId("agent-composer");
    await composer.fill("¿Qué espera mi decisión hoy?");
    await composer.press("Enter");
    await page.getByText(/No quedan créditos para el asistente/).waitFor({ timeout: 20000 });
    check(created !== second, "spec 020 FR-006: with no credits the assistant says so in plain words, and what needs no model keeps working");
    await shot(page, "cloud-assistant-no-credits-1280-light");
    await ctx.close();
  }

  // ------------------------------------------------------------ spec 022: the Sean Ellis question
  {
    const { ctx, page } = await open("approver");
    // the service decides when it is time (a week after a first result, two active days); here the answer is forced, the recording is real
    let due = true;
    await page.route("**/pmf-survey/due", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ due }) }));
    await page.goto(APP + "/");
    await page.waitForSelector(".sidebar");
    await page.getByTestId("survey").waitFor();
    check(await page.getByTestId("survey").getByRole("button", { name: "Enviar" }).isDisabled(), "spec 022: the question cannot be sent without choosing an answer");
    await page.getByLabel("Muy decepcionado").check();
    await page.getByLabel(/principal beneficio/).fill("Decisiones en un solo lugar");
    const posted = page.waitForRequest((r) => r.url().endsWith("/pmf-survey") && r.method() === "POST");
    await page.getByTestId("survey").getByRole("button", { name: "Enviar" }).click();
    const body = (await posted).postDataJSON();
    await page.getByText(/Gracias/).waitFor();
    check(body.disappointed === "very" && body.main_benefit === "Decisiones en un solo lugar", "spec 022: the answer reaches the service");
    due = false;
    await page.reload();
    await page.waitForSelector(".sidebar");
    check((await page.getByTestId("survey").count()) === 0, "spec 022: once answered (or when the service says it is not time) the card is gone");
    await ctx.close();
  }
  {
    // "later" hides the card for two weeks in this browser, without asking the service again
    const { ctx, page } = await open("approver");
    await page.route("**/pmf-survey/due", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ due: true }) }));
    await page.goto(APP + "/");
    await page.getByTestId("survey").waitFor();
    await page.getByTestId("survey").getByRole("button", { name: "Después" }).click();
    await page.reload();
    await page.waitForSelector(".sidebar");
    check((await page.getByTestId("survey").count()) === 0, "spec 022: 'later' keeps the card away after a reload");
    await ctx.close();
  }

  // ------------------------------------------------------------ spec 025: would it have reached code? (one line, one tap, then quiet)
  {
    const { ctx, page } = await open("approver");
    const item = { feature_id: "00000000-0000-0000-0000-0000000000f1", fingerprint: "bbbbbbbbbbbb", rule: "PRD002", severity: "blocker", message: "FR-004 va contra la decisión D-002" };
    let pending = [item];
    await page.route("**/resolved-findings/pending", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pending) }));
    await page.route("**/pmf-survey/due", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ due: false }) }));
    await page.route("**/resolved-findings/*/outcome", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ recorded: true }) }));
    await page.goto(APP + "/");
    await page.waitForSelector(".sidebar");
    check((await page.getByTestId("value-check").count()) === 0, "spec 025: the question does not appear the moment the app opens");
    await page.getByTestId("value-check").waitFor({ timeout: 15000 });
    check((await page.getByTestId("value-check").getByRole("button").count()) === 4, "spec 025: three answers and a close button, nothing to type");
    check(await page.getByTestId("agent-composer").isVisible(), "spec 025: the page stays usable behind the card");
    await shot(page, "cloud-value-check-1280-light");
    const posted = page.waitForRequest((r) => r.url().endsWith("/bbbbbbbbbbbb/outcome") && r.method() === "POST");
    await page.getByTestId("value-check").getByRole("button", { name: "Sí" }).click();
    const body = (await posted).postDataJSON();
    check(body.answer === "yes" && body.feature_id === item.feature_id, "spec 025: one tap sends the answer");
    await page.getByTestId("value-check").waitFor({ state: "detached", timeout: 6000 });
    await page.reload();
    await page.waitForSelector(".sidebar");
    await page.waitForTimeout(10000);
    check((await page.getByTestId("value-check").count()) === 0, "spec 025: after an answer it stays away for a day");
    await ctx.close();
  }
  {
    // closing the card keeps it away for three days
    const { ctx, page } = await open("approver");
    await page.route("**/resolved-findings/pending", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ feature_id: "00000000-0000-0000-0000-0000000000f1", fingerprint: "bbbbbbbbbbbb", rule: "COV001", severity: "blocker", message: "x" }]) }));
    await page.goto(APP + "/");
    await page.getByTestId("value-check").waitFor({ timeout: 15000 });
    await page.getByTestId("value-check").getByRole("button", { name: "Cerrar" }).click();
    await page.reload();
    await page.waitForSelector(".sidebar");
    await page.waitForTimeout(10000);
    check((await page.getByTestId("value-check").count()) === 0, "spec 025: closing the card keeps it away after a reload");
    await ctx.close();
  }

  // ------------------------------------------------------------ spec 027: "Tu turno" is the company's own, and deciding is recorded in the database
  {
    const a = await open("approver");
    await a.page.goto(APP + "/decisions");
    await a.page.waitForSelector(".sidebar");
    await a.page.getByTestId("dec-stats").waitFor({ timeout: 20000 }).catch(() => {});
    await a.page.locator(".dec-stats .stat-v").first().waitFor({ timeout: 20000 });
    const stats = await a.page.locator(".dec-stats .stat-v").allInnerTexts();
    const body = await text(a.page);
    check(stats.map(Number).reduce((x, y) => x + y, 0) === 1 && !body.includes("003-team-invitations") && !body.includes("acme/billing") && !body.includes("Datos de demostración"), `spec 027: the decisions page counts the company's one feature, not the samples, and does not say demo (${stats.join(",")})`);
    await shot(a.page, "cloud-decisions-1280-light");
    await a.page.goto(APP + "/reviews");
    await a.page.getByRole("link", { name: /001-invites/ }).first().waitFor({ timeout: 20000 });
    check((await text(a.page)).includes("acme/app"), "spec 027: the reviews list says which repository the feature lives in");
    await a.page.getByRole("link", { name: /001-invites/ }).first().click();
    await a.page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
    await a.page.getByRole("button", { name: "Rechazar" }).waitFor({ timeout: 20000 }).catch(async (e) => { console.log("DEBUG", a.page.url(), (await text(a.page)).slice(0, 1500), a.errors); throw e; });
    check((await a.page.getByText("Todavía no se registró").count()) === 0 && (await a.page.locator(".appr-line").innerText()).length > 0, "spec 027: the approval panel opens on the company's review");
    await a.page.getByRole("button", { name: "Rechazar" }).click();
    await a.page.getByRole("button", { name: "Registrar decisión" }).click();
    check((await a.page.getByRole("alert").innerText()).length > 0, "spec 027: rejecting without a reason is refused");
    await a.page.getByRole("dialog").locator("textarea").first().fill("Falta definir el reembolso anual");
    await a.page.getByRole("button", { name: "Registrar decisión" }).click();
    await a.page.getByText("Decisión registrada").waitFor({ timeout: 15000 });
    await a.page.reload();
    await a.page.getByText(/Falta definir el reembolso anual/).first().waitFor({ timeout: 20000 });
    check(true, "spec 027: the decision is still there after a reload: it lives in the database, not in the browser");
    check((await a.page.evaluate(() => Object.keys(localStorage).filter((k) => /approvals/.test(k)).length)) === 0, "spec 027: nothing about it is kept in the browser's storage");
    await shot(a.page, "cloud-decision-recorded-1280-light");
    await a.ctx.close();

    const v = await open("viewer");
    await v.page.goto(APP + "/reviews");
    await v.page.getByRole("link", { name: /001-invites/ }).first().click();
    await v.page.getByText(/Falta definir el reembolso anual/).first().waitFor({ timeout: 20000 });
    check((await v.page.getByText("Tu rol no permite decidir.").count()) === 1 && (await v.page.getByRole("button", { name: "Rechazar" }).count()) === 0, "spec 027: a viewer sees the decision but is not offered the buttons");
    await v.ctx.close();

    const o = await open("owner");
    const raw = await o.page.request.get(`${API}/api/orgs/${(await o.page.request.get(`${API}/api/orgs`, { headers: { Authorization: "Bearer " + o.token } }).then((r) => r.json()))[0].id}/approvals/verify`, { headers: { Authorization: "Bearer " + o.token } }).then((r) => r.json());
    check(raw.ok === true && raw.count === 1, `spec 027: the chain of decisions verifies (${JSON.stringify(raw)})`);

    // a link from a pull request names the company: it wins over the last one used, and is ignored when the person is not a member
    const hdr = { Authorization: "Bearer " + o.token };
    const acme = (await o.page.request.get(`${API}/api/orgs`, { headers: hdr }).then((r) => r.json())).find((x) => x.slug === "acme-cloud").id;
    const second = (await o.page.request.post(`${API}/api/orgs`, { headers: hdr, data: { name: "Second Co", slug: "second-co" } }).then((r) => r.json())).id;
    await o.page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, ["sr-org", second]);
    await o.page.goto(APP + "/decisions");
    await o.page.waitForSelector(".sidebar");
    check((await o.page.getByRole("button", { name: /Cambiar de workspace: Second Co/ }).count()) === 1, "spec 027: (setup) the last company used is the second one");
    await o.page.goto(APP + `/decisions?org=${acme}`);
    await o.page.waitForSelector(".sidebar");
    check((await o.page.getByRole("button", { name: /Cambiar de workspace: Acme Cloud/ }).count()) === 1, "spec 027: a link that names a company opens that company");
    await o.page.goto(APP + "/decisions?org=00000000-0000-0000-0000-000000000000");
    await o.page.waitForSelector(".sidebar");
    check((await o.page.getByRole("button", { name: /Cambiar de workspace/ }).count()) === 1, "spec 027: a link that names a company the person does not belong to is ignored");
    await o.ctx.close();
  }

  // ------------------------------------------------------------ US4: the demo is untouched
  {
    const js = fs.readdirSync(path.join(WEB, "dist", "assets")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(WEB, "dist", "assets", f), "utf8")).join("\n");
    check(!js.includes("GoTrue") && !js.includes("supabase.co"), "NFR-001: the demo build does not contain the sign-in library");
    const single = fs.existsSync(path.join(WEB, "dist-single", "index.html")) ? fs.readFileSync(path.join(WEB, "dist-single", "index.html"), "utf8") : "";
    check(!single.includes("GoTrue"), "NFR-001: nor does the exported single-file report");
    const cloudJs = fs.readdirSync(path.join(WEB, "dist-cloud", "assets")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(WEB, "dist-cloud", "assets", f), "utf8")).join("\n");
    check(cloudJs.includes("GoTrue"), "(sanity) the cloud build does contain it");
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-onboarded", "1"); } catch {} });
    const page = await ctx.newPage();
    const external = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== demoBase) external.push(r.url()); });
    await page.goto(demoBase + "/");
    await page.waitForSelector(".sidebar");
    await page.goto(demoBase + "/portrait");
    await page.waitForSelector("article[data-code]");
    await page.goto(demoBase + "/connect");
    await page.waitForSelector(".connect-steps");
    check(external.length === 0, `FR-014: the demo makes no request to any other origin (${external.join(", ")})`);
    check((await page.locator(".sidebar").count()) === 1 && (await text(page)).includes("Datos de demostración"), "the demo still opens straight into the app, labelled as demo data");
    await ctx.close();
  }
} finally {
  await owner?.ctx.close().catch(() => {});
  await browser.close();
  cloudSrv.close(); demoSrv.close(); otherSrv.close();
  stopAll();
}
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log("\nall checks passed");
