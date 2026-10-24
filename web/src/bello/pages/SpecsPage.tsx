import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListTree, Network, Search } from "lucide-react";
import { STATUS_LABEL, STATUS_ORDER, type Status } from "../data";
import { allSpecs, useBello } from "../store";
import { statusCounts } from "../metrics";
import { StatusDot } from "../ui";
import { SpecTree } from "../specs/SpecTree";
import { ImpactMap } from "../specs/ImpactMap";
import { SpecDetail } from "../specs/SpecDetail";

export default function SpecsPage() {
  const { requirements } = useBello();
  const [params, setParams] = useSearchParams();
  const selected = params.get("spec");
  const [view, setView] = useState<"tree" | "map">("tree");
  const [filter, setFilter] = useState<Set<Status>>(() => new Set(STATUS_ORDER));
  const [q, setQ] = useState("");
  const specs = allSpecs(requirements);
  const counts = statusCounts(specs);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return requirements;
    return requirements
      .map((r) => (r.title.toLowerCase().includes(term) || r.id.toLowerCase().includes(term) ? r : { ...r, specs: r.specs.filter((s) => `${s.id} ${s.title} ${s.ears}`.toLowerCase().includes(term)) }))
      .filter((r) => r.specs.length);
  }, [requirements, q]);

  const selectedSpec = specs.find((s) => s.id === selected);
  const select = (id: string | null) => {
    const n = new URLSearchParams(params);
    if (id) n.set("spec", id);
    else n.delete("spec");
    setParams(n, { replace: true });
  };
  const toggleStatus = (s: Status) => {
    const n = new Set(filter);
    if (n.has(s) && n.size > 1) n.delete(s);
    else n.add(s);
    setFilter(n);
  };

  return (
    <div className="bl-stack-y">
      <div className="bl-toolbar">
        <label className="bl-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Buscar specs</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar requerimiento, spec o texto…" />
        </label>
        <div className="bl-chips" role="group" aria-label="Filtrar por estado">
          {counts.map((c) => (
            <button key={c.status} type="button" className={"bl-chip" + (filter.has(c.status) ? " on" : "")} aria-pressed={filter.has(c.status)} onClick={() => toggleStatus(c.status)}>
              <StatusDot status={c.status} size={8} />
              {STATUS_LABEL[c.status]}
              <span className="bl-chip-n">{c.value}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Vista">
          <button type="button" className={view === "tree" ? "on" : ""} aria-pressed={view === "tree"} onClick={() => setView("tree")}>
            <ListTree size={14} aria-hidden="true" /> Árbol
          </button>
          <button type="button" className={view === "map" ? "on" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>
            <Network size={14} aria-hidden="true" /> Mapa de impacto
          </button>
        </div>
      </div>

      <div className={"bl-specs-layout" + (selectedSpec ? " has-detail" : "")}>
        <div className="card bl-card bl-specs-main">
          {view === "tree" ? (
            <SpecTree requirements={visible} filter={filter} selected={selected} onSelect={select} initialOpen={params.get("req")} />
          ) : (
            <ImpactMap requirements={visible} filter={filter} selected={selected} onSelect={select} />
          )}
        </div>
        {selectedSpec && <SpecDetail key={selectedSpec.id} spec={selectedSpec} onClose={() => select(null)} />}
      </div>
    </div>
  );
}
