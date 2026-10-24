import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, FlaskConical, Fingerprint, ShieldCheck, TriangleAlert } from "lucide-react";
import { RULES, STATUS_LABEL, VERIFICATION_TREND, rule as ruleById } from "../data";
import { allSpecs, requirementStatus, useBello, verifiedRatio } from "../store";
import { ruleCompliance, statusCounts, testRatio } from "../metrics";
import { useChain, short } from "../hash";
import { Bar, Donut, HashChip, KindIcon, LineChart, PersonChip, StackBar, StatusBadge, StatusDot, statusFromPct } from "../ui";

export default function Overview() {
  const { requirements, events } = useBello();
  const specs = allSpecs(requirements);
  const counts = statusCounts(specs);
  const tests = testRatio(specs);
  const external = RULES.filter((r) => r.kind === "certification" || r.kind === "regulation");
  const compliance = Math.round(external.reduce((n, r) => n + ruleCompliance(r, specs), 0) / external.length);
  const chain = useChain(events);
  const last = chain?.[chain.length - 1];
  const alerts = specs.filter((s) => s.status === "failing" || s.status === "risk");
  const gaps = RULES.flatMap((r) => r.controls.filter((c) => !c.ok).map((c) => ({ rule: r, control: c })));
  const trend = [...VERIFICATION_TREND.slice(0, -1), { week: "Hoy", value: verifiedRatio(specs) }];

  return (
    <div className="bl-stack-y">
      <section className="bl-kpis" aria-label="Indicadores">
        <Kpi icon={<ShieldCheck size={18} />} label="Specs verificadas" value={`${verifiedRatio(specs)}%`} hint={`${counts[0].value} de ${specs.length}`} tone="verified" />
        <Kpi icon={<FlaskConical size={18} />} label="Tests que pasan" value={`${tests.passed}/${tests.total}`} hint={`${Math.round((tests.passed / tests.total) * 100)}% en CI`} tone="progress" />
        <Kpi icon={<CircleAlert size={18} />} label="Cumplimiento normativo" value={`${compliance}%`} hint={`${external.length} marcos externos`} tone={statusFromPct(compliance)} />
        <Kpi icon={<Fingerprint size={18} />} label="Eventos trazados" value={String(events.length)} hint={last ? `último ${short(last.hash)}` : "calculando…"} tone="pending" />
      </section>

      <div className="bl-grid-2">
        <section className="card bl-card">
          <div className="bl-card-h">
            <h2>Estado de verificación</h2>
            <Link to="/bello/specs" className="bl-link">
              Ver árbol <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="bl-donut-row">
            <Donut data={counts} center={`${verifiedRatio(specs)}%`} sub="verificado" />
            <ul className="bl-legend">
              {counts.map((c) => (
                <li key={c.status}>
                  <StatusDot status={c.status} />
                  <span>{STATUS_LABEL[c.status]}</span>
                  <strong>{c.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="card bl-card">
          <div className="bl-card-h">
            <h2>Avance semanal</h2>
            <span className="muted bl-sm">% de specs verificadas</span>
          </div>
          <LineChart data={trend} />
        </section>
      </div>

      <div className="bl-grid-2">
        <section className="card bl-card">
          <div className="bl-card-h">
            <h2>Cumplimiento por marco</h2>
            <Link to="/bello/reglas" className="bl-link">
              Reglas <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul className="bl-bars">
            {external.map((r) => {
              const pct = ruleCompliance(r, specs);
              return (
                <li key={r.id}>
                  <KindIcon kind={r.kind} size={14} />
                  <span className="bl-bars-lbl">{r.title}</span>
                  <Bar value={pct} status={statusFromPct(pct)} />
                  <strong>{pct}%</strong>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card bl-card">
          <div className="bl-card-h">
            <h2>Requiere atención</h2>
            <span className="bl-count">{alerts.length + gaps.length}</span>
          </div>
          <ul className="bl-alerts">
            {alerts.map((s) => (
              <li key={s.id}>
                <Link to={`/bello/specs?spec=${encodeURIComponent(s.id)}`} className={`bl-alert s-${s.status}`}>
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>
                    <strong>{s.title}</strong>
                    <span className="muted bl-sm">
                      {s.id} · {s.tests.passed}/{s.tests.total} tests
                    </span>
                  </span>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
            {gaps.slice(0, 4).map(({ rule, control }) => (
              <li key={rule.id + control.id}>
                <Link to={`/bello/reglas?rule=${encodeURIComponent(rule.id)}`} className="bl-alert s-pending">
                  <KindIcon kind={rule.kind} size={14} />
                  <span>
                    <strong>
                      {ruleById(rule.id)?.title} · {control.id}
                    </strong>
                    <span className="muted bl-sm">{control.text}</span>
                  </span>
                  <span className="bl-badge s-risk">Control sin cubrir</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card bl-card">
        <div className="bl-card-h">
          <h2>Requerimientos</h2>
          <Link to="/bello/asistente" className="btn sm primary bl-btn-brand">
            Nuevo requerimiento
          </Link>
        </div>
        <div className="bl-req-grid">
          {requirements.map((r) => {
            const design = r.specs.find((s) => s.design)?.design;
            const st = requirementStatus(r);
            return (
              <Link key={r.id} to={`/bello/specs?req=${encodeURIComponent(r.id)}`} className="bl-req-card">
                <div className="bl-req-thumb">{design ? <img src={design} alt="" loading="lazy" /> : <span className="bl-req-noimg">Sin diseño frontend</span>}</div>
                <div className="bl-req-body">
                  <div className="bl-req-top">
                    <code className="bl-id">{r.id}</code>
                    <StatusBadge status={st} />
                  </div>
                  <strong>{r.title}</strong>
                  <StackBar data={statusCounts(r.specs)} />
                  <span className="muted bl-sm">
                    {r.specs.length} specs · {verifiedRatio(r.specs)}% verificado
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card bl-card">
        <div className="bl-card-h">
          <h2>Actividad reciente</h2>
          <Link to="/bello/trazabilidad" className="bl-link">
            Cadena completa <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <ol className="bl-activity">
          {(chain ?? []).slice(-5).reverse().map((e) => (
            <li key={e.seq}>
              <PersonChip id={e.actor} />
              <span className="bl-act-what">
                {e.action} <code className="bl-id">{e.target}</code>
                <span className="muted bl-sm">{e.detail}</span>
              </span>
              <HashChip hash={e.hash} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Kpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: Parameters<typeof StatusDot>[0]["status"] }) {
  return (
    <div className={`bl-kpi s-${tone}`}>
      <span className="bl-kpi-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="bl-kpi-lbl">{label}</span>
      <span className="bl-kpi-val">{value}</span>
      <span className="bl-kpi-hint">{hint}</span>
    </div>
  );
}
