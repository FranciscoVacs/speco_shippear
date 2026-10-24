import { useState } from "react";
import { CheckCircle2, Circle, FileCode2, FileText, ListChecks, Map as MapIcon, ShieldAlert, ShieldCheck } from "lucide-react";
import { buildPlan, buildSpecDoc, buildTasks } from "../artifacts";
import type { Requirement, Spec } from "../data";

type Tab = "spec" | "plan" | "tasks";

const TABS: { id: Tab; label: string; file: string; icon: typeof FileText }[] = [
  { id: "spec", label: "Spec", file: "spec.md", icon: FileText },
  { id: "plan", label: "Plan", file: "plan.md", icon: MapIcon },
  { id: "tasks", label: "Tareas", file: "tasks.md", icon: ListChecks },
];

export function SpecArtifacts({ spec, requirement }: { spec: Spec; requirement?: Requirement }) {
  const [tab, setTab] = useState<Tab>("spec");
  const tasks = buildTasks(spec);
  const all = tasks.flatMap((p) => p.tasks);
  const done = all.filter((t) => t.done).length;

  return (
    <section className="bl-sec bl-art" aria-label="Artefactos de la spec">
      <div className="bl-tabs bl-art-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`art-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`art-panel-${t.id}`}
            className={`bl-tab${tab === t.id ? " on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} aria-hidden="true" />
            {t.label}
            {t.id === "tasks" && <span className="bl-art-count">{`${done}/${all.length}`}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`art-panel-${tab}`} aria-labelledby={`art-tab-${tab}`} className="bl-art-panel">
        <p className="bl-art-file">
          <FileCode2 size={12} aria-hidden="true" />
          <code>{`specs/${spec.id.toLowerCase().replace("/", "-")}/${TABS.find((t) => t.id === tab)?.file}`}</code>
        </p>
        {tab === "spec" && <SpecPanel spec={spec} requirement={requirement} />}
        {tab === "plan" && <PlanPanel spec={spec} />}
        {tab === "tasks" && (
          <div className="bl-art-tasks">
            <div className="bl-art-progress" aria-hidden="true">
              <span style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
            </div>
            {tasks.map((p) => (
              <div key={p.title}>
                <h4>{p.title}</h4>
                <ul>
                  {p.tasks.map((t) => (
                    <li key={t.id} className={t.done ? "is-done" : ""}>
                      {t.done ? (
                        <CheckCircle2 size={14} className="bl-ok-text" aria-label="Hecha" />
                      ) : (
                        <Circle size={14} className="muted" aria-label="Pendiente" />
                      )}
                      <div>
                        <span>
                          <code className="bl-id">{t.id}</code> {t.text}
                        </span>
                        {t.path && <code className="bl-art-path">{t.path}</code>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SpecPanel({ spec, requirement }: { spec: Spec; requirement?: Requirement }) {
  const doc = buildSpecDoc(spec, requirement);
  return (
    <>
      <h4>Historia de usuario</h4>
      <p className="bl-sm">{doc.story}</p>
      <h4>Requisito (EARS)</h4>
      <p className="bl-ears">{doc.ears}</p>
      <h4>Criterios de aceptación</h4>
      <ol className="bl-art-list">
        {doc.criteria.map((c) => (
          <li key={c.id}>
            {c.text} <span className="muted">· {c.source}</span>
          </li>
        ))}
      </ol>
      <h4>Resultados medibles</h4>
      <ul className="bl-art-list">
        {doc.outcomes.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
    </>
  );
}

function PlanPanel({ spec }: { spec: Spec }) {
  const plan = buildPlan(spec);
  return (
    <>
      <h4>Resumen</h4>
      <p className="bl-sm">{plan.summary}</p>
      <h4>Contexto técnico</h4>
      <dl className="bl-art-dl">
        {plan.context.map((c) => (
          <div key={c.label}>
            <dt>{c.label}</dt>
            <dd>{c.value}</dd>
          </div>
        ))}
      </dl>
      <h4>Chequeo de normas</h4>
      <ul className="bl-art-gates">
        {plan.gates.map((g) => (
          <li key={g.id}>
            {g.ok ? <ShieldCheck size={14} className="bl-ok-text" aria-hidden="true" /> : <ShieldAlert size={14} className="bl-warn-text" aria-hidden="true" />}
            <span>{g.title}</span>
            <span className="muted bl-sm">{g.note}</span>
          </li>
        ))}
      </ul>
      <h4>Estructura</h4>
      <pre className="bl-art-tree">{plan.structure.join("\n")}</pre>
      {plan.risks.length > 0 && (
        <>
          <h4>Riesgos</h4>
          <ul className="bl-art-list">
            {plan.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
