// /rules and /rules/:ruleId: the rule glossary (extracted from the old guide). A deep link opens its rule.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Info } from "lucide-react";
import { useData } from "../DataContext";
import { RuleBody } from "../RuleHelp";
import { useLang, useT } from "../i18n";
import type { Rule } from "../types";
import { SEV_ICON, SEV_LABEL } from "../util";
import { PageHeader } from "./PageHeader";

const RULE_TOKEN = /^[A-Z]{3}\d{3}$/;

const sevOf = (r: Rule) => {
  // Only a plain one-word severity gets a badge; conditional ones ("Bloqueante si …") are explained in the body.
  const s = r.severity.trim().toLowerCase();
  if (s === "bloqueante.") return "blocker" as const;
  if (s === "advertencia.") return "warning" as const;
  if (s === "sugerencia.") return "suggestion" as const;
  return null;
};

export default function RulesPage() {
  const t = useT();
  const { lang } = useLang();
  const { loader, loading } = useData();
  const params = useParams();
  const wanted = params.ruleId ? params.ruleId.toUpperCase() : null;
  const rules = loader?.rules ?? null;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const known = !!wanted && !!rules?.rules.some((r) => r.id === wanted);

  // Deep link: open the rule, scroll to it and move focus to its header (keyboard users land there).
  useEffect(() => {
    if (!wanted || !RULE_TOKEN.test(wanted) || !known) return;
    setQ("");
    setOpen((s) => (s.has(wanted) ? s : new Set(s).add(wanted)));
    const tm = window.setTimeout(() => {
      const el = document.getElementById("rule-" + wanted);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      // never steal focus from a dialog / the command palette that opened in the meantime
      if (!document.querySelector("[aria-modal=true]")) el.querySelector<HTMLElement>(".rule-toggle")?.focus({ preventScroll: true });
      setFlash(wanted);
    }, 40);
    return () => window.clearTimeout(tm);
  }, [wanted, known]);

  useEffect(() => {
    if (!flash) return;
    const tm = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(tm);
  }, [flash]);

  const groups = useMemo(() => {
    if (!rules) return [];
    const needle = q.trim().toLowerCase();
    const match = (r: Rule) => !needle || [r.id, r.name, r.what, r.why, r.fix, r.severity, r.caveat].join(" ").toLowerCase().includes(needle);
    const keys = [...Object.keys(rules.questions)];
    for (const r of rules.rules) if (!keys.includes(r.question)) keys.push(r.question);
    return keys
      .map((k) => ({ key: k, question: rules.questions[k] ?? "Otras reglas", items: rules.rules.filter((r) => r.question === k && match(r)) }))
      .filter((g) => g.items.length);
  }, [rules, q]);

  const total = rules?.rules.length ?? 0;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const allIds = groups.flatMap((g) => g.items.map((r) => r.id));
  const allOpen = allIds.length > 0 && allIds.every((id) => open.has(id));

  return (
    <div className="page page-rules">
      <PageHeader title={t("rules.title")} description={t("rules.desc")} />
      {lang === "en" && (
        <p className="content-note" role="note">
          <Info size={14} aria-hidden="true" /> {t("content.note")}
        </p>
      )}
      {!rules ? (
        loading ? (
          <p className="state-inline" role="status">{t("common.loading")}</p>
        ) : (
          <p className="state-inline" role="note">{t("rules.unavailable")}</p>
        )
      ) : (
        <div className="glossary">
          {wanted && !known && (
            <p className="state-inline" role="status">
              {t("rules.unknown", { id: wanted })}
            </p>
          )}
          <div className="glossary-tools">
            <input
              type="search"
              className="search"
              placeholder={t("rules.search")}
              aria-label={t("rules.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="toolbar-foot">
              <span className="muted" aria-live="polite">
                {t("rules.count", { n: shown, total })}
              </span>
              {q && (
                <button className="link" onClick={() => setQ("")}>
                  {t("rules.clear")}
                </button>
              )}
              {allIds.length > 0 && (
                <button className="link" onClick={() => setOpen((s) => (allOpen ? new Set([...s].filter((i) => !allIds.includes(i))) : new Set([...s, ...allIds])))}>
                  {allOpen ? t("rules.collapseAll") : t("rules.expandAll")}
                </button>
              )}
            </div>
          </div>
          {groups.length === 0 && (
            <p className="state-inline" role="status">
              {t("rules.nomatch", { q })}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.key} className="rule-group">
              <h2 className="rule-q">{g.question}</h2>
              <ul className="rule-list">
                {g.items.map((r) => {
                  const isOpen = open.has(r.id);
                  const sev = sevOf(r);
                  return (
                    <li key={r.id} id={"rule-" + r.id} className={"rule-card" + (flash === r.id ? " flash" : "")}>
                      <h3 className="rule-h">
                        <button
                          className="rule-toggle"
                          aria-expanded={isOpen}
                          aria-controls={"rule-panel-" + r.id}
                          onClick={() =>
                            setOpen((s) => {
                              const n = new Set(s);
                              if (n.has(r.id)) n.delete(r.id);
                              else n.add(r.id);
                              return n;
                            })
                          }
                        >
                          <code className="rule-id">{r.id}</code>
                          <span className="rule-name">{r.name}</span>
                          {sev && (
                            <span className={"badge b-" + sev}>
                              <span aria-hidden="true">{SEV_ICON[sev]}</span> {SEV_LABEL[sev]}
                            </span>
                          )}
                          <span className="chev" aria-hidden="true">
                            {isOpen ? "▾" : "▸"}
                          </span>
                        </button>
                      </h3>
                      {isOpen && (
                        <div id={"rule-panel-" + r.id} className="rule-panel">
                          <RuleBody rule={r} />
                          <p className="muted rule-perma">
                            {t("rules.permalink")} <Link to={`/rules/${r.id}`}>/rules/{r.id}</Link>
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
