import { useState } from "react";
import { Columns2, ImageIcon, Loader2, Sparkles } from "lucide-react";
import type { Spec } from "../data";
import { DESIGN_PATTERN_POINTS } from "../designStyle";
import { generateDesign, useBello } from "../store";
import { PersonChip } from "../ui";

export function DesignViewer({ spec }: { spec: Spec }) {
  const history = spec.designHistory ?? [];
  const meta = spec.designMeta;
  const current = spec.design
    ? { version: `v${history.length + 1}`, src: spec.design, date: meta?.date ?? spec.updatedAt, by: meta?.by ?? spec.owner, note: meta?.note ?? "Versión vigente aprobada con la spec." }
    : null;
  const versions = current ? [...history, current] : [];
  const [picked, setPicked] = useState<number | null>(null);
  const active = picked !== null && picked < versions.length ? picked : versions.length - 1;
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);

  if (!current) {
    return (
      <figure className="bl-design">
        <div className="bl-design-empty">
          <ImageIcon size={22} aria-hidden="true" />
          <span>Esta spec todavía no tiene pantalla. Si tiene interfaz, generala con el patrón visual de Bello.</span>
        </div>
        <DesignGenerator spec={spec} hasDesign={false} onDone={() => setPicked(null)} />
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
              <button key={v.version} type="button" className={i === active ? "on" : ""} aria-pressed={i === active} onClick={() => setPicked(i)}>
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
      {!compare && (versions.length > 1 || meta) && (
        <div className="bl-design-meta">
          <PersonChip id={shown.by} size={18} showRole={false} />
          <span className="muted bl-sm">
            {new Date(shown.date + "T12:00:00").toLocaleDateString("es-AR")} · {shown.note}
          </span>
        </div>
      )}
      <DesignGenerator spec={spec} hasDesign onDone={() => setPicked(null)} />
    </figure>
  );
}

function DesignGenerator({ spec, hasDesign, onDone }: { spec: Spec; hasDesign: boolean; onDone: () => void }) {
  const { sync } = useBello();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = sync === "offline";

  async function run() {
    setBusy(true);
    setError(null);
    const err = await generateDesign(spec.id, note.trim());
    setBusy(false);
    if (err) return setError(err);
    setNote("");
    setOpen(false);
    onDone();
  }

  if (!open) {
    return (
      <div className="bl-gen-row">
        <button type="button" className="btn sm" onClick={() => setOpen(true)} disabled={offline} title={offline ? "Requiere la base de datos conectada" : undefined}>
          <Sparkles size={13} aria-hidden="true" />
          {hasDesign ? "Nueva versión con IA" : "Generar diseño con IA"}
        </button>
      </div>
    );
  }

  return (
    <div className="bl-gen">
      <div className="bl-gen-head">
        <Sparkles size={14} aria-hidden="true" />
        <strong>Generar diseño desde la spec</strong>
      </div>
      <p className="muted bl-sm">Se genera a partir del título y del requisito EARS, siguiendo el patrón visual de Bello:</p>
      <ul className="bl-gen-pattern" aria-label="Patrón visual">
        {DESIGN_PATTERN_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <label className="bl-sm" htmlFor={`gen-${spec.id}`}>
        Indicaciones opcionales
      </label>
      <textarea
        id={`gen-${spec.id}`}
        className="bl-input"
        rows={2}
        maxLength={400}
        placeholder="Ej.: mostrar el estado de error cuando se supera el límite"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
      />
      {error && (
        <p className="bl-gen-error" role="alert">
          {error}
        </p>
      )}
      <div className="bl-gen-actions">
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn sm primary bl-btn-brand" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={13} className="bl-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
          {busy ? "Generando… puede tardar hasta 1 minuto" : hasDesign ? `Generar v${(spec.designHistory?.length ?? 0) + 2}` : "Generar v1"}
        </button>
      </div>
    </div>
  );
}
