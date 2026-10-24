import { RULES } from "../data";
import { BelloAssistant } from "../assistant/BelloAssistant";
import { KindIcon } from "../ui";

export default function AssistantPage() {
  return (
    <div className="bl-asst-page">
      <section className="card bl-card bl-asst-main">
        <BelloAssistant />
      </section>
      <aside className="card bl-card bl-asst-side" aria-label="Reglas activas">
        <h2>Reglas activas en cada respuesta</h2>
        <p className="muted bl-sm">Todo requerimiento que generes se verifica contra estas reglas antes de llegar al árbol.</p>
        <ul className="bl-rule-list">
          {RULES.map((r) => (
            <li key={r.id}>
              <span>
                <KindIcon kind={r.kind} size={14} />
                <span>{r.title}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
