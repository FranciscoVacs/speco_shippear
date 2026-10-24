// /docs/product: how someone in product or management fits Speco into a workflow where several agents build and merge in parallel.
// All content lives in ../product-guide/content.json (code once, prose in es and en); tests/test_product_guide_docs.py keeps it in step with docs/30.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { CodeBlock } from "../CodeBlock";
import { useLang, useT } from "../i18n";
import { Rich } from "../developers/Rich";
import content from "../product-guide/content.json";

const SECTION_IDS = ["ciclo", "setup", "dia", "recetas", "cuello", "limites"] as const;
const C = content.code;
const SNIPPETS: Record<string, string> = { setup: C.setupCmds, slack: C.slackCmd, report: C.reportCmds };

export default function ProductGuidePage() {
  const t = useT();
  const { lang } = useLang();
  const loc = useLocation();
  const L = content[lang];
  const cap = L.captions;

  // Deep link (#pm-<section>): scroll to the section and move focus to it, like the other guides do.
  useEffect(() => {
    const id = loc.hash.replace(/^#/, "");
    if (!id.startsWith("pm-")) {
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
          <Link to={{ hash: "#pm-" + id }} onClick={() => setTocOpen(false)}>{L.sections[id]}</Link>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="page page-docs page-dev page-pm">
      <div className="guide" id="pm">
        <nav className="toc" aria-label={t("pm.toc")}>
          <div className="toc-desktop">
            <p className="toc-title">{t("pm.toc")}</p>
            {toc}
          </div>
          <details className="toc-mobile" open={tocOpen} onToggle={(e) => setTocOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t("pm.toc")}</summary>
            {toc}
          </details>
        </nav>
        <article className="guide-body">
          <header className="guide-head">
            <h1>{t("pm.title")}</h1>
            <p className="lead"><Rich text={L.lead} /></p>
            <ol className="dev-flow" aria-label={L.flowLabel}>
              {L.flow.map((label, i) => (
                <li key={label}><Link to={{ hash: "#pm-" + SECTION_IDS[i] }}>{label}</Link></li>
              ))}
            </ol>
          </header>

          <Section id="ciclo" title={L.sections.ciclo}>
            <p><Rich text={L.ciclo.intro} /></p>
            <Table cols={L.ciclo.cols} rows={L.ciclo.rows} />
            <p><Rich text={L.ciclo.after} /></p>
          </Section>

          <Section id="setup" title={L.sections.setup}>
            <p>{L.setup.intro}</p>
            {L.setup.levels.map((lv) => (
              <div key={lv.title} className="pm-level">
                <h3>{lv.title}</h3>
                <p><Rich text={lv.intro} /></p>
                {lv.steps.length > 0 && (
                  <ol className="pm-steps" aria-label={L.setup.stepsLabel}>
                    {lv.steps.map((s) => <li key={s}><Rich text={s} /></li>)}
                  </ol>
                )}
                {lv.code && <CodeBlock code={SNIPPETS[lv.code]} lang="bash" caption={cap.terminal} />}
                {lv.code === "setup" && <CodeBlock code={C.decisionExample} lang="markdown" caption={cap.spec} />}
                {lv.tip && <p className="callout" role="note"><Rich text={lv.tip} /></p>}
              </div>
            ))}
          </Section>

          <Section id="dia" title={L.sections.dia}>
            <p>{L.dia.intro}</p>
            <Table cols={L.dia.cols} rows={L.dia.rows} />
            <p><Rich text={L.dia.after} /></p>
          </Section>

          <Section id="recetas" title={L.sections.recetas}>
            <p>{L.recetas.intro}</p>
            <div className="recipes">
              {L.recetas.items.map((r, i) => (
                <details key={r.title} className="recipe" id={"pm-receta-" + (i + 1)}>
                  <summary>
                    <span className="recipe-n" aria-hidden="true">{i + 1}</span>
                    <span className="recipe-t">{r.title}</span>
                    <span className="recipe-m"><span className="chip">{r.time}</span></span>
                  </summary>
                  <div className="recipe-body">
                    <p><strong>{L.recetas.when}</strong> <Rich text={r.when} /></p>
                    <p><strong>{L.recetas.do}</strong> <Rich text={r.do} /></p>
                    {r.prompt && (
                      <div className="pm-prompt">
                        <CodeBlock code={r.prompt} lang="texto" caption={L.recetas.promptLabel} />
                      </div>
                    )}
                    {"code" in r && r.code && <CodeBlock code={SNIPPETS[r.code as string]} lang="bash" caption={cap.terminal} />}
                    <p><strong>{L.recetas.gain}</strong> <Rich text={r.gain} /></p>
                  </div>
                </details>
              ))}
            </div>
          </Section>

          <Section id="cuello" title={L.sections.cuello}>
            <p>{L.cuello.intro}</p>
            <Table cols={L.cuello.cols} rows={L.cuello.rows} />
          </Section>

          <Section id="limites" title={L.sections.limites}>
            <p>{L.limites.intro}</p>
            <Table cols={L.limites.cols} rows={L.limites.rows} />
            <p>
              {L.guides}{" "}
              {L.guideFiles.map((f, i) => (
                <span key={f}>
                  {i > 0 && " · "}
                  <a href={`${C.repo}/blob/main/docs/${f}.md`} target="_blank" rel="noreferrer">
                    {L.guideLinks[i]} <ExternalLink size={12} aria-hidden="true" />
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
    <section className="guide-section" id={"pm-" + id} tabIndex={-1} aria-labelledby={`h-pm-${id}`}>
      <h2 id={`h-pm-${id}`}>{title}</h2>
      {children}
    </section>
  );
}

/** First column is the row header; every cell takes the inline markup of Rich. */
function Table({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table className="doc-table">
        <thead>
          <tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0] + r[1]}>
              {r.map((cell, i) => (i === 0 ? <th key={i} scope="row"><Rich text={cell} /></th> : <td key={i}><Rich text={cell} /></td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
