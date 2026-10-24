// Collapsible sidebar (FR-008): tenant switcher, search/palette trigger, navigation, repositories, promo, user row.
import { cloudEnabled } from "../cloud/config";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Bell, ChevronLeft, Fingerprint, FolderGit2, GaugeCircle, Home, Receipt, KeyRound, LayoutDashboard, ListChecks, ListTree, Plug, Scale, Search, Settings, Users, UserRound, X } from "lucide-react";
import { useT, type Key } from "../i18n";
import { DEMO_REPOS, useSession } from "./session";
import { useBello } from "../bello/store";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { Notifications } from "./Notifications";
import { Avatar } from "./ui";
import { Logo } from "./Logo";
import { useUI } from "./UIContext";
import { useData } from "../DataContext";
import { mod } from "./platform";

const ICON = 16;

function SbLink({ to, active, icon, label, onNavigate, badge, badgeLabel }: { to: string; active: boolean; icon: ReactNode; label: string; onNavigate?: () => void; badge?: number; badgeLabel?: string }) {
  return (
    <Link to={to} className={"sb-link" + (active ? " active" : "")} aria-current={active ? "page" : undefined} data-tip={label} onClick={onNavigate}>
      <span className="sb-ico" aria-hidden="true">
        {icon}
      </span>
      <span className="sb-label">{label}</span>
      {badge ? (
        <span className="sb-badge" title={badgeLabel}>
          {badge}
          <span className="sr-only"> — {badgeLabel}</span>
        </span>
      ) : null}
    </Link>
  );
}

interface Props {
  embedded: boolean;
  /** off-canvas drawer open (<= 900px) */
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  /** desktop: the first steps checklist lives here so it never covers the page (spec 012) */
  checklist?: boolean;
}

