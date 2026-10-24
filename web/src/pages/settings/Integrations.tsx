import { useState } from "react";
import { useT, type Key } from "../../i18n";
import { session, useSession, type IntegrationId } from "../../shell/session";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";

const ITEMS: { id: IntegrationId; name: string; letter: string }[] = [
  { id: "github", name: "GitHub", letter: "G" },
  { id: "slack", name: "Slack", letter: "S" },
  { id: "jira", name: "Jira", letter: "J" },
  { id: "linear", name: "Linear", letter: "L" },
];

export default function Integrations() {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const [busy, setBusy] = useState<IntegrationId | null>(null);
  const connect = (id: IntegrationId, name: string) => {
    setBusy(id);
    window.setTimeout(() => {
      session.setIntegration(id, true);
      setBusy(null);
      ui.toast(t("int.connectedToast", { name }));
    }, 700);
  };
  return (
    <>
      <PageHeader title={t("settings.integrations")} description={t("int.desc")} demo />
      <ul className="int-grid">
        {ITEMS.map((i) => {
          const on = s.integrations[i.id].connected;
          const b = busy === i.id;
          return (
            <li key={i.id} className="card int-card">
              <div className="int-head">
                <span className="int-logo" aria-hidden="true">
                  {i.letter}
                </span>
                <div>
                  <h2>{i.name}</h2>
                  <span className={"status " + (on ? "ok" : "off")}>
                    <span className="status-dot" aria-hidden="true" /> {on ? t("int.connected") : t("int.notConnected")}
                  </span>
                </div>
              </div>
              <p className="muted">{t(`int.${i.id}` as Key)}</p>
              {on && s.integrations[i.id].account && <p className="small muted">{t("int.account", { name: s.integrations[i.id].account })}</p>}
              <div className="int-foot">
                {on ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      session.setIntegration(i.id, false);
                      ui.toast(t("int.disconnectedToast", { name: i.name }));
                    }}
                    aria-label={`${t("int.disconnect")} ${i.name}`}
                  >
                    {t("int.disconnect")}
                  </button>
                ) : (
                  <button type="button" className="btn primary" disabled={b} aria-busy={b} onClick={() => connect(i.id, i.name)} aria-label={`${t("int.connect")} ${i.name}`}>
                    {b ? t("int.connecting") : t("int.connect")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
