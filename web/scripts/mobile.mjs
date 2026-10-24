import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const scheme of ["light", "dark"]) {
  const c = await b.newContext({ viewport: { width: 375, height: 800 }, colorScheme: scheme });
  const p = await c.newPage();
  await p.goto("http://localhost:4173/#real-001-modern-podcast-site");
  await p.waitForSelector(".finding");
  const loc = await p.locator(".finding .loc").nth(15);
  await p.locator(".finding-main").nth(15).click();
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const s=document.querySelector(".source-body"); const l=document.querySelector("tr.sel"); const a=l.getBoundingClientRect(), bb=s.getBoundingClientRect(); return {scrollTop:s.scrollTop, vis:a.top>=bb.top&&a.bottom<=bb.bottom, line:l.dataset.line}; });
  console.log(scheme, JSON.stringify(r));
  await p.screenshot({ path: `screenshots/real-001-375-${scheme}-selected.png` });
  await c.close();
}
await b.close();
