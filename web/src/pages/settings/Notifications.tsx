import { useT, type Key } from "../../i18n";
import { session, useSession, type NotifChannel, type NotifEvent } from "../../shell/session";
import { PageHeader } from "../PageHeader";

const EVENTS: NotifEvent[] = ["reviews", "members", "usage", "news"];
const CHANNELS: NotifChannel[] = ["inapp", "email", "slack"];

export default function NotificationSettings() {
  const t = useT();
  const s = useSession();
  const slackOn = s.integrations.slack.connected;
  return (
    <>
      <PageHeader title={t("settings.notifications")} description={t("nset.desc")} demo />
      <div className="card">
        <div className="table-wrap flush">
          <table className="data-table matrix">
            <caption className="sr-only">{t("settings.notifications")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("nset.event")}</th>
                {CHANNELS.map((c) => (
                  <th key={c} scope="col" className="center">
                    {t(`nset.ch.${c}` as Key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((ev) => (
                <tr key={ev}>
                  <th scope="row">
                    <div className="who-name">{t(`nset.ev.${ev}` as Key)}</div>
                    <div className="muted small">{t(`nset.ev.${ev}.d` as Key)}</div>
                  </th>
                  {CHANNELS.map((c) => {
                    const disabled = c === "slack" && !slackOn;
                    return (
                      <td key={c} className="center">
                        <label className="switch">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={s.notifPrefs[ev][c] && !disabled}
                            disabled={disabled}
                            onChange={(e) => session.setNotifPref(ev, c, e.target.checked)}
                            aria-label={`${t(`nset.ev.${ev}` as Key)} — ${t(`nset.ch.${c}` as Key)}`}
                          />
                          <span className="switch-ui" aria-hidden="true" />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!slackOn && <p className="card-foot muted small">{t("nset.slackHint")}</p>}
      </div>
    </>
  );
}
