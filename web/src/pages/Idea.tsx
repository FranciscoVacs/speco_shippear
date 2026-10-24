// /ideas/:id: the interview, one question at a time, and what the person takes away: their decisions and a brief for their AI tool (spec 016).
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useT } from "../i18n";
import { tn } from "../decision/ui";
import { currentTenant, useSession } from "../shell/session";
import { useUI } from "../shell/UIContext";
import { copyText } from "../CodeBlock";
import { ApiError } from "../cloud/api";
import { answerIdea, getIdea, type Idea as IdeaT } from "../cloud/ideas";
import { LoadFailure, Skeleton } from "../States";
import { PageHeader } from "./PageHeader";

export default function Idea() {
  const t = useT();
  const ui = useUI();
  const { id = "" } = useParams();
  const org = currentTenant(useSession()).id;
  const [idea, setIdea] = useState<IdeaT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);   // a question the person goes back to change
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getIdea(org, id).then(setIdea).catch((e) => setError(e instanceof ApiError && e.status === 404 ? "404" : String(e?.detail ?? e)));
  }, [org, id]);
  useEffect(load, [load]);

  if (error === "404") return <div className="page"><div className="state"><h2>{t("idea.missing")}</h2><p><Link className="btn" to="/ideas">{t("idea.back")}</Link></p></div></div>;
  if (error) return <div className="page"><LoadFailure detail={error} onRetry={load} /></div>;
  if (!idea) return <div className="page"><Skeleton /></div>;

  const current = idea.questions.find((q) => q.id === (editing ?? idea.progress.next)) ?? null;
  const send = async (unknown: boolean) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      setIdea(await answerIdea(org, idea.id, current.id, text, unknown));
      setEditing(null);
      setText("");
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.detail : t("pt.err.network"));
    } finally {
      setBusy(false);
    }
  };
  const edit = (qid: string) => {
    setEditing(qid);
    setText(idea.answers[qid]?.state === "answered" ? idea.answers[qid].text : "");
  };
  const n = idea.progress.answered + idea.progress.unknown;

  return (
    <div className="page page-idea">
      <PageHeader title={idea.title} description={idea.need} actions={<Link className="btn" to="/ideas">{t("idea.back")}</Link>} />

      {current ? (
        <section className="card idea-q" aria-labelledby="idea-q-h">
          <p className="eyebrow">{t("idea.step", { n: idea.questions.indexOf(current) + 1, total: idea.progress.total })}</p>
          <h2 id="idea-q-h">{current.ask}</h2>
          <p className="muted">{current.example}</p>
          <label className="field">
            <span className="sr-only">{t("idea.yourAnswer")}</span>
            <textarea id="idea-answer" rows={3} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} data-autofocus placeholder={t("idea.answerPlaceholder")} />
          </label>
          <div className="idea-actions">
            <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={() => send(false)}>{t("idea.save")}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => send(true)}>{t("idea.unknown")}</button>
            {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setText(""); }}>{t("common.cancel")}</button>}
          </div>
        </section>
      ) : (
        <section className="card idea-done" aria-labelledby="idea-done-h">
          <h2 id="idea-done-h"><Check size={16} aria-hidden="true" /> {t("idea.doneTitle")}</h2>
          <p>{t("idea.doneBody", { n: idea.progress.answered, total: idea.progress.total })}</p>
          {idea.progress.unknown > 0 && (
            <p className="appr-warn" role="status"><TriangleAlert size={13} aria-hidden="true" /> {tn(t, "idea.risk", idea.progress.unknown)}</p>
          )}
          <h3>{t("idea.briefTitle")}</h3>
          <p className="muted small">{t("idea.briefHelp")}</p>
          <pre className="idea-brief" tabIndex={0}>{idea.brief}</pre>
          <p>
            <button type="button" className="btn primary" onClick={async () => ui.toast(t((await copyText(idea.brief)) ? "idea.copied" : "idea.copyFailed"))}>
              <Copy size={14} aria-hidden="true" /> {t("idea.copy")}
            </button>
          </p>
          <p className="muted small">{t("idea.next")}</p>
        </section>
      )}

      <section aria-labelledby="idea-so-far">
        <h2 id="idea-so-far" className="dec-h">{t("idea.soFar", { n, total: idea.progress.total })}</h2>
        <ul className="idea-answers">
          {idea.questions.map((q) => {
            const a = idea.answers[q.id];
            if (!a) return null;
            return (
              <li key={q.id} className="card idea-answer">
                <div>
                  <strong>{q.ask}</strong>
                  <p className={a.state === "unknown" ? "appr-warn" : ""}>{a.state === "unknown" ? t("idea.undecided") : a.text}</p>
                </div>
                <button type="button" className="btn" onClick={() => edit(q.id)}>{t("idea.change")}</button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
