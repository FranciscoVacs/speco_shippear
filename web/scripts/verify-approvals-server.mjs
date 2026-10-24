// Phase 5 check against the REAL local server (not the demo): token sign-in, roles, policy errors and the audit log on disk.
//   cd web && node scripts/verify-approvals-server.mjs      (needs web/dist: npm run build; Python package installed)
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const exe = process.env.CHROMIUM ?? fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
const py = process.env.PYTHON ?? "python3";
const fails = [];
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails.push(m); };
const sr = (...a) => execFileSync(py, ["-m", "specreview.cli", ...a], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PYTHONPATH: path.join(ROOT, "src") } });

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sr-approvals-"));
fs.cpSync(path.join(ROOT, "examples", "loyalty-points"), repo, { recursive: true });
const port = 18000 + Math.floor(Math.random() * 1000);
const srv = spawn(py, ["-m", "specreview.cli", repo, "--serve", "--port", String(port)], { cwd: ROOT, env: { ...process.env, PYTHONPATH: path.join(ROOT, "src") }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/features")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("sr-onboarded", "1"); localStorage.setItem("sr-panel", "0"); localStorage.setItem("sr-lang", "es"); localStorage.setItem("sr-open-dec-hist", "1"); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
};
const token = (out) => out.match(/sr_[\w-]+/)[0];
try {
  // 1. nobody configured yet
  let { ctx, page, errors } = await newPage();
  await page.goto(`${base}/reviews/002-loyalty-points`);
  await page.waitForSelector(".appr");
  await page.waitForSelector("text=No hay miembros configurados");
  check((await page.textContent(".appr")).includes("No hay miembros configurados"), "no members: the panel says how to create one, no buttons");
  check((await page.$$(".appr-actions")).length === 0, "no members: nobody can decide");
  await ctx.close();

  // 2. a viewer signs in: read only
  const viewer = token(sr("member", "add", "Vic", "--role", "viewer", "--path", repo));
  const approver = token(sr("member", "add", "Ana", "--role", "approver", "--path", repo));
  ({ ctx, page, errors } = await newPage());
  await page.goto(`${base}/reviews/002-loyalty-points`);
  await page.waitForSelector(".appr-token");
  await page.fill(".appr-token input", "sr_nope");
  await page.click(".appr-token button");
  await page.waitForSelector(".appr-token p:has-text('no es válido')");
  check(true, "a wrong token is rejected with a message");
  await page.fill(".appr-token input", viewer);
  await page.click(".appr-token button");
  await page.waitForSelector("text=Tu rol no permite decidir");
  check((await page.$$(".appr-actions")).length === 0, "viewer token: read only");
  await ctx.close();

  // 3. the approver signs in and decides
  ({ ctx, page, errors } = await newPage());
  await page.goto(`${base}/reviews/002-loyalty-points`);
  await page.waitForSelector(".appr-token");
  await page.fill(".appr-token input", approver);
  await page.click(".appr-token button");
  await page.waitForSelector(".appr-actions");
  check(true, "approver token: actions appear");
  await page.click(".appr-actions .btn.primary");
  await page.click("[role=dialog] .btn.primary");
  check((await page.textContent("[role=dialog] .form-error")).includes("bloqueantes"), "blocked feature: the UI asks for the override first");
  await page.check("[role=dialog] input[type=checkbox]");
  await page.fill("[role=dialog] textarea", "Sale detrás de un flag");
  await page.click("[role=dialog] .btn.primary");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await page.waitForSelector(".appr-line:has-text('Aprobada por Ana')");
  check((await page.textContent(".appr")).includes("override"), "approval with override is shown as such");
  const log = fs.readFileSync(path.join(repo, ".specreview", "approvals.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  check(log.length === 1 && log[0].by.name === "Ana" && log[0].by.via === "api" && log[0].override === true && log[0].prev === "genesis", "the real audit log has the entry (who, via, override, chain start)");
  check(sr("approvals", "verify", "--path", repo).includes("íntegro"), "`specreview approvals verify` says the chain is intact");

  // 4. the spec changes -> stale
  const spec = path.join(repo, "specs", "002-loyalty-points", "spec.md");
  fs.appendFileSync(spec, "\n- **FR-006**: The system MUST show the expiry date of points\n");
  await page.reload();
  await page.waitForSelector(".appr-line");
  await page.waitForSelector("text=La spec cambió desde esa decisión (spec.md)");
  check(true, "editing the spec after the approval marks it stale in the UI");
  await page.screenshot({ path: "screenshots/approval-server-stale-1280-light.png" });

  // 5. the token survived the reload; history on the decisions page comes from the real log
  await page.goto(`${base}/decisions`);
  await page.waitForSelector("section[aria-labelledby=dec-hist-h] tbody tr");
  check((await page.textContent("section[aria-labelledby=dec-hist-h] tbody")).includes("Ana"), "decisions page shows the real history");
  check(errors.length === 0, "no console errors " + errors.join("|"));
  await ctx.close();

  // 6. tampering is detected
  const logPath = path.join(repo, ".specreview", "approvals.jsonl");
  fs.writeFileSync(logPath, fs.readFileSync(logPath, "utf8").replace("Ana", "Eve"));
  {                                                      // the app says it too, not only the CLI
    const c2 = await newPage();
    await c2.page.goto(`${base}/decisions`);
    await c2.page.waitForSelector(".appr-chain-broken", { timeout: 10000 });
    check((await c2.page.textContent(".appr-chain-broken")).includes("a_000001"), "a log edited by hand shows a warning in the app that names the entry");
    await c2.page.goto(`${base}/reviews/002-loyalty-points`);
    await c2.page.waitForSelector(".appr .appr-chain-broken", { timeout: 10000 });
    check(true, "and the same warning sits on the approval panel of the feature");
    await c2.ctx.close();
  }
  let broke = false;
  try { sr("approvals", "verify", "--path", repo); } catch { broke = true; }
  check(broke, "editing the log by hand makes `approvals verify` fail");
} finally {
  await browser.close();
  srv.kill();
  fs.rmSync(repo, { recursive: true, force: true });
}
console.log(`\n${fails.length ? "FAILED: " + fails.length : "ALL PASSED"}`);
process.exit(fails.length ? 1 : 0);
