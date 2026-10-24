import type { Report, Severity } from "./types";
import { SEV_ICON, SEV_LABEL_PLURAL, SEV_ORDER, pct } from "./util";
import { Tip } from "./RuleHelp";

interface Props {
  report: Report;
  activeSev: Set<Severity>;
  onSev: (s: Severity) => void;
}

const SEV_HELP: Record<Severity, string> = {
  blocker: "Bloqueantes: contradicción, pregunta sin responder o requisito que seguro nadie implementa. Resolver antes de implementar. Tocá para filtrar.",
  warning: "Advertencias: probable defecto (ambiguo, sin criterio de aceptación, posible scope colado). La mayoría merece arreglo. Tocá para filtrar.",
  suggestion: "Sugerencias: mejora de estilo o duda que no se pudo confirmar. Mirar si hay tiempo. Tocá para filtrar.",
};

const METRIC_HELP = [
  "Porcentaje de requisitos (FR-###) que el plan o alguna task parecen implementar. Se infiere comparando texto, salvo que tu repo cite los ids en las tasks.",
  "Porcentaje de requisitos cubiertos por algún criterio de aceptación. Un requisito sin criterio no se puede verificar.",
  "Requisitos escritos en un patrón EARS (ubicuo, evento, estado, no deseado u opcional) sobre el total. «System MUST …» cuenta como ubicuo.",
  "Tasks que no responden a ningún requisito de la spec: puede ser scope que se coló o un requisito que falta escribir.",
];

export function Summary({ report, activeSev, onSev }: Props) {
  const m = report.metrics;
  const ears = m?.ears_patterns ?? null;
  let earsTxt = "—";
  if (ears) {
    const total = Object.values(ears).reduce((a, b) => a + b, 0);
    if (total > 0) earsTxt = `${total - (ears.none ?? 0)}/${total}`;
  }
  const count = (s: Severity) => report.summary?.[s] ?? report.findings.filter((f) => f.severity === s).length;
  const chips: [string, string][] = [
    ["Cobertura requisito→plan/tasks", pct(m?.requirements_with_plan_or_tasks_pct)],
    ["Con criterio de aceptación", pct(m?.requirements_with_acceptance_pct)],
    ["EARS conformes", earsTxt],
    ["Tasks sin requisito", m?.tasks_without_requirement == null ? "—" : String(m.tasks_without_requirement)],
  ];
  return (
    <section className="summary" aria-label="Resumen">
      <div className="counters" role="group" aria-label="Filtrar por severidad">
        {SEV_ORDER.map((s) => (
          <Tip key={s} id={`tip-sev-${s}`} text={SEV_HELP[s]} className="tip-counter">
            <button
              className={`counter c-${s}`}
              aria-pressed={activeSev.has(s)}
              aria-describedby={`tip-sev-${s}`}
              onClick={() => onSev(s)}
            >
              <span className="num">{count(s)}</span>
              <span className="lbl">
                <span aria-hidden="true">{SEV_ICON[s]}</span> {SEV_LABEL_PLURAL[s].toLowerCase()}
              </span>
            </button>
          </Tip>
        ))}
      </div>
      <ul className="metrics" aria-label="Métricas">
        {chips.map(([k, v], i) => (
          <li key={k} className="metric">
            <Tip id={`tip-m-${i}`} text={METRIC_HELP[i]} className="tip-metric">
              <span className="metric-in" tabIndex={0} role="group" aria-label={`${k}: ${v}`} aria-describedby={`tip-m-${i}`}>
                <span className="mv">{v}</span>
                <span className="mk">{k}</span>
              </span>
            </Tip>
          </li>
        ))}
      </ul>
    </section>
  );
}
