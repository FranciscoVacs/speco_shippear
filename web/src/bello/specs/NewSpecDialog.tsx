import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, Loader2, Sparkles, X } from "lucide-react";
import { MODULES, PEOPLE, rule as ruleById, moduleById } from "../data";
import { analyzeSpec } from "../analysis";
import { addSpec, useBelo } from "../store";
import { KindIcon, StatusDot } from "../ui";

const NEW_REQ = "__new__";
const REPOS = [...new Set(MODULES.map((m) => m.repo))];

const EXAMPLE = {
  title: "Límite nocturno de transferencias",
  ears: "When a client transfers between 00:00 and 06:00, the system MUST cap the amount at 150.000 ARS per operation.",
  modules: ["payments-api", "app-mobile"],
};

export function NewSpecDialog({ open, onClose, onCreated, defaultRequirement }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; defaultRequirement?: string }) {
  const { requirements, me, error } = useBelo();
  const ref = useRef<HTMLDialogElement>(null);
  const [reqId, setReqId] = useState(defaultRequirement ?? requirements[0]?.id ?? NEW_REQ);
  const [newReqTitle, setNewReqTitle] = useState("");
  const [title, setTitle] = useState("");
  const [ears, setEars] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [owner, setOwner] = useState("cruiz");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const draft = { requirementId: reqId, title, ears, modules, owner };
  const analysis = useMemo(() => analyzeSpec(draft, requirements), [reqId, title, ears, modules, owner, requirements]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasInput = title.trim().length > 3 || ears.trim().length > 10;
  const canSubmit = title.trim().length >= 4 && ears.trim().length >= 10 && (reqId !== NEW_REQ || newReqTitle.trim().length >= 4) && !saving;

  const toggle = (id: string) => setModules((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    const id = await addSpec({ ...draft, newRequirementTitle: reqId === NEW_REQ ? newReqTitle : undefined });
    setSaving(false);
    if (id) {
      setTitle("");
      setEars("");
      setModules([]);
      setNewReqTitle("");
      onCreated(id);
    }
  };

  const riskStatus = analysis.risk >= 70 ? "failing" : analysis.risk >= 45 ? "risk" : analysis.risk >= 20 ? "progress" : "verified";

  return (
    <dialog ref={ref} className="bl-dialog" onClose={onClose} aria-labelledby="new-spec-title">
      <form onSubmit={submit} className="bl-dialog-in">
        <header className="bl-dialog-head">
          <div>
            <h2 id="new-spec-title">Nueva spec</h2>
            <p className="muted bl-sm">El agente analiza en vivo reglas, módulos y specs relacionadas antes de registrarla.</p>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Cerrar">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="bl-dialog-body">
          <div className="bl-form">
            <label className="bl-field">
              <span>Requerimiento</span>
              <select value={reqId} onChange={(e) => setReqId(e.target.value)}>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} · {r.title}
                  </option>
                ))}
                <option value={NEW_REQ}>+ Nuevo requerimiento…</option>
              </select>
            </label>
            {reqId === NEW_REQ && (
              <label className="bl-field">
                <span>Título del nuevo requerimiento</span>
                <input value={newReqTitle} onChange={(e) => setNewReqTitle(e.target.value)} placeholder="Ej. Transferencias programadas" required />
              </label>
            )}
            <label className="bl-field">
              <span>Título de la spec</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Límite nocturno de transferencias" required maxLength={160} />
            </label>
            <label className="bl-field">
              <span>Requisito (EARS)</span>
              <textarea value={ears} onChange={(e) => setEars(e.target.value)} rows={4} placeholder="When <evento>, the system MUST <respuesta>." required maxLength={1000} />
              <small className={analysis.earsOk || !ears ? "muted" : "bl-warn-text"}>{analysis.earsHint}</small>
            </label>
            <fieldset className="bl-field">
              <legend>Módulos que modifica</legend>
              <div className="bl-mod-groups">
                {REPOS.map((repo) => (
                  <div key={repo} className="bl-mod-group">
                    <span className="bl-sm muted">
                      <GitBranch size={12} aria-hidden="true" /> {repo}
                    </span>
                    <div className="bl-chips">
                      {MODULES.filter((m) => m.repo === repo).map((m) => (
                        <button key={m.id} type="button" className={"bl-chip" + (modules.includes(m.id) ? " on" : "")} aria-pressed={modules.includes(m.id)} onClick={() => toggle(m.id)}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            <label className="bl-field">
              <span>Responsable</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                {PEOPLE.filter((p) => p.id !== "agent").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </select>
            </label>
            {!hasInput && (
              <button type="button" className="bl-link bl-example" onClick={() => (setTitle(EXAMPLE.title), setEars(EXAMPLE.ears), setModules(EXAMPLE.modules))}>
                <Sparkles size={13} aria-hidden="true" /> Cargar un ejemplo
              </button>
            )}
          </div>

          <aside className="bl-analysis" aria-live="polite" aria-label="Análisis de impacto">
            <div className="bl-analysis-head">
              <div className={`bl-risk st-${riskStatus}`}>
                <strong>{hasInput ? analysis.risk : "–"}</strong>
                <span>riesgo</span>
              </div>
              <div>
                <h3>Análisis de impacto</h3>
                <p className="bl-sm muted">{hasInput ? analysis.summary : "Escribí la spec para ver qué implica en el sistema."}</p>
              </div>
            </div>

            {hasInput && (
              <>
                <section className="bl-sec">
                  <h3>Reglas que la van a reforzar ({analysis.rules.length})</h3>
                  <ul className="bl-mini-list">
                    {analysis.rules.map((id) => {
                      const r = ruleById(id);
                      return r ? (
                        <li key={id}>
                          <KindIcon kind={r.kind} size={14} />
                          <span className="bl-id">{id}</span>
                          <span className="bl-ellipsis">{r.title}</span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </section>

                <section className="bl-sec">
                  <h3>Módulos impactados ({analysis.impacts.length})</h3>
                  {analysis.impacts.length ? (
                    <ul className="bl-mini-list">
                      {analysis.impacts.map((i) => (
                        <li key={i.module}>
                          <span className={`bl-level lv-${i.level}`}>{i.level}</span>
                          <span>{moduleById(i.module)?.name ?? i.module}</span>
                          {!modules.includes(i.module) && <span className="bl-sm muted">inferido</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="bl-sm muted">Elegí módulos o describí el flujo para inferirlos.</p>
                  )}
                </section>

                {analysis.related.length > 0 && (
                  <section className="bl-sec">
                    <h3>Specs relacionadas ({analysis.related.length})</h3>
                    <ul className="bl-mini-list bl-related">
                      {analysis.related.map((r) => (
                        <li key={r.id} className={r.relation === "contradicción" ? "is-conflict" : ""}>
                          <StatusDot status={r.status} size={8} />
                          <div>
                            <div>
                              <span className="bl-id">{r.id}</span> {r.title}
                            </div>
                            <div className="bl-sm muted">
                              <strong className={r.relation === "contradicción" ? "bl-warn-text" : ""}>{r.relation}</strong> · {r.note}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {analysis.toReverify.length > 0 && (
                  <p className="bl-callout warn">
                    <AlertTriangle size={14} aria-hidden="true" /> Al registrarla, {analysis.toReverify.length} spec verificada{analysis.toReverify.length > 1 ? "s" : ""} pasa{analysis.toReverify.length > 1 ? "n" : ""} a <strong>en riesgo</strong> para re-verificar.
                  </p>
                )}
                {analysis.gaps.length > 0 && (
                  <section className="bl-sec">
                    <h3>Controles sin cubrir ({analysis.gaps.length})</h3>
                    <ul className="bl-mini-list">
                      {analysis.gaps.map((g) => (
                        <li key={g.ruleId + g.control}>
                          <AlertTriangle size={13} className="bl-warn-text" aria-hidden="true" />
                          <span className="bl-id">{g.ruleId}</span>
                          <span>{g.text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <p className="bl-sm muted">
                  <CheckCircle2 size={13} aria-hidden="true" /> {analysis.testsSuggested} tests sugeridos · registrada por <strong>{PEOPLE.find((p) => p.id === me)?.name}</strong> con hash encadenado
                </p>
              </>
            )}
          </aside>
        </div>

        <footer className="bl-dialog-foot">
          {error && <span className="bl-warn-text bl-sm">{error}</span>}
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary bl-btn-brand" disabled={!canSubmit}>
            {saving ? <Loader2 size={15} className="bl-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            Crear y registrar
          </button>
        </footer>
      </form>
    </dialog>
  );
}
