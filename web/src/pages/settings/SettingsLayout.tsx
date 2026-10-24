// /settings/*: the sidebar swaps to the settings sections; on narrow screens a tab strip does the same job.
import { Outlet, NavLink } from "react-router-dom";
import { useT, type Key } from "../../i18n";
import { cloudEnabled } from "../../cloud/config";

const TABS: [string, Key][] = [
  ["general", "settings.general"],
  ["members", "settings.members"],
  ["api-keys", "settings.apiKeys"],
  ["integrations", "settings.integrations"],
  ["usage", "settings.usage"],
  ["billing", "settings.billing"],
  ["notifications", "settings.notifications"],
  ["profile", "settings.profile"],
];

export default function SettingsLayout() {
  const t = useT();
  return (
    <div className="page page-settings">
      <nav className="settings-tabs" aria-label={t("nav.settings")}>
        {TABS.filter(([to]) => to !== "billing" || cloudEnabled()).map(([to, key]) => (
          <NavLink key={to} to={`/settings/${to}`}>
            {t(key)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
