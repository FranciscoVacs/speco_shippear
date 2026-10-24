// /ideas: the second door (spec 016). A person with no code yet says what they want in their own words, and Speco asks what matters.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { useLang, useT } from "../i18n";
import { currentTenant, useSession } from "../shell/session";
import { useUI } from "../shell/UIContext";
import { ApiError } from "../cloud/api";
import { createIdea, useIdeas } from "../cloud/ideas";
import { LoadFailure, Skeleton } from "../States";
import { PageHeader } from "./PageHeader";

export default function Ideas() {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const nav = useNavigate();
  const org = currentTenant(useSession()).id;
  const { ideas, reload } = useIdeas(org);
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!need.trim()) return;
    setBusy(true);
    try {
      const idea = await createIdea(org, need.trim(), lang === "en" ? "en" : "es");
      nav(`/ideas/${idea.id}`);
    } catch (err) {
      ui.toast(err instanceof ApiError ? err.detail : t("pt.err.network"));
      setBusy(false);
    }
  };

  return (
    <div className="page page-ideas">
      <PageHeader title={t("idea.title")} description={t("idea.desc")} />
      <form className="card idea-new" onSubmit={start} aria-labelledby="idea-new-h">
        <h2 id="idea-new-h" className="dec-h"><Lightbulb size={16} aria-hidden="true" /> {t("idea.new")}</h2>
        <label className="field">
          <span>{t("idea.needLabel")}</span>
          <textarea id="idea-need" rows={4} value={need} maxLength={2000} placeholder={t("idea.needPlaceholder")} onChange={(e) => setNeed(e.target.value)} data-autofocus />
        </label>
        <p><button type="submit" className="btn primary" disabled={busy || !need.trim()}>{t("idea.start")}</button></p>
      </form>

      <section aria-labelledby="idea-list-h">
        <h2 id="idea-list-h" className="dec-h">{t("idea.yours")}</h2>
        {ideas === null ? <Skeleton /> : ideas === "error" ? <LoadFailure detail={t("pt.err.network")} onRetry={reload} /> : ideas.length === 0 ? (
          <p className="muted">{t("idea.none")}</p>
        ) : (
          <ul className="idea-list">
            {ideas.map((i) => (
              <li key={i.id} className="card idea-row">
                <div>
                  <Link to={`/ideas/${i.id}`} className="mono-title">{i.title}</Link>
                  <p className="muted small">{i.done ? t("idea.rowDone", { n: i.answered, risk: i.unknown }) : t("idea.rowProgress", { done: i.answered + i.unknown, total: i.total })}</p>
                </div>
                <Link className="btn" to={`/ideas/${i.id}`}>{i.done ? t("idea.open") : t("idea.continue")}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
