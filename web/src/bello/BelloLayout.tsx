import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Database, RotateCcw } from "lucide-react";
import { RULES } from "./data";
import { allSpecs, resetDemo, useBello, verifiedRatio } from "./store";
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

const SYNC_LABEL = { loading: "Conectando…", live: "Neon · en vivo", saving: "Guardando…", offline: "Sin conexión · cambios locales" } as const;

export function SyncBadge() {
  const { sync } = useBello();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!window.confirm("¿Restaurar los datos de ejemplo de Bello? Se borran las specs, requerimientos y eventos agregados.")) return;
    setBusy(true);
    await resetDemo();
    setBusy(false);
  };
  return (
    <div className="bl-sync">
      <span className={`bl-sync-pill s-${sync}`} role="status">
        <Database size={12} aria-hidden="true" />
        {SYNC_LABEL[sync]}
      </span>
      {sync !== "offline" && (
        <button type="button" className="bl-link bl-sm" onClick={reset} disabled={busy}>
          <RotateCcw size={12} aria-hidden="true" /> Restaurar demo
        </button>
      )}
    </div>
  );
}

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
        <SyncBadge />
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
          <div className="bl-pagehead-row">
            <h1>{header.title}</h1>
            <SyncBadge />
          </div>
          <p className="muted">{header.lead}</p>
        </header>
      ) : null}
      <Outlet />
    </div>
  );
}