export function Sidebar({ embedded, drawerOpen, onCloseDrawer }: Props) {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const { loader } = useData();
  const pendingChanges = useBello().regChanges.filter((c) => c.state === "nuevo").length;
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const path = loc.pathname;
  const repoParam = new URLSearchParams(loc.search).get("repo");
  const inSettings = path.startsWith("/settings");

  // Drawer: Esc closes it, and focus moves inside when it opens.
  useEffect(() => {
    if (!drawerOpen) return;
    ref.current?.querySelector<HTMLElement>(".sb-link, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[aria-modal=true]")) onCloseDrawer();
      if (e.key !== "Tab" || !ref.current) return;
      // focus trap: the rest of the page is inert while the drawer is open
      const nodes = [...ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const a = document.activeElement;
      const inDrawer = !!a && ref.current.contains(a);
      if (e.shiftKey && (a === nodes[0] || !inDrawer)) {
        e.preventDefault();
        nodes[nodes.length - 1].focus();
      } else if (!e.shiftKey && (a === nodes[nodes.length - 1] || !inDrawer)) {
        e.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, onCloseDrawer]);

  const firstId = loader?.features[0]?.id;
  const reviewsTo = embedded && firstId ? `/reviews/${encodeURIComponent(firstId)}` : "/reviews";
  // the cloud lists the company's own repositories, never the demo's
  const repoList: readonly string[] = loader?.mode === "cloud" ? [...new Set(loader.features.map((f) => f.repo ?? ""))].filter(Boolean).sort() : DEMO_REPOS;
  const nav = (to: string, key: Key, icon: ReactNode, active: boolean) => <SbLink key={to} to={to} label={t(key)} icon={icon} active={active} onNavigate={onCloseDrawer} />;

  const settingsItems: [string, Key, ReactNode][] = [
    ["/settings/general", "settings.general", <Settings size={ICON} />],
    ["/settings/members", "settings.members", <Users size={ICON} />],
    ["/settings/api-keys", "settings.apiKeys", <KeyRound size={ICON} />],
    ["/settings/integrations", "settings.integrations", <Plug size={ICON} />],
    ["/settings/usage", "settings.usage", <GaugeCircle size={ICON} />],
    ...(cloudEnabled() ? ([["/settings/billing", "settings.billing", <Receipt size={ICON} />]] as [string, Key, ReactNode][]) : []),
    ["/settings/notifications", "settings.notifications", <Bell size={ICON} />],
    ["/settings/profile", "settings.profile", <UserRound size={ICON} />],
  ];

  return (
    <div className="sidebar" id="sidebar" ref={ref}>
      <div className="sb-top">
        {embedded ? (
          <div className="brand">
            <Logo size={24} />
            <span className="brand-name">Spec Reviewer</span>
          </div>
        ) : (
          <TenantSwitcher />
        )}
        <button type="button" className="icon-btn ghost sb-close" onClick={onCloseDrawer} aria-label={t("common.close")}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="sb-search" onClick={ui.openPalette} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" data-tip={t("search.label")}>
        <Search size={ICON} aria-hidden="true" />
        <span className="sb-label">{t("search.placeholder")}</span>
        <kbd className="sb-kbd" aria-hidden="true">
          {mod === "Ctrl" ? "Ctrl K" : "⌘K"}
        </kbd>
      </button>

      <nav className="sb-nav" aria-label={t("nav.label")}>
        {embedded ? (
          <>
            {nav(reviewsTo, "nav.review", <ListChecks size={ICON} />, path.startsWith("/reviews"))}
            {nav("/rules", "nav.rules", <Scale size={ICON} />, path.startsWith("/rules"))}
            {nav("/docs", "nav.docs", <BookOpen size={ICON} />, path.startsWith("/docs"))}
          </>
        ) : inSettings ? (
          <>
            <Link to="/" className="sb-back" onClick={onCloseDrawer} data-tip={t("nav.back")}>
              <ChevronLeft size={ICON} aria-hidden="true" />
              <span className="sb-label">{t("nav.settings")}</span>
              <span className="sr-only"> — {t("nav.back")}</span>
            </Link>
            {settingsItems.map(([to, key, icon]) => nav(to, key, icon, path === to))}
          </>
        ) : (
          <>
            <SbLink to="/" label="Inicio" icon={<Home size={ICON} />} active={path === "/"} onNavigate={onCloseDrawer} />
            <SbLink to="/dashboard" label="Dashboard" icon={<LayoutDashboard size={ICON} />} active={path === "/dashboard"} onNavigate={onCloseDrawer} />
            <SbLink to="/specs" label="Árbol de specs" icon={<ListTree size={ICON} />} active={path === "/specs" && !repoParam} onNavigate={onCloseDrawer} />
            <SbLink to="/reglas" label="Reglas y normativa" icon={<Scale size={ICON} />} active={path === "/reglas"} onNavigate={onCloseDrawer} badge={pendingChanges || undefined} badgeLabel={pendingChanges ? `${pendingChanges} cambios normativos sin analizar` : undefined} />
            <SbLink to="/trazabilidad" label="Trazabilidad" icon={<Fingerprint size={ICON} />} active={path === "/trazabilidad"} onNavigate={onCloseDrawer} />
            <div className="sb-section" role="group" aria-labelledby="sb-repos">
              <div className="sb-heading" id="sb-repos">
                {t("nav.repos")}
              </div>
              {repoList.map((r) => (
                <SbLink key={r} to={`/specs?repo=${encodeURIComponent(r)}`} label={r} icon={<FolderGit2 size={ICON} />} active={path === "/specs" && repoParam === r} onNavigate={onCloseDrawer} />
              ))}
            </div>
            <SbLink to="/settings/general" label={t("nav.settings")} icon={<Settings size={ICON} />} active={false} onNavigate={onCloseDrawer} />
          </>
        )}
      </nav>


      {!embedded && (
        <div className="sb-user">
          <div className="sb-who">
            <Avatar name={s.user.name} size={24} />
            <span className="sb-label sb-username">{s.user.name}</span>
          </div>
          <div className="sb-user-actions">
            <UserMenu placement="top-start" />
            <Notifications placement="top-start" className="sb-bell" />
          </div>
        </div>
      )}
    </div>
  );
}
