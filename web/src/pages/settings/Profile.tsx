import { useState } from "react";
import { useLang, useT } from "../../i18n";
import { session, useSession } from "../../shell/session";
import { useTheme, type ThemePref } from "../../shell/theme";
import { Avatar } from "../../shell/ui";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";

export default function Profile() {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const { lang, setLang } = useLang();
  const theme = useTheme();
  const [name, setName] = useState(s.user.name);
  const [email, setEmail] = useState(s.user.email);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const dirty = name.trim() !== s.user.name || email.trim() !== s.user.email;
  return (
    <>
      <PageHeader title={t("settings.profile")} description={t("profile.desc")} demo />
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || !emailOk || name.trim().length < 2) return;
          session.updateUser({ name: name.trim(), email: email.trim() });
          ui.toast(t("common.saved"));
        }}
      >
        <div className="card-body">
          <div className="profile-id">
            <Avatar name={name || "?"} size={48} />
            <div>
              <div className="who-name">{name || "—"}</div>
              <div className="muted small">{email}</div>
            </div>
          </div>
          <label className="field">
            <span>{t("profile.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <label className="field">
            <span>{t("profile.email")}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!emailOk} />
          </label>
        </div>
        <div className="card-foot">
          <span className="muted small">{t("demo.localOnly")}</span>
          <button type="submit" className="btn primary" disabled={!dirty || !emailOk || name.trim().length < 2}>
            {t("common.save")}
          </button>
        </div>
      </form>
      <section className="card" aria-labelledby="pref-h">
        <div className="card-body">
          <h2 id="pref-h">{t("profile.prefs")}</h2>
          <label className="field">
            <span>{t("user.language")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as "es" | "en")}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            <span>{t("user.theme")}</span>
            <select value={theme.pref} onChange={(e) => theme.setPref(e.target.value as ThemePref)}>
              <option value="light">{t("theme.light")}</option>
              <option value="dark">{t("theme.dark")}</option>
              <option value="system">{t("theme.system")}</option>
            </select>
          </label>
        </div>
      </section>
    </>
  );
}
