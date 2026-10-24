import { Link } from "react-router-dom";
import { ArrowRight, BellRing, Fingerprint, ListTree } from "lucide-react";
import { BelloAssistant } from "../assistant/BelloAssistant";
import { allSpecs, useBelo, verifiedRatio } from "../store";
import { Ring, statusFromPct } from "../ui";

function HomeCards() {
  const { requirements, regChanges, events } = useBelo();
  const specs = allSpecs(requirements);
  const pct = verifiedRatio(specs);
  const risk = specs.filter((s) => s.status === "failing").length;
  const pending = regChanges.filter((c) => c.state === "nuevo");

  return (
    <ul className="bl-home-cards" aria-label="Estado de Belo">
      <li>
        <Link to="/dashboard" className="bl-home-card">
          <Ring value={pct} status={statusFromPct(pct)} size={44} stroke={5} />
          <span>
            <strong>{pct}% verificado</strong>
            <span className="muted bl-sm">
              {specs.length} specs · {risk} en riesgo
            </span>
          </span>
          <ArrowRight size={14} className="bl-home-card-go" aria-hidden="true" />
        </Link>
      </li>
      <li>
        <Link to="/reglas#cambios" className={"bl-home-card" + (pending.length ? " alert" : "")}>
          <span className="bl-home-ic">
            <BellRing size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>{pending.length ? `${pending.length} cambios normativos` : "Normativa al día"}</strong>
            <span className="muted bl-sm">{pending.length ? "Sin analizar el impacto" : "Sin cambios pendientes"}</span>
          </span>
          <ArrowRight size={14} className="bl-home-card-go" aria-hidden="true" />
        </Link>
      </li>
      <li>
        <Link to="/specs" className="bl-home-card">
          <span className="bl-home-ic">
            <ListTree size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>{requirements.length} requerimientos</strong>
            <span className="muted bl-sm">Ver el árbol de specs</span>
          </span>
          <ArrowRight size={14} className="bl-home-card-go" aria-hidden="true" />
        </Link>
      </li>
      <li>
        <Link to="/trazabilidad" className="bl-home-card">
          <span className="bl-home-ic">
            <Fingerprint size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>{events.length} eventos firmados</strong>
            <span className="muted bl-sm">Cadena de hash íntegra</span>
          </span>
          <ArrowRight size={14} className="bl-home-card-go" aria-hidden="true" />
        </Link>
      </li>
    </ul>
  );
}

export default function AssistantPage() {
  return <BelloAssistant home={<HomeCards />} />;
}
