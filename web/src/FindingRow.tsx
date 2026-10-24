import { useState } from "react";
import { Link } from "react-router-dom";
import type { Finding, Rule } from "./types";
import { SEV_ICON, SEV_LABEL } from "./util";
import { RuleBody, guideHref } from "./RuleHelp";

interface Props {
  f: Finding;
  index: number;
  expanded: boolean;
  selected: boolean;
  /** catalog entry for f.rule, if the catalog is available and has it */
  rule: Rule | null;
  /** whether the assistant can take questions (shows "Preguntar al asistente") */
  canAsk: boolean;
  onToggle: (i: number) => void;
  onLocate: (i: number) => void;
  onAsk: (i: number) => void;
}

export function FindingRow({ f, index, expanded, selected, rule, canAsk, onToggle, onLocate, onAsk }: Props) {
  const detailId = `fd-${index}`;
  const helpId = `fh-${index}`;
  const [help, setHelp] = useState(false);

  // The rule code is part of the row's toggle button (no nested interactive elements): clicking it opens the rule help as well.
  const onMainClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".rule-code")) {
      if (!expanded) onToggle(index);
      setHelp(true);
      return;
    }
    onToggle(index);
  };

  return (
    <li className={`finding sev-${f.severity}` + (selected ? " selected" : "")} data-finding={index}>
      <div className="finding-head">
        <button className="finding-main" aria-expanded={expanded} aria-controls={detailId} onClick={onMainClick}>
          <span className={`badge b-${f.severity}`}>
            <span aria-hidden="true">{SEV_ICON[f.severity]}</span> {SEV_LABEL[f.severity]}
          </span>
          <span className="finding-text">
            <span className="finding-meta">
              <span className="rule">
                <code className="rule-code" title="Tocá el código para ver qué significa esta regla">
                  {f.rule}
                </code>{" "}
                {f.rule_name}
              </span>
              {f.ids.map((id) => (
                <span key={id} className="chip id">
                  {id}
                </span>
              ))}
            </span>
            <span className="finding-msg">{f.message}</span>
          </span>
          <span className="chev" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        {f.location && (
          <button
            className="loc"
            onClick={() => onLocate(index)}
            title="Ver en el código fuente"
            aria-label={`Ver ${f.location.file} línea ${f.location.line} en el visor`}
          >
            {f.location.file}:{f.location.line}
          </button>
        )}
      </div>
      {expanded && (
        <div className="finding-detail" id={detailId}>
          {f.fix && (
            <div>
              <h4>Cómo arreglarlo</h4>
              <p>{f.fix}</p>
            </div>
          )}
          {f.evidence.length > 0 && (
            <div>
              <h4>Evidencia</h4>
              <ul>
                {f.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {!f.fix && f.evidence.length === 0 && <p className="muted">Sin detalle adicional.</p>}
          <div className="finding-actions">
            <button className="btn sm" aria-expanded={help} aria-controls={helpId} onClick={() => setHelp((h) => !h)}>
              <span aria-hidden="true">{help ? "▾" : "▸"}</span> ¿Qué significa esta regla?
            </button>
            {canAsk && (
              <button className="btn sm" onClick={() => onAsk(index)}>
                Preguntar al asistente
              </button>
            )}
          </div>
          {help && (
            <div className="rule-help" id={helpId}>
              <p className="rule-help-title">
                <code>{f.rule}</code> {rule?.name ?? f.rule_name}
              </p>
              {rule ? (
                <RuleBody rule={rule} />
              ) : (
                <p className="muted">
                  La descripción de esta regla no está disponible en esta vista. En la terminal: <code>specreview --explain {f.rule}</code>.
                </p>
              )}
              <p className="rule-help-foot">
                <Link to={guideHref(f.rule)}>Ver en el glosario de reglas</Link>
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
