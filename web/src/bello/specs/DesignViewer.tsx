import { useState } from "react";
import { Columns2, ImageIcon } from "lucide-react";
import type { Spec } from "../data";
import { PersonChip } from "../ui";

export function DesignViewer({ spec }: { spec: Spec }) {
  const history = spec.designHistory ?? [];
  const current = spec.design ? { version: `v${history.length + 1}`, src: spec.design, date: spec.updatedAt, by: spec.owner, note: "Versión vigente aprobada con la spec." } : null;
  const versions = current ? [...history, current] : [];
  const [active, setActive] = useState(versions.length - 1);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);

  if (!current) {
    return (
      <figure className="bl-design">
        <div className="bl-design-empty">
          <ImageIcon size={22} aria-hidden="true" />
          <span>Esta spec no tiene pantalla: es backend o regulatoria.</span>
        </div>
      </figure>
    );
  }

  const shown = versions[active] ?? current;
  const canCompare = history.length > 0;
  const previous = history[history.length - 1];

  return (
    <figure className="bl-design">
      {compare && previous ? (
        <div className="bl-compare" style={{ "--split": `${split}%` } as React.CSSProperties}>
          <img src={current.src} alt={`Diseño ${current.version} de ${spec.title}`} />
          <img className="bl-compare-old" src={previous.src} alt={`Diseño ${previous.version} de ${spec.title}`} />
          <span className="bl-compare-tag l">{previous.version}</span>
          <span className="bl-compare-tag r">{current.version}</span>
          <span className="bl-compare-line" aria-hidden="true" />
          <label className="sr-only" htmlFor={`cmp-${spec.id}`}>
            Deslizar para comparar versiones
          </label>
          <input id={`cmp-${spec.id}`} type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="bl-compare-range" />
        </div>
      ) : (
        <img src={shown.src} alt={`Diseño frontend ${shown.version} de ${spec.title}`} />
      )}

      <figcaption className="bl-design-bar">
        {versions.length > 1 && !compare && (
          <div className="seg bl-seg-sm" role="group" aria-label="Versión del diseño">
            {versions.map((v, i) => (
              <button key={v.version} type="button" className={i === active ? "on" : ""} aria-pressed={i === active} onClick={() => setActive(i)}>
                {v.version}
              </button>
            ))}
          </div>
        )}
        {canCompare && (
          <button type="button" className={"bl-chip" + (compare ? " on" : "")} aria-pressed={compare} onClick={() => setCompare(!compare)}>
            <Columns2 size={13} aria-hidden="true" />
            Comparar
          </button>
        )}
        {!canCompare && <span className="muted bl-sm">Diseño frontend generado por la spec</span>}
      </figcaption>
      {!compare && versions.length > 1 && (
        <div className="bl-design-meta">
          <PersonChip id={shown.by} size={18} showRole={false} />
          <span className="muted bl-sm">
            {new Date(shown.date + "T12:00:00").toLocaleDateString("es-AR")} · {shown.note}
          </span>
        </div>
      )}
    </figure>
  );
}
