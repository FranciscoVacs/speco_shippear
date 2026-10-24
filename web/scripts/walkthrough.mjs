// A guided tour of the product as a person would use it, with screenshots for the pitch (company/sales/flujo/).
//   cd web && npm run build && node scripts/walkthrough.mjs        (CHROMIUM = path to chrome; needs the Python package on PYTHONPATH)
// It runs the REAL local server on a throwaway copy of the wire-transfers example, with the example agent (`--llm demo`),
// and walks: home -> ask the agent -> what waits for my decision -> the review -> approve (blocked, then override) ->
// the spec changes (stale) -> the audit history -> someone edits the log by hand (tamper). The data is the repo's fictional example.
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const OUT = path.join(ROOT, "company", "sales", "flujo");
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^\d\d-.*\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));   // this folder holds only the tour's own screenshots
const py = process.env.PYTHON ?? "python3";
const exe = process.env.CHROMIUM ?? fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux64/chrome`)[0];
const env = { ...process.env, PYTHONPATH: path.join(ROOT, "src") };
let extraEnv = {};
const sr = (...a) => execFileSync(py, ["-m", "specreview.cli", ...a], { cwd: ROOT, encoding: "utf8", env: { ...env, ...extraEnv } });
const FEATURE = "006-wire-transfer-limits";

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sr-walk-"));
fs.cpSync(path.join(ROOT, "examples", "wire-transfers"), repo, { recursive: true });
const port = 19000 + Math.floor(Math.random() * 900);
const srv = spawn(py, ["-m", "specreview.cli", repo, "--serve", "--llm", "demo", "--port", String(port)], { cwd: ROOT, env, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/features")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const fresh = async () => {                     // a new browser profile: nobody is signed in
  const c = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5 });
  await c.addInitScript(() => { try { localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-open-dec-hist", "1"); } catch {} });
  return [c, await c.newPage()];
};
let [ctx, page] = await fresh();
let n = 0;
const shot = async (name, opts = {}) => { n++; const f = `${String(n).padStart(2, "0")}-${name}.png`; await page.screenshot({ path: path.join(OUT, f), ...opts }); console.log("shot", f); };
const settle = () => page.waitForTimeout(500);
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// text of a real command, drawn as a terminal window (the output is the tool's own; only the frame is ours)
const terminal = async (name, cmd, text) => {
  const t = await ctx.newPage();
  await t.setViewportSize({ width: 1100, height: 400 });
  await t.setContent(`<body style="margin:0;background:#f6f7f9;padding:24px;font:14px/1.5 ui-monospace,Menlo,monospace"><div id=w style="width:1040px;background:#0f172a;color:#e2e8f0;border-radius:10px;padding:18px 22px;white-space:pre-wrap;box-shadow:0 8px 30px #0003"><div style="color:#94a3b8;margin-bottom:10px">$ ${esc(cmd)}</div>${esc(text.trimEnd())}</div></body>`);
  n++; const f = `${String(n).padStart(2, "0")}-${name}.png`;
  await (await t.$("#w")).screenshot({ path: path.join(OUT, f) });
  console.log("shot", f);
  await t.close();
};
const sh = (...a) => { try { return [0, sr(...a)]; } catch (e) { return [e.status, String(e.stdout ?? "") + String(e.stderr ?? "")]; } };
// the static app (no backend): what you get before connecting anything; its agent is simulated and says so
const serveStatic = (dir, port) => new Promise((res) => {
  const srv2 = http.createServer((q, r) => {
    let f = path.join(dir, decodeURIComponent(q.url.split("?")[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
    r.setHeader("content-type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(f)] ?? "application/octet-stream");
    r.end(fs.readFileSync(f));
  }).listen(port, "127.0.0.1", () => res(srv2));
});

try {
  // 0 · the developer's first minute: no repo, no network, no key
  const [, demoOut] = sh("demo", "--dir", path.join(os.tmpdir(), "sr-demo-" + port));
  await terminal("terminal-primer-resultado-demo", "specreview demo", demoOut.split("\n").filter((l) => !l.startsWith("Ejemplo:")).join("\n").split("Qué viste:")[0]);

  // 1 · home: an empty chat
  await page.goto(`${base}/`);
  await page.waitForSelector("textarea, [role=textbox], input[type=text]");
  await settle();
  await shot("inicio-chat-vacio");

  // 2 · the agent answers with a review card (static app: simulated agent, labelled as such)
  const staticSrv = await serveStatic(path.join(WEB, "dist"), port + 1);
  const demoPage = await ctx.newPage();
  await demoPage.goto(`http://127.0.0.1:${port + 1}/`);
  await demoPage.waitForSelector("textarea");
  await demoPage.locator("textarea").first().fill("Revisá la feature 002-loyalty-points");
  await demoPage.locator("textarea").first().press("Enter");
  await demoPage.waitForSelector("text=bloqueante", { timeout: 20000 }).catch(() => {});
  await demoPage.waitForTimeout(2000);
  await demoPage.evaluate(() => { for (const e of document.querySelectorAll("*")) if (e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = 0; });   // the top of the answer
  await demoPage.waitForTimeout(400);
  n++; { const f = `${String(n).padStart(2, "0")}-agente-tarjeta-de-revision-demo.png`; await demoPage.screenshot({ path: path.join(OUT, f) }); console.log("shot", f); }
  await demoPage.close();
  staticSrv.close();

  // 3 · what waits for my decision
  await page.goto(`${base}/decisions`);
  await page.waitForSelector("main");
  await settle();
  await shot("tu-turno-decisiones-pendientes");

  // 4 · the review (executive summary + findings)
  await page.goto(`${base}/reviews/${FEATURE}`);
  await page.waitForSelector(".appr, main");
  await settle();
  await shot("revision-resumen-ejecutivo");
  await shot("revision-completa", { fullPage: true });

  // 5 · nobody can decide yet: the panel says how
  await page.waitForSelector(".appr");
  await page.locator(".appr").scrollIntoViewIfNeeded();
  await shot("aprobaciones-sin-miembros");

  // members (CLI), then sign in as a viewer and as the approver
  const viewer = sr("member", "add", "Vera", "--role", "viewer", "--path", repo).match(/sr_[\w-]+/)[0];
  const approver = sr("member", "add", "Ana", "--role", "approver", "--path", repo).match(/sr_[\w-]+/)[0];
  await page.reload();
  await page.waitForSelector(".appr-token");
  await page.fill(".appr-token input", viewer);
  await page.click(".appr-token button");
  await settle();
  await page.locator(".appr").scrollIntoViewIfNeeded();
  await shot("aprobaciones-viewer-solo-lectura");
  await ctx.close();
  [ctx, page] = await fresh();
  await page.goto(`${base}/reviews/${FEATURE}`);
  await page.waitForSelector(".appr-token");
  await page.fill(".appr-token input", approver);
  await page.click(".appr-token button");
  await page.waitForSelector(".appr-actions");
  await page.locator(".appr").scrollIntoViewIfNeeded();
  await shot("aprobaciones-aprobador-con-acciones");

  // 6 · approving a blocked feature: first refused, then override with a reason
  await page.click(".appr-actions .btn.primary");
  await page.click("[role=dialog] .btn.primary");
  await page.waitForSelector("[role=dialog] .form-error");
  await shot("aprobar-con-bloqueantes-rechazado");
  await page.keyboard.press("Escape");
  await page.click(".appr-actions .btn.primary");                     // a clean dialog, so the old error is not on screen
  await page.check("[role=dialog] input[type=checkbox]");
  await page.fill("[role=dialog] textarea", "Lo decidió compliance (ticket 123): sale detrás de un flag");
  await shot("aprobar-con-override-y-motivo");
  await page.click("[role=dialog] .btn.primary");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await page.waitForSelector(".appr-line:has-text('Aprobada por Ana')");
  await page.locator(".appr").scrollIntoViewIfNeeded();
  await shot("aprobacion-registrada");

  // 7 · the spec changes after the decision -> the approval is visibly old
  fs.appendFileSync(path.join(repo, "specs", FEATURE, "spec.md"), "\n- **FR-012**: The system MUST NOT process the same wire twice\n");
  await page.reload();
  await page.waitForSelector("text=La spec cambió desde esa decisión");
  await page.locator(".appr").scrollIntoViewIfNeeded();
  await shot("aprobacion-vieja-la-spec-cambio");

  // 8 · the audit history
  await page.goto(`${base}/decisions`);
  await page.waitForSelector("section[aria-labelledby=dec-hist-h] tbody tr");
  await page.locator("section[aria-labelledby=dec-hist-h]").scrollIntoViewIfNeeded();
  await shot("historial-de-decisiones");

  // 9 · someone edits the log by hand
  const log = path.join(repo, ".specreview", "approvals.jsonl");
  fs.writeFileSync(log, fs.readFileSync(log, "utf8").replace("compliance", "marketing"));
  await page.goto(`${base}/decisions`);
  await page.waitForSelector("section[aria-labelledby=dec-hist-h]");
  await settle();
  await page.locator("section[aria-labelledby=dec-hist-h]").scrollIntoViewIfNeeded();
  await shot("registro-adulterado-en-la-app");
  const [vcode, vout] = sh("approvals", "verify", "--path", repo);
  await terminal("terminal-registro-adulterado-detectado", "specreview approvals verify", vout + `\n(exit ${vcode})`);
  extraEnv = { SPECREVIEW_TOKEN: approver };
  const [, rout] = sh("approvals", "record", FEATURE, "--decision", "approved", "--override", "--reason", "x", "--path", repo);
  await terminal("terminal-no-se-construye-sobre-un-registro-roto", "specreview approvals record ...", rout);

  // 10 · a product manager's pull request, as the comment says it (the real `specreview diff` on a git copy)
  const gitRepo = fs.mkdtempSync(path.join(os.tmpdir(), "sr-walk-git-"));
  fs.cpSync(path.join(ROOT, "examples", "wire-transfers"), gitRepo, { recursive: true });
  const g = (...a) => execFileSync("git", ["-C", gitRepo, ...a], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-qm", "base"); g("checkout", "-q", "-b", "raise-limit");
  const sp = path.join(gitRepo, "specs", FEATURE, "spec.md");
  fs.writeFileSync(sp, fs.readFileSync(sp, "utf8").replace("above 10,000 USD", "above 15,000 USD"));
  const [, diffOut] = sh("diff", "main", "--path", gitRepo);
  await terminal("terminal-pr-que-mueve-un-umbral", "specreview diff main", diffOut);
} finally {
  await browser.close();
  srv.kill();
}
console.log("done:", n, "screenshots in", OUT);
