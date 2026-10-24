// /docs/developers: onboarding for people who code. From zero to a first finding in a minute, the MCP wired into the agent they already use,
// CI in one command, and worked examples of what they can achieve. All content lives in ../developers/content.json (code once, prose in es and en);
// tests/test_developer_docs.py checks it against docs/28 and docs/29 so the three cannot drift apart.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, ExternalLink } from "lucide-react";
import { CodeBlock, CopyButton } from "../CodeBlock";
import { cloudEnabled } from "../cloud/config";
import { useLang, useT } from "../i18n";
import { storage } from "../shell/storage";
import { Rich } from "../developers/Rich";
import content from "../developers/content.json";

const SECTION_IDS = ["demo", "mcp", "ci", "recetas", "prompts", "problemas"] as const;
const CLIENT_KEY = "sr-dev-client";
const C = content.code;

export default function DevelopersPage() {
  const t = useT();
  const { lang } = useLang();
  const loc = useLocation();
  const L = content[lang];
  const cap = L.captions;

  // Deep link (#dev-<section>): scroll to the section and move focus to it, like the product guide does.
  useEffect(() => {
    const id = loc.hash.replace(/^#/, "");
    if (!id.startsWith("dev-")) {
      window.scrollTo({ top: 0 });
      return;
    }
    const tm = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      if (!document.querySelector("[aria-modal=true]")) el.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(tm);
  }, [loc.hash, loc.key]);

  const [tocOpen, setTocOpen] = useState(false);
  const toc = (
    <ol className="toc-list">
      {SECTION_IDS.map((id) => (
        <li key={id}>
          <Link to={{ hash: "#dev-" + id }} onClick={() => setTocOpen(false)}>
            {L.sections[id]}
          </Link>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="page page-docs page-dev">
      <div className="guide" id="dev">
        <nav className="toc" aria-label={t("dev.toc")}>
          <div className="toc-desktop">
            <p className="toc-title">{t("dev.toc")}</p>
            {toc}
          </div>
          <details className="toc-mobile" open={tocOpen} onToggle={(e) => setTocOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t("dev.toc")}</summary>
            {toc}
          </details>
        </nav>
        <article className="guide-body">
          <header className="guide-head">
            <h1>{t("dev.title")}</h1>
            <p className="lead"><Rich text={L.lead} /></p>
            <ol className="dev-flow" aria-label={L.flowLabel}>
              {L.flow.map((label, i) => (
                <li key={label}>
                  <Link to={{ hash: "#dev-" + SECTION_IDS[i] }}>{label}</Link>
                </li>
              ))}
            </ol>
          </header>

          <Section id="demo" title={L.sections.demo}>
            <p><Rich text={L.demo.intro} /></p>
            <CodeBlock code={C.demoCmd} lang="bash" caption={cap.terminal} />
            <CodeBlock code={C.demoOutput} lang="texto" caption={cap.output} />
            <p><Rich text={L.demo.after} /></p>
            <h3>{L.demo.installH}</h3>
            <CodeBlock code={C.install} lang="bash" caption={cap.install} />
            <CodeBlock code={C.ownRepo} lang="bash" caption={cap.ownRepo} />
            <p><Rich text={L.demo.exit} /></p>
          </Section>

          <Section id="mcp" title={L.sections.mcp}>
            <p><Rich text={L.mcp.intro} /></p>
            <ClientTabs />
            <h3>{L.mcp.checkH}</h3>
            <CodeBlock code={C.mcpCheck} lang="bash" caption={cap.terminal} />
            <p><Rich text={L.mcp.checkAfter} /></p>
            <h3>{L.mcp.toolsH}</h3>
            <div className="table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th scope="col">{L.mcp.toolsCols[0]}</th>
                    <th scope="col">{L.mcp.toolsCols[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {C.tools.map((name, i) => (
                    <tr key={name}>
                      <th scope="row"><code>{name}</code></th>
                      <td>{L.mcp.tools[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{L.mcp.promptH}</h3>
            <p>{L.mcp.promptIntro}</p>
            <CodeBlock code={L.mcp.firstPrompt} lang="texto" caption={cap.prompt} />
            <p><Rich text={L.mcp.promptAfter} /></p>
            {cloudEnabled() && (
              <p className="callout" role="note">
                <Bot size={14} aria-hidden="true" /> <Rich text={L.mcp.cloud} />
              </p>
            )}
          </Section>

          <Section id="ci" title={L.sections.ci}>
            <p><Rich text={L.ci.intro} /></p>
            <CodeBlock code={C.ci} lang="bash" caption={cap.terminal} />
            <p><Rich text={L.ci.after} /></p>
          </Section>

          <Section id="recetas" title={L.sections.recetas}>
            <p><Rich text={L.recetas.intro} /></p>
            <div className="recipes">
              {C.recipes.map((r, i) => {
                const rl = L.recetas.items[i];
                const how = (r as { how?: string }).how;
                const out = (r as { output?: string }).output;
                const howText = (rl as { howText?: string }).howText;
                return (
                  <details key={r.id} className="recipe" id={"dev-receta-" + r.id}>
                    <summary>
                      <span className="recipe-n" aria-hidden="true">{i + 1}</span>
                      <span className="recipe-t">{rl.title}</span>
                      <span className="recipe-m"><span className="chip">{rl.uses}</span> <span className="chip">{rl.time}</span></span>
                    </summary>
                    <div className="recipe-body">
                      <p><strong>{L.recetas.problem}</strong> {rl.problem}</p>
                      <p><strong>{L.recetas.how}</strong> {howText}</p>
                      {how && <CodeBlock code={how} lang="bash" caption={cap.terminal} />}
                      {out && <CodeBlock code={out} lang="texto" caption={cap.output} />}
                      <p><strong>{L.recetas.gain}</strong> {rl.gain}</p>
                    </div>
                  </details>
                );
              })}
            </div>
          </Section>

          <Section id="prompts" title={L.sections.prompts}>
            <p>{L.prompts.intro}</p>
            <div className="table-wrap">
              <table className="doc-table prompts">
                <thead>
                  <tr>
                    <th scope="col">{L.prompts.cols[0]}</th>
                    <th scope="col">{L.prompts.cols[1]}</th>
                    <th scope="col"><span className="sr-only">{L.prompts.copy}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {L.prompts.items.map((p) => (
                    <tr key={p.goal}>
                      <th scope="row">{p.goal}</th>
                      <td>{p.prompt}</td>
                      <td><CopyButton text={p.prompt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="problemas" title={L.sections.problemas}>
            <div className="faq">
              {L.problemas.trouble.map((x) => (
                <details key={x.q} className="faq-item">
                  <summary>{x.q}</summary>
                  <p>{x.a}</p>
                </details>
              ))}
            </div>
            <p className="callout" role="note"><Rich text={L.problemas.limits} /></p>
            <p>
              {L.problemas.guides}{" "}
              {["28-developer-quickstart", "29-developer-recipes", "11-mcp-and-plugin"].map((f, i) => (
                <span key={f}>
                  {i > 0 && " · "}
                  <a href={`${C.repo}/blob/main/docs/${f}.md`} target="_blank" rel="noreferrer">
                    {L.problemas.guideLinks[i]} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </span>
              ))}
              .
            </p>
          </Section>
        </article>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="guide-section" id={"dev-" + id} tabIndex={-1} aria-labelledby={`h-dev-${id}`}>
      <h2 id={`h-dev-${id}`}>{title}</h2>
      {children}
    </section>
  );
}

/** One tab per MCP client; the choice is remembered in this browser. Arrow keys, Home and End move between tabs. */
function ClientTabs() {
  const { lang } = useLang();
  const L = content[lang].mcp;
  const clients = C.clients;
  const initial = storage.get(CLIENT_KEY);
  const [sel, setSel] = useState(clients.some((c) => c.id === initial) ? (initial as string) : clients[0].id);
  const bar = useRef<HTMLDivElement>(null);
  const pick = (id: string, focus = false) => {
    setSel(id);
    storage.set(CLIENT_KEY, id);
    if (focus) window.setTimeout(() => (bar.current?.querySelector(`[data-tab="${id}"]`) as HTMLElement | null)?.focus(), 0);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = clients.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    pick(clients[to].id, true);
  };
  const idx = Math.max(0, clients.findIndex((c) => c.id === sel));
  const cur = clients[idx];
  const cl = L.clients[idx] as { where: string; note?: string; extraLabel?: string };
  const extra = (cur as { extra?: { lang: string; code: string } }).extra;
  return (
    <div className="dev-clients">
      <div className="tabs" role="tablist" aria-label={L.clientsLabel} ref={bar}>
        {clients.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            id={"dev-tab-" + c.id}
            data-tab={c.id}
            className="tab"
            aria-selected={sel === c.id}
            aria-controls="dev-client-panel"
            tabIndex={sel === c.id ? 0 : -1}
            onClick={() => pick(c.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="dev-client-panel" aria-labelledby={"dev-tab-" + cur.id} tabIndex={0} className="dev-client-panel">
        <p className="muted small">{cl.where}</p>
        <CodeBlock code={cur.code} lang={cur.lang} caption={cur.lang} />
        {cl.note && <p className="muted small">{cl.note}</p>}
        {extra && (
          <>
            <p className="muted small">{cl.extraLabel}</p>
            <CodeBlock code={extra.code} lang={extra.lang} caption={extra.lang} />
          </>
        )}
      </div>
    </div>
  );
}
