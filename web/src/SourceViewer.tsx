import { useEffect, useMemo, useRef } from "react";
import type { Finding, Severity, Sources } from "./types";
import { SEV_ICON, SEV_LABEL, SEV_ORDER } from "./util";

export const SOURCE_FILES = ["spec.md", "plan.md", "tasks.md", "data-model.md", "values.md"];

interface Props {
  sources: Sources;
  findings: Finding[];
  file: string;
  onFile: (f: string) => void;
  selected: number | null; // index into findings
  onSelect: (i: number) => void;
  panelRef: React.RefObject<HTMLElement>;
  focusTick: number;
}

export function SourceViewer({ sources, findings, file, onFile, selected, onSelect, panelRef, focusTick }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const text = sources[file];
  const lines = useMemo(() => (text == null ? [] : text.replace(/\n$/, "").split("\n")), [text]);

  // line -> findings in this file
  const byLine = useMemo(() => {
    const m = new Map<number, number[]>();
    findings.forEach((f, i) => {
      if (f.location && f.location.file === file) {
        const a = m.get(f.location.line) ?? [];
        a.push(i);
        m.set(f.location.line, a);
      }
    });
    return m;
  }, [findings, file]);

  const sel = selected != null ? findings[selected] : null;
  const selLine = sel?.location && sel.location.file === file ? sel.location.line : null;

  useEffect(() => {
    if (selLine == null) return;
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-line="${selLine}"]`);
    if (!body || !el) return;
    const top = el.offsetTop - body.clientHeight / 2 + el.clientHeight / 2;
    body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [selLine, file, focusTick, lines.length]);

  const available = SOURCE_FILES.filter((f) => sources[f] != null);
  const extra = Object.keys(sources).filter((f) => !SOURCE_FILES.includes(f));
  const tabs = [...SOURCE_FILES, ...extra];

  return (
    <section className="source" ref={panelRef} aria-label="Visor de código fuente">
      <div className="tabs" role="tablist" aria-label="Archivos fuente">
        {tabs.map((f) => {
          const exists = sources[f] != null;
          const n = findings.filter((x) => x.location?.file === f).length;
          return (
            <button
              key={f}
              role="tab"
              aria-selected={f === file}
              className="tab"
              disabled={!exists}
              title={exists ? undefined : "Este archivo no existe en la feature"}
              onClick={() => onFile(f)}
            >
              {f}
              {n > 0 && <span className="tab-count">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="source-body" ref={bodyRef} tabIndex={0} role="region" aria-label={`Contenido de ${file}`}>
        {text == null ? (
          <p className="muted pad">
            {available.length === 0 ? "No hay fuentes disponibles para esta feature." : `${file} no existe en esta feature.`}
          </p>
        ) : (
          <table className="code">
            <tbody>
              {lines.map((ln, idx) => {
                const n = idx + 1;
                const idxs = byLine.get(n);
                let worst: Severity | null = null;
                if (idxs) worst = SEV_ORDER.find((s) => idxs.some((i) => findings[i].severity === s)) ?? null;
                const isSel = selLine === n;
                const target = idxs ? (idxs.includes(selected ?? -1) ? (selected as number) : idxs[0]) : null;
                return (
                  <tr key={n} data-line={n} className={(isSel ? "sel " : "") + (worst ? "has-" + worst : "")}>
                    <td className="gutter">
                      {worst && target != null && (
                        <button
                          className={"marker m-" + worst}
                          onClick={() => onSelect(target)}
                          aria-label={`${SEV_LABEL[worst]} en línea ${n}${idxs!.length > 1 ? ` (${idxs!.length} hallazgos)` : ""}: ${findings[target].message}`}
                          title={`${SEV_LABEL[worst]}: ${findings[target].message}`}
                        >
                          <span aria-hidden="true">{SEV_ICON[worst]}</span>
                        </button>
                      )}
                    </td>
                    <td className="ln">{n}</td>
                    <td className="src">{ln || " "}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
