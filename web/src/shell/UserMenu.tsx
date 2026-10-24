// User menu (FR-010): profile, settings, language, theme, docs, help, shortcuts, log out (FR-011).
import { BookOpen, HelpCircle, Keyboard, LogOut, MoreHorizontal, Settings, UserRound, Monitor, Sun, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useT, useLang } from "../i18n";
import { signOutEverywhere } from "../cloud/auth";
import { session, useSession } from "./session";
import { useTheme, type ThemePref } from "./theme";
import { Avatar, MenuHeading, MenuItem, MenuLink, MenuSep, Popover } from "./ui";
import { useUI } from "./UIContext";
import type { Placement } from "./ui";

export function UserMenu({ placement = "top-start" }: { placement?: Placement }) {
  const t = useT();
  const s = useSession();
  const nav = useNavigate();
  const ui = useUI();
  const { lang, setLang } = useLang();
  const theme = useTheme();
  const themes: [ThemePref, string, typeof Sun][] = [
    ["light", t("theme.light"), Sun],
    ["dark", t("theme.dark"), Moon],
    ["system", t("theme.system"), Monitor],
  ];
  return (
    <Popover
      label={t("user.menu")}
      placement={placement}
      panelClassName="user-panel"
      trigger={(p, open) => (
        <button {...p} type="button" className={"icon-btn" + (open ? " on" : "")} aria-label={t("user.menu")} title={t("user.menu")}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      )}
    >
      <div className="um-head" aria-hidden="true">
        <Avatar name={s.user.name} size={32} />
        <div>
          <div className="um-name">{s.user.name}</div>
          <div className="muted small">{s.user.email}</div>
        </div>
      </div>
      <MenuSep />
      <MenuLink to="/settings/profile" icon={<UserRound size={15} />}>
        {t("user.profile")}
      </MenuLink>
      <MenuLink to="/settings/general" icon={<Settings size={15} />}>
        {t("nav.settings")}
      </MenuLink>
      <MenuSep />
      <MenuHeading>{t("user.language")}</MenuHeading>
      <div role="group" aria-label={t("user.language")}>
        {(["es", "en"] as const).map((l) => (
          <MenuItem key={l} role="menuitemradio" checked={lang === l} onSelect={() => setLang(l)} trailing={lang === l ? "✓" : undefined}>
            {l === "es" ? "Español" : "English"}
          </MenuItem>
        ))}
      </div>
      <MenuHeading>{t("user.theme")}</MenuHeading>
      <div role="group" aria-label={t("user.theme")}>
        {themes.map(([k, label, Icon]) => (
          <MenuItem key={k} role="menuitemradio" checked={theme.pref === k} icon={<Icon size={14} />} onSelect={() => theme.setPref(k)} trailing={theme.pref === k ? "✓" : undefined}>
            {label}
          </MenuItem>
        ))}
      </div>
      <MenuSep />
      <MenuLink to="/docs" icon={<BookOpen size={15} />}>
        {t("nav.docs")}
      </MenuLink>
      <MenuItem icon={<HelpCircle size={15} />} onSelect={ui.openOnboarding}>
        {t("user.help")}
      </MenuItem>
      <MenuItem icon={<Keyboard size={15} />} onSelect={ui.openShortcuts}>
        {t("help.shortcuts")}
      </MenuItem>
      <MenuSep />
      <MenuItem
        icon={<LogOut size={15} />}
        onSelect={() => {
          void signOutEverywhere();
          session.signOut();
          nav("/signed-out");
        }}
      >
        {t("user.logout")}
      </MenuItem>
    </Popover>
  );
}
