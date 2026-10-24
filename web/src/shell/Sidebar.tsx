// Collapsible sidebar (FR-008): tenant switcher, search/palette trigger, navigation, repositories, promo, user row.
import { cloudEnabled } from "../cloud/config";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Bell, ChevronLeft, ChevronRight, Bot, Gavel, FolderGit2, GaugeCircle, Home, Lightbulb, Receipt, KeyRound, ListChecks, Plug, Scale, ScrollText, Search, ShieldCheck, Settings, Users, UserRound, X } from "lucide-react";
import { useT, type Key } from "../i18n";
import { DEMO_REPOS, session, useSession } from "./session";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { Notifications } from "./Notifications";
import { Avatar } from "./ui";
import { Logo } from "./Logo";
import { useUI } from "./UIContext";
import { useData } from "../DataContext";
import { Checklist } from "../activation/Checklist";
import { mod } from "./platform";
import { mine, useDecisions } from "../decision/useDecisions";
import { tn } from "../decision/ui";
import { useDisclosure } from "./Collapsible";

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

export function Sidebar({ embedded, drawerOpen, onCloseDrawer, checklist }: Props) {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const { loader } = useData();
  const pending = useDecisions().items.reduce((n, x) => n + mine(x.report).length, 0);
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const path = loc.pathname;
  const repoParam = new URLSearchParams(loc.search).get("repo");
  const inSettings = path.startsWith("/settings");
  // Simple by default (NFR-001, NFR-008): three entries; the rest sits behind "Más", remembered, and open while you are on it.
  const onSecondary = path.startsWith("/rules") || path.startsWith("/docs") || !!repoParam;
  const [more, setMore] = useDisclosure("nav-more", false, onSecondary);

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
            {nav("/", "nav.home", <Home size={ICON} />, path === "/")}
            <SbLink to="/decisions" label={t("nav.decisions")} icon={<Gavel size={ICON} />} active={path.startsWith("/decisions")} onNavigate={onCloseDrawer} badge={pending || undefined} badgeLabel={pending ? tn(t, "dec.badge", pending) : undefined} />
            {nav("/ledger", "nav.ledger", <ScrollText size={ICON} />, path.startsWith("/ledger"))}
            {nav("/reviews", "nav.reviews", <ListChecks size={ICON} />, path.startsWith("/reviews") && !(path === "/reviews" && repoParam))}
            {cloudEnabled() && nav("/ideas", "nav.ideas", <Lightbulb size={ICON} />, path.startsWith("/ideas"))}
            <button type="button" className="sb-more" aria-expanded={more} aria-controls="sb-secondary" onClick={() => setMore(!more)} data-tip={t(more ? "nav.less" : "nav.more")}>
              <span className="sb-ico" aria-hidden="true">
                <ChevronRight size={ICON} />
              </span>
              <span className="sb-label">{t(more ? "nav.less" : "nav.more")}</span>
            </button>
            <div id="sb-secondary" hidden={!more}>
              {more && (
                <>
                  {nav("/portrait", "nav.portrait", <ShieldCheck size={ICON} />, path.startsWith("/portrait"))}
                  {cloudEnabled() && nav("/agents", "nav.agents", <Bot size={ICON} />, path.startsWith("/agents"))}
                  {nav("/rules", "nav.rules", <Scale size={ICON} />, path.startsWith("/rules"))}
                  {nav("/docs", "nav.docs", <BookOpen size={ICON} />, path.startsWith("/docs"))}
                  {nav("/settings/general", "nav.settings", <Settings size={ICON} />, false)}
                  <div className="sb-section" role="group" aria-labelledby="sb-repos">
                    <div className="sb-heading" id="sb-repos">
                      {t("nav.repos")}
                    </div>
                    {repoList.map((r) => (
                      <SbLink key={r} to={`/reviews?repo=${encodeURIComponent(r)}`} label={r} icon={<FolderGit2 size={ICON} />} active={path === "/reviews" && repoParam === r} onNavigate={onCloseDrawer} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </nav>

      {!embedded && checklist && <Checklist />}

      {!embedded && !s.promoDismissed && more && (
        <div className="promo" role="region" aria-label={t("promo.title")}>
          <button type="button" className="icon-btn ghost sm promo-x" onClick={() => session.dismissPromo()} aria-label={t("promo.dismiss")}>
            <X size={14} aria-hidden="true" />
          </button>
          <strong>{t("promo.title")}</strong>
          <p>{t("promo.body")}</p>
          <button
            type="button"
            className="btn primary block"
            onClick={() => {
              ui.toast(t("promo.installed"));
              session.dismissPromo();
            }}
          >
            {t("promo.install")}
          </button>
        </div>
      )}

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
