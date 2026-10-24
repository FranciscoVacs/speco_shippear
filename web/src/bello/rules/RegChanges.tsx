import { Link } from "react-router-dom";
import { ArrowRight, BellRing, CheckCheck, Radar } from "lucide-react";
import { rule as ruleById } from "../data";
import { analyzeRegChange, specsAffectedBy, useBelo } from "../store";
import { KindIcon, StatusDot } from "../ui";

export function RegChanges() {
  const { regChanges, requirements } = useBelo();
  const pending = regChanges.filter((c) => c.state === "nuevo").length;

  return (
    <section id="cambios" className="card bl-card bl-regwatch" aria-labelledby="regwatch-h">
      <div className="bl-card-h">
        <h2 id="regwatch-h">
          <Radar size={17} aria-hidden="true" /> Vigilancia normativa
        </h2>
        {pending > 0 ? (
          <span className="bl-badge s-risk">
            <BellRing size={12} aria-hidden="true" /> {pending} cambios sin analizar
          </span>
        ) : (
          <span className="bl-badge s-verified">
            <CheckCheck size={12} aria-hidden="true" /> Al día
          </span>
        )}
      </div>
      <p className="muted bl-sm bl-regwatch-lead">
        Speco monitorea la normativa cargada para Belo. Cuando cambia un texto, muestra qué specs refuerza esa regla y las marca para re-verificar.
      </p>
      <ul className="bl-changes">
        {regChanges.map((c) => {
          const r = ruleById(c.ruleId);
          const affected = specsAffectedBy(c, requirements);
          return (
            <li key={c.id} className={`bl-change st-${c.state}`}>
              <div className="bl-change-h">
                {r && <KindIcon kind={r.kind} size={16} />}
                <div className="bl-change-ttl">
                  <strong>{c.title}</strong>
                  <span className="muted bl-sm">
                    {r?.title} · {c.id} · publicado el {new Date(c.publishedAt + "T12:00:00").toLocaleDateString("es-AR")}
                  </span>
                </div>
                <span className={`bl-badge ${c.state === "nuevo" ? "s-risk" : "s-verified"}`}>{c.state === "nuevo" ? "Nuevo" : "Analizado"}</span>
              </div>
              <p className="bl-sm">{c.summary}</p>
              <div className="bl-diff" aria-label="Cambio en el texto">
                <span className="bl-diff-old">
                  <span className="sr-only">Antes: </span>
                  {c.before}
                </span>
                <ArrowRight size={14} aria-hidden="true" />
                <span className="bl-diff-new">
                  <span className="sr-only">Ahora: </span>
                  {c.after}
                </span>
              </div>
              <div className="bl-change-f">
                <div className="bl-rule-specs">
                  <span className="muted bl-sm">Alcanza {affected.length} specs:</span>
                  {affected.map((s) => (
                    <Link key={s.id} to={`/specs?spec=${encodeURIComponent(s.id)}`} className="bl-spec-pill">
                      <StatusDot status={s.status} size={8} />
                      {s.title}
                    </Link>
                  ))}
                </div>
                {c.state === "nuevo" && (
                  <button type="button" className="btn sm primary bl-btn-brand" onClick={() => analyzeRegChange(c.id)}>
                    <Radar size={14} aria-hidden="true" /> Analizar impacto
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
