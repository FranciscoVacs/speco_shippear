import { Outlet, useLocation } from "react-router-dom";
import { RULES } from "./data";
import { allSpecs, useBello, verifiedRatio } from "./store";
import "./bello.css";

export function BelloMark({ size = 40 }: { size?: number }) {
  return (
    <span className="bl-mark" style={{ width: size, height: size, fontSize: size * 0.56 }} aria-hidden="true">
      b
    </span>
  );
}

const HEADERS: Record<string, { title: string; lead: string }> = {
  "/specs": { title: "Árbol de specs", lead: "Requerimientos, specs y su estado de verificación. Elegí una spec para ver diseño, reglas, impacto y firmas." },
  "/reglas": { title: "Reglas y normativa", lead: "Normativa externa, certificaciones, reglas nativas del código y políticas propias de Bello que refuerzan cada spec." },
  "/trazabilidad": { title: "Trazabilidad", lead: "Quién hizo qué y cuándo, encadenado con hash para que ningún evento pueda alterarse sin dejar rastro." },
};

function DashboardHero() {
  const { requirements } = useBello();
  const specs = allSpecs(requirements);
  return (
    <header className="bl-hero" style={{ backgroundImage: "url(/bello/cover.png)" }}>
      <div className="bl-hero-in">
        <div className="bl-hero-id">
          <BelloMark size={44} />
          <div>
            <div className="bl-hero-kicker">Workspace a medida · Speco Enterprise</div>
            <h1>Bello · Banca digital</h1>
          </div>
        </div>
        <ul className="bl-hero-stats" aria-label="Resumen del workspace">
          <li>
            <strong>{requirements.length}</strong> requerimientos
          </li>
          <li>
            <strong>{specs.length}</strong> specs
          </li>
          <li>
            <strong>{RULES.length}</strong> reglas cargadas
          </li>
          <li>
            <strong>{verifiedRatio(specs)}%</strong> verificado
          </li>
        </ul>
        <span className="bl-demo">Datos de demostración</span>
      </div>
    </header>
  );
}

export default function BelloLayout() {
  const { pathname } = useLocation();
  if (pathname === "/") {
    return (
      <div className="bl bl-home-wrap">
        <Outlet />
      </div>
    );
  }
  const header = HEADERS[pathname];
  return (
    <div className="bl page">
      {pathname === "/dashboard" ? (
        <DashboardHero />
      ) : header ? (
        <header className="bl-pagehead">
          <h1>{header.title}</h1>
          <p className="muted">{header.lead}</p>
        </header>
      ) : null}
      <Outlet />
    </div>
  );
}
