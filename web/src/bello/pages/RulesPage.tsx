import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, CircleDashed, FolderGit2 } from "lucide-react";
import { KIND_HINT, KIND_LABEL, RULES, type RuleKind } from "../data";
import { allSpecs, useBello } from "../store";
import { linkedSpecs, ruleCompliance } from "../metrics";
import { sha256 } from "../hash";
import { HashChip, KindIcon, PersonChip, Ring, StatusDot, statusFromPct } from "../ui";
import { RegChanges } from "../rules/RegChanges";

const KINDS: RuleKind[] = ["certification", "regulation", "bello", "native"];

function useRuleHashes() {
  const [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(RULES.map(async (r) => [r.id, await sha256(JSON.stringify(r))] as const)).then((pairs) => alive && setHashes(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, []);
  return hashes;
}

export default function RulesPage() {
  const { requirements } = useBello();
  const specs = allSpecs(requirements);
  const [params] = useSearchParams();
  const focus = params.get("rule");
  const [kind, setKind] = useState<RuleKind | "all">(() => RULES.find((r) => r.id === focus)?.kind ?? "all");
  const hashes = useRuleHashes();
  const list = RULES.filter((r) => kind === "all" || r.kind === kind);

  useEffect(() => {
    if (focus) document.getElementById(`rule-${focus}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  return (
    <div className="bl-stack-y">
      <RegChanges />
      <section className="bl-kind-grid" aria-label="Tipos de reglas">
        {KINDS.map((k) => {
          const rs = RULES.filter((r) => r.kind === k);
          const pct = Math.round(rs.reduce((n, r) => n + ruleCompliance(r, specs), 0) / rs.length);
          return (
            <button key={k} type="button" className={`bl-kind-card k-${k}` + (kind === k ? " on" : "")} aria-pressed={kind === k} onClick={() => setKind(kind === k ? "all" : k)}>
              <KindIcon kind={k} size={18} />
              <span className="bl-kind-card-t">{KIND_LABEL[k]}</span>
              <span className="bl-kind-card-n">
                {rs.length} reglas · <strong>{pct}%</strong>
              </span>
              <span className="bl-kind-card-h">{KIND_HINT[k]}</span>
            </button>
          );
        })}
      </section>

      <div className="bl-rules">
        {list.map((r) => {
          const pct = ruleCompliance(r, specs);
          const linked = linkedSpecs(r, specs);
          return (
            <article key={r.id} id={`rule-${r.id}`} className={`card bl-rule k-${r.kind}` + (focus === r.id ? " focus" : "")}>
              <header className="bl-rule-h">
                <KindIcon kind={r.kind} size={18} />
                <div className="bl-rule-ttl">
                  <h2>{r.title}</h2>
                  <span className="muted bl-sm">
                    {r.authority} · {r.version}
                  </span>
                </div>
                <Ring value={pct} status={statusFromPct(pct)} size={48} stroke={5} />
              </header>
              <p className="bl-rule-sum">{r.summary}</p>
              {r.source && (
                <p className="bl-rule-src">
                  <FolderGit2 size={14} aria-hidden="true" />
                  Extraída de <code>{r.source.repo}</code> · <code>{r.source.path}</code> · {r.source.occurrences} ocurrencias en el código
                </p>
              )}
              <ul className="bl-controls">
                {r.controls.map((c) => (
                  <li key={c.id} className={c.ok ? "ok" : "gap"}>
                    {c.ok ? <CircleCheck size={15} aria-label="Cubierto" /> : <CircleDashed size={15} aria-label="Sin cubrir" />}
                    <code>{c.id}</code>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
              {linked.length > 0 && (
                <div className="bl-rule-specs">
                  <span className="muted bl-sm">Refuerza {linked.length} specs:</span>
                  {linked.map((s) => (
                    <Link key={s.id} to={`/specs?spec=${encodeURIComponent(s.id)}`} className="bl-spec-pill">
                      <StatusDot status={s.status} size={8} />
                      {s.title}
                    </Link>
                  ))}
                </div>
              )}
              <footer className="bl-rule-f">
                <PersonChip id={r.loadedBy} size={20} />
                <span className="muted bl-sm">cargada el {new Date(r.loadedAt + "T12:00:00").toLocaleDateString("es-AR")}</span>
                {hashes[r.id] && <HashChip hash={hashes[r.id]} label="Versión" />}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
