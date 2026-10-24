// Spec 025: one line, one tap. Bottom left (the survey lives bottom right), it never blocks the page, shows up a few seconds after the app
// loads, once per page load, and then stays away for a day. The person who fixed a problem says whether it would have reached code.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";
import { currentTenant, useSession } from "../shell/session";
import { cloudEnabled } from "./config";
import { afterAnswer, afterClose, nextPending, sendOutcome, type Answer, type Pending } from "./outcomes";

const DELAY_MS = 8000;
const ANSWERS: Answer[] = ["yes", "probably", "no"];

export function ValueCheck() {
  return cloudEnabled() ? <Card /> : null;
}

function Card() {
  const t = useT();
  const session = useSession();
  const orgId = session.signedIn ? currentTenant(session)?.id : undefined;
  const [item, setItem] = useState<Pending | null>(null);
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    const timer = window.setTimeout(() => void nextPending(orgId).then((p) => live && setItem(p)), DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [orgId]);
  useEffect(() => {
    if (!thanks) return;
    const timer = window.setTimeout(() => { setThanks(false); setItem(null); }, 2500);
    return () => window.clearTimeout(timer);
  }, [thanks]);
  if (!item || !orgId) return null;
  if (thanks) return <aside className="value-check" role="status" data-testid="value-check"><span>{t("value.thanks")}</span></aside>;
  const answer = async (a: Answer) => {
    afterAnswer();                                   // a day of quiet whether or not it reached the service
    setThanks(true);
    void sendOutcome(orgId, item, a);
  };
  return (
    <aside className="value-check" aria-label={t("value.title")} data-testid="value-check">
      <div className="value-check-head">
        <span className="muted small">{t("value.fixed")}</span>
        <button type="button" className="icon-btn ghost" aria-label={t("common.close")} onClick={() => { afterClose(); setItem(null); }}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="value-check-msg" title={item.message}>{item.message}</p>
      <div className="value-check-q">
        <span>{t("value.question")}</span>
        <span className="value-check-actions">
          {ANSWERS.map((a) => (
            <button key={a} type="button" className="btn sm" onClick={() => void answer(a)}>{t(`value.${a}`)}</button>
          ))}
        </span>
      </div>
    </aside>
  );
}
