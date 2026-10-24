import { useState } from "react";
import { MODULES, type Requirement, type Status } from "../data";
import { requirementStatus } from "../store";

const COL = [16, 290, 640];
const NODE_W = [240, 300, 170];
const ROW = 46;
const NODE_H = 34;

export function ImpactMap({
  requirements,
  filter,
  selected,
  onSelect,
}: {
  requirements: Requirement[];
  filter: Set<Status>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const reqs = requirements.map((r) => ({ ...r, specs: r.specs.filter((s) => filter.has(s.status)) })).filter((r) => r.specs.length);
  const specs = reqs.flatMap((r) => r.specs.map((s) => ({ ...s, req: r.id })));
  const usedMods = MODULES.filter((m) => specs.some((s) => s.impacts.some((i) => i.module === m.id)));
  const height = Math.max(specs.length, usedMods.length, 1) * ROW + 24;
  const specY = new Map(specs.map((s, i) => [s.id, 12 + i * ROW]));
  const modGap = usedMods.length > 1 ? (height - 24 - NODE_H) / (usedMods.length - 1) : 0;
  const modY = new Map(usedMods.map((m, i) => [m.id, 12 + i * modGap]));
  const reqY = new Map(
    reqs.map((r) => {
      const ys = r.specs.map((s) => specY.get(s.id)!);
      return [r.id, (Math.min(...ys) + Math.max(...ys)) / 2];
    }),
  );

  const focus = hover ?? selected;
  const focusSpec = focus ? specs.find((s) => s.id === focus) : undefined;
  const active = (specId: string, reqId: string, modId?: string) => {
    if (!focus) return true;
    if (focus === specId || focus === reqId) return true;
    if (modId && focus === modId) return true;
    if (focus.startsWith("mod:")) return specs.find((s) => s.id === specId)?.impacts.some((i) => `mod:${i.module}` === focus) ?? false;
    return false;
  };
  const modActive = (modId: string) =>
    !focus || focus === `mod:${modId}` || specs.some((s) => (s.id === focus || s.req === focus) && s.impacts.some((i) => i.module === modId));

  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const W = COL[2] + NODE_W[2] + 16;

  return (
    <div className="bl-map-wrap">
      <div className="bl-map-cols" aria-hidden="true">
        <span style={{ left: COL[0] }}>Requerimiento</span>
        <span style={{ left: COL[1] }}>Spec</span>
        <span style={{ left: COL[2] }}>Módulo impactado</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="bl-map" role="img" aria-label="Mapa de impacto de specs sobre módulos de Bello">
        {specs.map((s) => {
          const ry = reqY.get(s.req)! + NODE_H / 2;
          const sy = specY.get(s.id)! + NODE_H / 2;
          return (
            <g key={s.id}>
              <path d={curve(COL[0] + NODE_W[0], ry, COL[1], sy)} className={"bl-edge" + (active(s.id, s.req) ? " on" : "")} stroke={`var(--st-${s.status})`} />
              {s.impacts.map((im) => (
                <path
                  key={im.module}
                  d={curve(COL[1] + NODE_W[1], sy, COL[2], modY.get(im.module)! + NODE_H / 2)}
                  className={`bl-edge lv-${im.level}` + (active(s.id, s.req, `mod:${im.module}`) ? " on" : "")}
                  stroke={`var(--st-${s.status})`}
                />
              ))}
            </g>
          );
        })}
        {reqs.map((r) => {
          const st = requirementStatus(r);
          const y = reqY.get(r.id)!;
          const on = !focus || focus === r.id || focusSpec?.req === r.id || (focus.startsWith("mod:") && r.specs.some((s) => s.impacts.some((i) => `mod:${i.module}` === focus)));
          return (
            <g key={r.id} className={"bl-node" + (on ? " on" : "")} transform={`translate(${COL[0]},${y})`} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <rect width={NODE_W[0]} height={NODE_H} rx="9" className="bl-node-bg" />
              <rect width="5" height={NODE_H} rx="2" fill={`var(--st-${st})`} />
              <text x="14" y="21" className="bl-node-t">
                <tspan className="bl-node-id">{r.id}</tspan> {r.title.length > 22 ? r.title.slice(0, 21) + "…" : r.title}
              </text>
            </g>
          );
        })}
        {specs.map((s) => {
          const y = specY.get(s.id)!;
          return (
            <g
              key={s.id}
              className={"bl-node bl-node-click" + (active(s.id, s.req) ? " on" : "") + (selected === s.id ? " sel" : "")}
              transform={`translate(${COL[1]},${y})`}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(s.id)}
              role="button"
              tabIndex={0}
              aria-label={`${s.id} ${s.title}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
            >
              <rect width={NODE_W[1]} height={NODE_H} rx="9" className="bl-node-bg" />
              <circle cx="16" cy={NODE_H / 2} r="6" fill={`var(--st-${s.status})`} />
              <text x="30" y="21" className="bl-node-t">
                {s.title.length > 34 ? s.title.slice(0, 33) + "…" : s.title}
              </text>
            </g>
          );
        })}
        {usedMods.map((m) => {
          const y = modY.get(m.id)!;
          return (
            <g key={m.id} className={"bl-node" + (modActive(m.id) ? " on" : "")} transform={`translate(${COL[2]},${y})`} onMouseEnter={() => setHover(`mod:${m.id}`)} onMouseLeave={() => setHover(null)}>
              <rect width={NODE_W[2]} height={NODE_H} rx="9" className={`bl-node-bg mod-${m.kind}`} />
              <text x="12" y="21" className="bl-node-t bl-node-mono">
                {m.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="bl-map-legend">
        <span>
          <i className="lv-alto" /> Impacto alto
        </span>
        <span>
          <i className="lv-medio" /> medio
        </span>
        <span>
          <i className="lv-bajo" /> bajo
        </span>
        <span className="muted">Pasá el mouse para ver el camino · clic en una spec para ver el detalle</span>
      </div>
    </div>
  );
}
