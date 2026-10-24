import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, CircleCheck, CircleDashed, Plus, Sparkles } from "lucide-react";
import { rule as ruleById, type Requirement } from "../data";
import { addRequirement, useBello } from "../store";
import { SUGGESTIONS, answer, type Reply } from "./engine";
import { KindIcon, PersonChip, Ring, StatusBadge, statusFromPct } from "../ui";

interface Msg {
  id: number;
  role: "user" | "agent";
  text?: string;
  reply?: Reply;
}

let msgs: Msg[] = [];
let thinking = false;
let seq = 0;
const ls = new Set<() => void>();
const push = () => ls.forEach((l) => l());
const sub = (l: () => void) => {
  ls.add(l);
  return () => ls.delete(l);
};
const snap = () => msgs;
const snapThinking = () => thinking;

function send(text: string, reqs: Requirement[]) {
  msgs = [...msgs, { id: ++seq, role: "user", text }];
  thinking = true;
  push();
  setTimeout(() => {
    msgs = [...msgs, { id: ++seq, role: "agent", reply: answer(text, reqs) }];
    thinking = false;
    push();
  }, 650);
}

export function BelloAssistant({ compact = false }: { compact?: boolean }) {
  const { requirements } = useBello();
  const list = useSyncExternalStore(sub, snap);
  const busy = useSyncExternalStore(sub, snapThinking);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const added = new Set(requirements.map((r) => r.id));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [list.length, busy]);

  const submit = (v = text) => {
    if (!v.trim() || busy) return;
    send(v.trim(), requirements);
    setText("");
  };

  return (
    <div className={"bl-asst" + (compact ? " compact" : "")}>
      <div className="bl-asst-log" aria-live="polite">
        {list.length === 0 && (
          <div className="bl-asst-empty">
            <span className="bl-asst-badge" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <h2>Asistente de Bello</h2>
            <p className="muted">
              Describí lo que necesitás y lo convierto en specs reforzadas por la normativa, las certificaciones y las reglas del código de Bello. También podés consultar el estado de cualquier requerimiento.
            </p>
          </div>
        )}
        {list.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="bl-msg user">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="bl-msg agent">
              <ReplyView reply={m.reply!} added={m.reply!.kind === "draft" && added.has(m.reply!.req.id)} compact={compact} />
            </div>
          ),
        )}
        {busy && (
          <div className="bl-msg agent bl-typing" aria-label="El asistente está escribiendo">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="bl-asst-sugg">
        {SUGGESTIONS.slice(0, compact ? 3 : 5).map((s) => (
          <button key={s} type="button" className="bl-chip" onClick={() => submit(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="bl-asst-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor={compact ? "bl-asst-c" : "bl-asst"}>
          Mensaje al asistente
        </label>
        <textarea
          id={compact ? "bl-asst-c" : "bl-asst"}
          rows={compact ? 2 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej.: Quiero que el cliente pueda pagar servicios con QR…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" className="bl-send" disabled={!text.trim() || busy} aria-label="Enviar">
          <ArrowUp size={16} />
        </button>
      </form>
      <p className="bl-asst-foot muted">Modo demo · respuestas generadas con las reglas cargadas en este workspace.</p>
    </div>
  );
}

function ReplyView({ reply, added, compact }: { reply: Reply; added: boolean; compact: boolean }) {
  if (reply.kind === "text") return <p>{reply.text}</p>;
  if (reply.kind === "status")
    return (
      <div className="bl-reply">
        <div className="bl-reply-status">
          {reply.pct !== undefined && <Ring value={reply.pct} status={statusFromPct(reply.pct)} size={48} stroke={5} />}
          <p>{reply.text}</p>
        </div>
        {reply.specs.length > 0 && (
          <ul className="bl-reply-specs">
            {reply.specs.slice(0, compact ? 4 : 8).map((s) => (
              <li key={s.id}>
                <Link to={`/bello/specs?spec=${encodeURIComponent(s.id)}`}>
                  <span>{s.title}</span>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  const { req, checks, intro } = reply;
  return (
    <div className="bl-reply">
      <p>{intro}</p>
      <div className="bl-draft">
        <div className="bl-draft-h">
          <code className="bl-id">{req.id}</code>
          <strong>{req.title}</strong>
        </div>
        <ol className="bl-draft-specs">
          {req.specs.map((s) => (
            <li key={s.id}>
              <strong>{s.title}</strong>
              <span className="bl-ears bl-sm">{s.ears}</span>
            </li>
          ))}
        </ol>
        <h3 className="bl-draft-sub">Verificación contra reglas</h3>
        <ul className="bl-checks">
          {checks.map((c, i) => {
            const r = ruleById(c.ruleId)!;
            return (
              <li key={c.ruleId + i} className={c.ok ? "ok" : "gap"}>
                {c.ok ? <CircleCheck size={14} aria-label="Cumple" /> : <CircleDashed size={14} aria-label="Revisar" />}
                <KindIcon kind={r.kind} size={12} />
                <span>
                  <strong>{r.title}</strong> <span className="muted">{c.note}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="bl-draft-f">
          <PersonChip id="lfernandez" size={20} showRole={false} />
          {added ? (
            <Link to={`/bello/specs?req=${encodeURIComponent(req.id)}`} className="btn sm">
              Ver en el árbol
            </Link>
          ) : (
            <button type="button" className="btn sm primary bl-btn-brand" onClick={() => addRequirement(req)}>
              <Plus size={14} aria-hidden="true" /> Agregar al árbol
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
