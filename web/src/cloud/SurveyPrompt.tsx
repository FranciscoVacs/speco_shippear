// Spec 022: the Sean Ellis question, as a small card in a corner. It never blocks the page; "later" hides it for two weeks.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";
import { currentTenant, useSession } from "../shell/session";
import { cloudEnabled } from "./config";
import { sendSurvey, snooze, surveyDue, type Disappointed } from "./survey";

const OPTIONS: Disappointed[] = ["very", "somewhat", "not", "na"];

export function SurveyPrompt() {
  return cloudEnabled() ? <Card /> : null;
}

function Card() {
  const t = useT();
  const session = useSession();
  const orgId = session.signedIn ? currentTenant(session)?.id : undefined;
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<Disappointed | null>(null);
  const [benefit, setBenefit] = useState("");
  const [alt, setAlt] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "failed" | "thanks">("idle");
  useEffect(() => {
    let live = true;
    if (orgId) void surveyDue(orgId).then((d) => live && setOpen(d));
    return () => {
      live = false;
    };
  }, [orgId]);
  if (!open || !orgId) return null;
  if (state === "thanks")
    return (
      <aside className="survey" role="status" data-testid="survey">
        <p>{t("survey.thanks")}</p>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>{t("common.close")}</button>
      </aside>
    );
  return (
    <aside className="survey" aria-label={t("survey.title")} data-testid="survey">
      <div className="survey-head">
        <strong>{t("survey.title")}</strong>
        <button type="button" className="icon-btn ghost" aria-label={t("common.close")} onClick={() => { snooze(); setOpen(false); }}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <fieldset className="survey-options">
        <legend className="muted small">{t("survey.question")}</legend>
        {OPTIONS.map((o) => (
          <label key={o}>
            <input type="radio" name="pmf" value={o} checked={answer === o} onChange={() => setAnswer(o)} /> {t(`survey.${o}`)}
          </label>
        ))}
      </fieldset>
      {answer && answer !== "na" && (
        <>
          <label className="field"><span>{t("survey.benefit")}</span><textarea rows={2} maxLength={1000} value={benefit} onChange={(e) => setBenefit(e.target.value)} /></label>
          <label className="field"><span>{t("survey.alternative")}</span><textarea rows={2} maxLength={1000} value={alt} onChange={(e) => setAlt(e.target.value)} /></label>
        </>
      )}
      {state === "failed" && <p className="form-error" role="alert">{t("survey.failed")}</p>}
      <div className="survey-actions">
        <button type="button" className="btn sm" onClick={() => { snooze(); setOpen(false); }}>{t("survey.later")}</button>
        <button
          type="button"
          className="btn primary sm"
          disabled={!answer || state === "sending"}
          onClick={async () => {
            setState("sending");
            const ok = await sendSurvey(orgId, { disappointed: answer!, main_benefit: benefit, alternative: alt });
            setState(ok ? "thanks" : "failed");
          }}
        >
          {t("survey.send")}
        </button>
      </div>
    </aside>
  );
}
