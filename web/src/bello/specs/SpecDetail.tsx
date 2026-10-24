import { Link } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Box, FileCode2, X } from "lucide-react";
import { DesignViewer } from "./DesignViewer";
import { SpecArtifacts } from "./SpecArtifacts";
import { moduleById, rule as ruleById, type Spec } from "../data";
import { setSpecStatus, useBelo } from "../store";
import { useChain } from "../hash";
import { HashChip, KindIcon, PersonChip, Ring, StatusBadge } from "../ui";

export function SpecDetail({ spec, onClose }: { spec: Spec; onClose: () => void }) {
  const { events, requirements } = useBelo();
  const chain = useChain(events);
  const trail = (chain ?? []).filter((e) => e.target === spec.id || spec.id.startsWith(e.target + "/"));
  const testPct = spec.tests.total ? Math.round((spec.tests.passed / spec.tests.total) * 100) : 0;
  const canApprove = spec.status !== "verified";

  return (
    <aside className="card bl-detail" aria-label={`Detalle de ${spec.id}`}>
      <div className="bl-detail-h">
        <div>
          <code className="bl-id">{spec.id}</code>
          <h2>{spec.title}</h2>
          <StatusBadge status={spec.status} />
        </div>
        <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Cerrar detalle">
          <X size={16} />
        </button>
      </div>

      <DesignViewer spec={spec} />

      <SpecArtifacts spec={spec} requirement={requirements.find((r) => r.specs.some((s) => s.id === spec.id))} />

      <section className="bl-sec bl-detail-stats">
        <div>
          <Ring value={testPct} status={spec.status} size={56} stroke={6} />
          <span className="muted bl-sm">
            {spec.tests.total ? `${spec.tests.passed}/${spec.tests.total} tests` : "Sin tests aún"}
          </span>
        </div>
        <div className="bl-detail-people">
          <span className="bl-sm muted">Responsable</span>
          <PersonChip id={spec.owner} />
          {spec.approvedBy && (
            <>
              <span className="bl-sm muted">Aprobó</span>
              <PersonChip id={spec.approvedBy} />
            </>
          )}
        </div>
      </section>

      <section className="bl-sec">
        <h3>Reglas que la refuerzan</h3>
        <ul className="bl-rule-list">
          {spec.rules.map((id) => {
            const r = ruleById(id);
            if (!r) return null;
            return (
              <li key={id}>
                <Link to={`/reglas?rule=${encodeURIComponent(id)}`}>
                  <KindIcon kind={r.kind} size={14} />
                  <span>{r.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bl-sec">
        <h3>Impacto en el sistema</h3>
        <ul className="bl-impacts">
          {spec.impacts.map((im) => (
            <li key={im.module}>
              <Box size={14} aria-hidden="true" />
              <code>{moduleById(im.module)?.repo}</code>
              <span className={`bl-level lv-${im.level}`}>{im.level}</span>
              <span className="muted bl-sm bl-full">{im.note}</span>
            </li>
          ))}
        </ul>
        {spec.files.length > 0 && (
          <ul className="bl-files">
            {spec.files.map((f) => (
              <li key={f}>
                <FileCode2 size={13} aria-hidden="true" />
                <code>{f}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      {spec.analysis && (
        <section className="bl-sec">
          <h3>Análisis de impacto · riesgo {spec.analysis.risk}/100</h3>
          <p className="bl-sm">{spec.analysis.summary}</p>
          {spec.analysis.related.length > 0 && (
            <ul className="bl-mini-list bl-related">
              {spec.analysis.related.map((r) => (
                <li key={r.id} className={r.relation === "contradicción" ? "is-conflict" : ""}>
                  <AlertTriangle size={13} className={r.relation === "contradicción" ? "bl-warn-text" : "muted"} aria-hidden="true" />
                  <div>
                    <Link to={`/specs?spec=${encodeURIComponent(r.id)}`} className="bl-id">
                      {r.id}
                    </Link>{" "}
                    <strong className="bl-sm">{r.relation}</strong>
                    <div className="bl-sm muted">{r.note}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {spec.analysis.gaps.length > 0 && (
            <p className="bl-sm muted">
              {spec.analysis.gaps.length} control{spec.analysis.gaps.length > 1 ? "es" : ""} sin cubrir · {spec.analysis.testsSuggested} tests sugeridos
            </p>
          )}
        </section>
      )}

      <section className="bl-sec">
        <h3>Trazabilidad</h3>
        {trail.length ? (
          <ol className="bl-mini-chain">
            {trail.map((e) => (
              <li key={e.seq}>
                <PersonChip id={e.actor} showRole={false} size={20} />
                <span className="bl-sm">
                  {e.action} · <span className="muted">{new Date(e.at).toLocaleDateString("es-AR")}</span>
                </span>
                <HashChip hash={e.hash} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted bl-sm">Sin eventos aún.</p>
        )}
      </section>

      {canApprove && (
        <button
          type="button"
          className="btn primary bl-btn-brand bl-full"
          onClick={() => setSpecStatus(spec.id, "verified", "msosa", "aprobó spec", "Aprobación de compliance desde el árbol")}
        >
          <BadgeCheck size={16} aria-hidden="true" />
          Aprobar como Compliance (Martín Sosa)
        </button>
      )}
    </aside>
  );
}
