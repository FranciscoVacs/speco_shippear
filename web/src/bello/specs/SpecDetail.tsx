import { Link } from "react-router-dom";
import { BadgeCheck, Box, FileCode2, ImageIcon, X } from "lucide-react";
import { moduleById, rule as ruleById, type Spec } from "../data";
import { setSpecStatus, useBello } from "../store";
import { useChain } from "../hash";
import { HashChip, KindIcon, PersonChip, Ring, StatusBadge } from "../ui";

export function SpecDetail({ spec, onClose }: { spec: Spec; onClose: () => void }) {
  const { events } = useBello();
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

      <figure className="bl-design">
        {spec.design ? (
          <img src={spec.design} alt={`Diseño frontend de ${spec.title}`} />
        ) : (
          <div className="bl-design-empty">
            <ImageIcon size={22} aria-hidden="true" />
            <span>Esta spec no tiene pantalla: es backend o regulatoria.</span>
          </div>
        )}
        {spec.design && <figcaption>Diseño frontend generado por la spec</figcaption>}
      </figure>

      <section className="bl-sec">
        <h3>Requisito (EARS)</h3>
        <p className="bl-ears">{spec.ears}</p>
      </section>

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
                <Link to={`/bello/reglas?rule=${encodeURIComponent(id)}`}>
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
