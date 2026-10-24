import { NavLink, Outlet } from "react-router-dom";
import { Fingerprint, LayoutDashboard, ListTree, Scale, Sparkles } from "lucide-react";
import { RULES } from "./data";
import { allSpecs, useBello, verifiedRatio } from "./store";
import "./bello.css";

const TABS = [
  { to: "/bello", end: true, label: "Panel", icon: LayoutDashboard },
  { to: "/bello/specs", label: "Árbol de specs", icon: ListTree },
  { to: "/bello/reglas", label: "Reglas y normativa", icon: Scale },
  { to: "/bello/trazabilidad", label: "Trazabilidad", icon: Fingerprint },
  { to: "/bello/asistente", label: "Asistente", icon: Sparkles },
];

export function BelloMark({ size = 40 }: { size?: number }) {
  return (
    <span className="bl-mark" style={{ width: size, height: size, fontSize: size * 0.56 }} aria-hidden="true">
      b
    </span>
  );
}

export default function BelloLayout() {
  const { requirements } = useBello();
  const specs = allSpecs(requirements);
  return (
    <div className="bl page">
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
      <nav className="bl-tabs" aria-label="Secciones de Bello">
        {TABS.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => "bl-tab" + (isActive ? " on" : "")}>
            <Icon size={15} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
