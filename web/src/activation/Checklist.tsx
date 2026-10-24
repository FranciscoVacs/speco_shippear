// First steps checklist (spec 012, FR-001, FR-002, FR-004, NFR-003). A small card pinned to the corner: it follows the person
// across pages until they finish or close it, and the Help menu brings it back.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Circle, X } from "lucide-react";
import { useT } from "../i18n";
import { agent } from "../agent/store";
import { MILESTONE_LIST } from "./milestones";
import { MILESTONES, activation, useActivation } from "./store";

/** Marks the two navigation milestones from the route; the other two are marked where they happen (approvals, agent). */
export function useActivationWatcher() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === "/decisions") activation.markDone("decisions");
    else if (/^\/reviews\/[^/]+$/.test(pathname)) activation.markDone("review");
  }, [pathname]);
}

export function Checklist({ floating = false }: { floating?: boolean }) {
  const t = useT();
  const a = useActivation();
  const nav = useNavigate();
  const [announce, setAnnounce] = useState("");
  const total = MILESTONES.length;
  const n = a.done.length;
  const finished = n === total;

  // the live region says what just happened (NFR-003)
  useEffect(() => {
    if (n > 0) setAnnounce(finished ? t("act.allDone") : t("act.progress", { n, total }));
  }, [n, finished, total, t]);

  if (a.dismissed) return null;

  if (!a.open) {
    return (
      <div className={"act-pill-wrap" + (floating ? " floating" : "")}>
        <button type="button" className="act-pill" onClick={() => activation.setOpen(true)} aria-expanded="false" aria-controls="act-card">
          {t("act.title")} · {n}/{total}
        </button>
        <span className="sr-only" role="status" aria-live="polite">{announce}</span>
      </div>
    );
  }

  // the question is prefilled, never sent: the milestone is done when the person sends it
  const askAgent = () => {
    agent.setText(t("act.askText"));
    nav("/");
  };

  return (
    <section id="act-card" className={"act-card" + (floating ? " floating" : "")} aria-labelledby="act-title" data-testid="activation">
      <header className="act-head">
        <h2 id="act-title">{t("act.title")}</h2>
        <span className="act-count">{n}/{total}</span>
        <button type="button" className="icon-btn" onClick={() => activation.setOpen(false)} aria-label={t("act.minimize")} aria-expanded="true" aria-controls="act-card">
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={() => activation.dismiss()} aria-label={t("act.close")}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <p className="act-lead">{finished ? t("act.allDone") : t("act.lead")}</p>
      <ol className="act-list">
        {MILESTONE_LIST.map((m) => {
          const done = a.done.includes(m.id);
          const body = (
            <>
              <span className={"act-mark" + (done ? " on" : "")} aria-hidden="true">
                {done ? <Check size={13} /> : <Circle size={13} />}
              </span>
              <span className="act-text">
                <strong>{t(m.title)}</strong>
                <span className="muted small">{t(m.hint)}</span>
              </span>
              <span className="sr-only">{done ? t("act.done") : t("act.todo")}</span>
            </>
          );
          return (
            <li key={m.id} data-milestone={m.id} data-done={done ? "1" : "0"}>
              {m.to ? (
                <Link className="act-item" to={m.to}>{body}</Link>
              ) : (
                <button type="button" className="act-item" onClick={askAgent}>{body}</button>
              )}
            </li>
          );
        })}
      </ol>
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
    </section>
  );
}
