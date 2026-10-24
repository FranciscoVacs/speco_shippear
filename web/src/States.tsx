import type { Issue } from "./data";
import { Link } from "react-router-dom";
import { CodeBlock, CopyButton } from "./CodeBlock";
import { useT } from "./i18n";

/** Skeleton shown while the review loads (instead of a bare "Cargando…"). */
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">Cargando la revisión…</span>
      <div className="sk-title sk" aria-hidden="true" />
      <div className="sk-row" aria-hidden="true">
        <div className="sk sk-counter" />
        <div className="sk sk-counter" />
        <div className="sk sk-counter" />
        <div className="sk sk-metric" />
        <div className="sk sk-metric" />
      </div>
      <div className="sk-split" aria-hidden="true">
        <div className="sk-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="sk sk-finding" />
          ))}
        </div>
        <div className="sk sk-source" />
      </div>
    </div>
  );
}

export function SamplesBanner() {
  const t = useT();
  return (
    <aside className="banner" aria-label={t("samples.aria")}>
      <div>
        <p className="banner-title">{t("samples.title")}</p>
        <p>{t("samples.body")}</p>
      </div>
      <div className="banner-cmd">
        <code>specreview &lt;repo&gt; --serve</code>
        <CopyButton text="specreview <repo> --serve" />
      </div>
    </aside>
  );
}

const NEXT_STEPS = `specreview <tu-repo> --serve                       # raíz del repo: busca specs/*/spec.md
specreview <tu-repo>/specs/003-mi-feature --serve  # o la carpeta de una feature
specreview examples/invitations --serve            # spec de ejemplo con defectos plantados`;

export function ServerProblem({ issue, onRetry }: { issue: Exclude<Issue, null>; onRetry: () => void }) {
  return (
    <div className="state help-state">
      {issue === "no-features" ? (
        <>
          <h2>No encontramos features para revisar</h2>
          <p>
            El servidor está activo, pero no encontró carpetas con <code>spec.md</code> en la ruta que le pasaste. Volvé a iniciarlo apuntando a la raíz de tu repo (con{" "}
            <code>specs/NNN-nombre/spec.md</code>) o a la carpeta de una feature:
          </p>
        </>
      ) : (
        <>
          <h2>El servidor respondió con un problema</h2>
          <p>
            La interfaz se conectó al servidor local, pero este no pudo listar las features. Probá detenerlo y volver a iniciarlo; si el problema sigue, corré el mismo comando sin{" "}
            <code>--serve</code> para ver el detalle en la terminal:
          </p>
        </>
      )}
      <CodeBlock code={NEXT_STEPS} caption="terminal" />
      <div className="state-actions">
        <button className="btn" onClick={onRetry}>
          Reintentar
        </button>
        <Link className="btn" to="/docs">
          Abrir la guía
        </Link>
      </div>
    </div>
  );
}

export function LoadFailure({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="state help-state" role="alert">
      <h2>No pudimos cargar esta revisión</h2>
      <p>
        Puede ser un problema pasajero o que el servidor se haya detenido. Reintentá, y si sigue fallando iniciá el servidor de nuevo con{" "}
        <code>specreview &lt;repo&gt; --serve</code>.
      </p>
      <div className="state-actions">
        <button className="btn" onClick={onRetry}>
          Reintentar
        </button>
        <Link className="btn" to="/docs">
          Abrir la guía
        </Link>
      </div>
      <details className="tech">
        <summary>Detalle técnico</summary>
        <pre>{detail}</pre>
      </details>
    </div>
  );
}
