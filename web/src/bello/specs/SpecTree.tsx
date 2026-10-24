import { useState } from "react";
import { ChevronRight, ImageIcon, Box } from "lucide-react";
import { moduleById, type Requirement, type Status } from "../data";
import { requirementStatus, verifiedRatio } from "../store";
import { statusCounts } from "../metrics";
import { Ring, StackBar, StatusDot } from "../ui";

export function SpecTree({
  requirements,
  filter,
  selected,
  onSelect,
  initialOpen,
}: {
  requirements: Requirement[];
  filter: Set<Status>;
  selected: string | null;
  onSelect: (id: string) => void;
  initialOpen?: string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initialOpen ? [initialOpen] : requirements.map((r) => r.id)));
  const [openSpec, setOpenSpec] = useState<Set<string>>(() => new Set(selected ? [selected] : []));
  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  return (
    <ul className="bl-tree" role="tree" aria-label="Requerimientos y specs">
      {requirements.map((r) => {
        const specs = r.specs.filter((s) => filter.has(s.status));
        if (!specs.length) return null;
        const st = requirementStatus(r);
        const isOpen = open.has(r.id);
        return (
          <li key={r.id} role="treeitem" aria-expanded={isOpen} aria-selected={false} className={`bl-tree-req s-${st}${r.isNew ? " is-new" : ""}`}>
            <button type="button" className="bl-tree-row bl-tree-row-req" onClick={() => setOpen(toggle(open, r.id))}>
              <ChevronRight size={16} className={"bl-chev" + (isOpen ? " open" : "")} aria-hidden="true" />
              <Ring value={verifiedRatio(r.specs)} status={st} size={38} stroke={4} />
              <span className="bl-tree-main">
                <span className="bl-tree-title">
                  <code className="bl-id">{r.id}</code> {r.title}
                  {r.isNew && <span className="bl-new">Nuevo</span>}
                </span>
                <span className="bl-tree-sub">{r.goal}</span>
              </span>
              <span className="bl-tree-meta">
                <StackBar data={statusCounts(r.specs)} />
                <span className="muted bl-sm">{r.specs.length} specs</span>
              </span>
            </button>
            {isOpen && (
              <ul role="group" className="bl-tree-children">
                {specs.map((s) => {
                  const sOpen = openSpec.has(s.id);
                  return (
                    <li key={s.id} role="treeitem" aria-expanded={sOpen} aria-selected={selected === s.id} className={`bl-tree-spec s-${s.status}`}>
                      <div className={"bl-tree-row bl-tree-row-spec" + (selected === s.id ? " on" : "")}>
                        <button type="button" className="icon-btn ghost bl-tree-tog" aria-label={sOpen ? "Ocultar impactos" : "Ver impactos"} onClick={() => setOpenSpec(toggle(openSpec, s.id))}>
                          <ChevronRight size={14} className={"bl-chev" + (sOpen ? " open" : "")} aria-hidden="true" />
                        </button>
                        <button type="button" className="bl-tree-sel" onClick={() => onSelect(s.id)}>
                          <StatusDot status={s.status} size={12} />
                          <span className="bl-tree-main">
                            <span className="bl-tree-title">{s.title}</span>
                            <span className="bl-tree-sub">
                              <code>{s.id.split("/")[1]}</code> · {s.rules.length} reglas · {s.impacts.length} impactos
                              {s.tests.total > 0 && ` · ${s.tests.passed}/${s.tests.total} tests`}
                            </span>
                          </span>
                          {s.design && (
                            <span className="bl-tree-thumb">
                              <img src={s.design} alt="" loading="lazy" />
                              <ImageIcon size={11} aria-hidden="true" />
                            </span>
                          )}
                        </button>
                      </div>
                      {sOpen && (
                        <ul role="group" className="bl-tree-children bl-tree-impacts">
                          {s.impacts.map((im) => (
                            <li key={im.module} role="treeitem" aria-selected={false} className={`bl-tree-impact lv-${im.level}`}>
                              <Box size={13} aria-hidden="true" />
                              <code>{moduleById(im.module)?.name}</code>
                              <span className={`bl-level lv-${im.level}`}>Impacto {im.level}</span>
                              <span className="muted bl-sm">{im.note}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
