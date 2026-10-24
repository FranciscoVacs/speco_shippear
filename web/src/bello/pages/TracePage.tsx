import { useState } from "react";
import { Link2, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { PEOPLE } from "../data";
import { useBello } from "../store";
import { GENESIS, short, useChain } from "../hash";
import { HashChip, PersonChip } from "../ui";

export default function TracePage() {
  const { events } = useBello();
  const [tamper, setTamper] = useState(false);
  const [who, setWho] = useState<string>("all");
  const tampered = tamper ? { index: 6, detail: "Cumple BCRA-SNP LIM (editado sin registro)" } : undefined;
  const chain = useChain(events, tampered);
  const broken = chain?.find((e) => e.broken);
  const visible = (chain ?? []).filter((e) => who === "all" || e.actor === who);
  const byPerson = PEOPLE.map((p) => ({ p, n: events.filter((e) => e.actor === p.id).length })).filter((x) => x.n);
  const maxN = Math.max(...byPerson.map((x) => x.n));

  return (
    <div className="bl-stack-y">
      <section className={"card bl-card bl-integrity" + (broken ? " bad" : chain ? " good" : "")} aria-live="polite">
        <span className="bl-integrity-ico" aria-hidden="true">
          {!chain ? <LoaderCircle className="spin" size={28} /> : broken ? <ShieldAlert size={28} /> : <ShieldCheck size={28} />}
        </span>
        <div className="bl-integrity-txt">
          <h2>{!chain ? "Verificando cadena…" : broken ? `Cadena rota en el bloque #${broken.seq}` : "Cadena íntegra"}</h2>
          <p className="muted">
            {broken
              ? "El contenido de un evento cambió sin un nuevo registro: su hash ya no coincide y todos los bloques siguientes quedan invalidados."
              : `${events.length} eventos encadenados con SHA-256. Cada bloque incluye el hash del anterior: si alguien edita el historial, la cadena lo delata.`}
          </p>
        </div>
        <label className="bl-switch">
          <input type="checkbox" checked={tamper} onChange={(e) => setTamper(e.target.checked)} />
          <span>Simular manipulación</span>
        </label>
      </section>

      <div className="bl-grid-2 bl-trace-grid">
        <section className="card bl-card">
          <div className="bl-card-h">
            <h2>Personas</h2>
          </div>
          <ul className="bl-people">
            <li>
              <button type="button" className={"bl-people-row" + (who === "all" ? " on" : "")} onClick={() => setWho("all")}>
                <span>Todas</span>
                <strong>{events.length}</strong>
              </button>
            </li>
            {byPerson.map(({ p, n }) => (
              <li key={p.id}>
                <button type="button" className={"bl-people-row" + (who === p.id ? " on" : "")} onClick={() => setWho(p.id)} aria-pressed={who === p.id}>
                  <PersonChip id={p.id} />
                  <span className="bl-people-bar" aria-hidden="true">
                    <span style={{ width: `${(n / maxN) * 100}%` }} />
                  </span>
                  <strong>{n}</strong>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card bl-card">
          <div className="bl-card-h">
            <h2>Cadena de eventos</h2>
            <span className="muted bl-sm">
              génesis <code>{short(GENESIS)}</code>
            </span>
          </div>
          <ol className="bl-chain">
            {visible
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.seq} className={"bl-block" + (e.broken ? " broken" : "")}>
                  <span className="bl-block-seq">#{e.seq}</span>
                  <div className="bl-block-body">
                    <div className="bl-block-top">
                      <PersonChip id={e.actor} />
                      <time className="muted bl-sm" dateTime={e.at}>
                        {new Date(e.at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                      </time>
                    </div>
                    <p>
                      {e.action} <code className="bl-id">{e.target}</code> — {tamper && e.seq === 7 ? tampered!.detail : e.detail}
                    </p>
                    <div className="bl-block-hashes">
                      <HashChip hash={e.hash} label="hash" />
                      <span className="bl-prev">
                        <Link2 size={12} aria-hidden="true" /> prev <code>{short(e.prev)}</code>
                      </span>
                      {e.broken && <span className="bl-badge s-failing">No coincide</span>}
                    </div>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
