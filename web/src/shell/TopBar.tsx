// Top bar per page: sidebar toggle + breadcrumbs on the left; docs, help, panel, notifications, language and theme on the right.
import { Fragment, useEffect, useState } from "react";
import { Link, useLocation, useMatch } from "react-router-dom";
import { BookOpen, ChevronRight, Menu, Moon, PanelLeft, PanelRight, QrCode, Sun } from "lucide-react";
import { useLang, useT, type Key } from "../i18n";
import { useData } from "../DataContext";
import { useTheme } from "./theme";
import { HelpMenu } from "./HelpMenu";
import { QrDialog } from "./QrDialog";
import { Notifications } from "./Notifications";
import { CreditsPill } from "./CreditsPill";
import { usePanel } from "./usePanel";
import { mod } from "./platform";

interface Crumb {
  label: string;
  to?: string;
}

function useCrumbs(embedded: boolean): Crumb[] {
  const t = useT();
  const { loader } = useData();
  const loc = useLocation();
  const review = useMatch("/reviews/:featureId");
  const rule = useMatch("/rules/:ruleId");
  const p = loc.pathname;
  if (review) {
    const id = decodeURIComponent(review.params.featureId ?? "");
    const f = loader?.features.find((x) => x.id === id) ?? (embedded ? loader?.features[0] : undefined);
    const crumbs: Crumb[] = embedded ? [{ label: t("nav.review") }] : [{ label: t("nav.reviews"), to: "/reviews" }];
    if (!embedded && f?.repo) crumbs.push({ label: f.repo, to: `/reviews?repo=${encodeURIComponent(f.repo)}` });
    crumbs.push({ label: f?.feature ?? id });
    return crumbs;
  }
  if (p === "/") return [{ label: t("nav.home") }];
  if (p === "/decisions") return [{ label: t("nav.decisions") }];
  if (p === "/ledger") return [{ label: t("nav.ledger") }];
  if (p === "/reviews") return [{ label: t("nav.reviews") }];
  if (rule) return [{ label: t("nav.rules"), to: "/rules" }, { label: decodeURIComponent(rule.params.ruleId ?? "") }];
  if (p === "/rules") return [{ label: t("nav.rules") }];
  if (p === "/bello") return [{ label: "Bello · Demo" }];
  if (p.startsWith("/bello/")) {
    const sub: Record<string, string> = { specs: "Árbol de specs", reglas: "Reglas y normativa", trazabilidad: "Trazabilidad", asistente: "Asistente" };
    return [{ label: "Bello · Demo", to: "/bello" }, { label: sub[p.slice(7)] ?? p.slice(7) }];
  }
  if (p === "/connect") return [{ label: t("connect.title") }];
  if (p === "/portrait") return [{ label: t("nav.portrait") }];
  if (p === "/agents") return [{ label: t("nav.agents") }];
  if (p === "/ideas") return [{ label: t("nav.ideas") }];
  if (p.startsWith("/ideas/")) return [{ label: t("nav.ideas"), to: "/ideas" }, { label: t("idea.crumb") }];
  if (p === "/docs") return [{ label: t("nav.docs") }];
  if (p === "/docs/developers") return [{ label: t("nav.docs"), to: "/docs" }, { label: t("dev.title") }];
  if (p === "/docs/product") return [{ label: t("nav.docs"), to: "/docs" }, { label: t("pm.title") }];
  if (p.startsWith("/settings/")) {
    const sub = p.split("/")[2];
    const map: Record<string, Key> = {
      general: "settings.general",
      members: "settings.members",
      "api-keys": "settings.apiKeys",
      integrations: "settings.integrations",
      usage: "settings.usage",
      billing: "settings.billing",
      notifications: "settings.notifications",
      profile: "settings.profile",
    };
    return [{ label: t("nav.settings"), to: "/settings/general" }, { label: map[sub] ? t(map[sub]) : sub }];
  }
  return [{ label: t("notfound.crumb") }];
}

interface Props {
  embedded: boolean;
  hasPanel: boolean;
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  mobile: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({ embedded, hasPanel, sidebarCollapsed, drawerOpen, mobile, onToggleSidebar }: Props) {
  const t = useT();
  const { lang, setLang } = useLang();
  const theme = useTheme();
  const panel = usePanel();
  const [qrOpen, setQrOpen] = useState(false);
  const crumbs = useCrumbs(embedded);
  const pageTitle = crumbs[crumbs.length - 1]?.label;
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · Spec Reviewer` : "Spec Reviewer";
  }, [pageTitle]);
  return (
    <>
    <header className="topbar">
      <div className="tb-left">
        <button
          type="button"
          id="sb-toggle"
          className="icon-btn ghost sb-toggle"
          onClick={onToggleSidebar}
          aria-label={t("sidebar.toggle")}
          aria-controls="sidebar"
          aria-expanded={mobile ? drawerOpen : !sidebarCollapsed}
          title={`${t("sidebar.toggle")} (${mod}+B)`}
        >
          <PanelLeft size={16} className="ic-desktop" aria-hidden="true" />
          <Menu size={16} className="ic-mobile" aria-hidden="true" />
        </button>
        <nav className="crumbs" aria-label={t("crumbs.label")}>
          <ol>
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <li className="sep" aria-hidden="true">
                    <ChevronRight size={13} />
                  </li>
                )}
                <li className={i === crumbs.length - 1 ? "last" : ""}>
                  {c.to && i < crumbs.length - 1 ? (
                    <Link to={c.to}>{c.label}</Link>
                  ) : (
                    <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>
                  )}
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
      </div>
      <div className="tb-right">
        <Link to="/docs" className="btn ghost hide-md tb-docs">
          <BookOpen size={15} aria-hidden="true" /> {t("nav.docs")}
        </Link>
        {!embedded && (
          <button type="button" className="btn ghost" onClick={() => setQrOpen(true)} data-testid="qr-btn" title={t("qr.title")}>
            <QrCode size={15} aria-hidden="true" /> <span className="hide-sm">{t("qr.btn")}</span>
          </button>
        )}
        <HelpMenu />
        {hasPanel && (
          <button
            type="button"
            className={"icon-btn" + (panel.open ? " on" : "")}
            onClick={panel.toggle}
            aria-expanded={panel.open}
            aria-controls="agent-panel"
            aria-keyshortcuts="Control+J Meta+J"
            aria-label={t("panel.toggle")}
            title={`${t("panel.toggle")} (${mod}+J)`}
            data-testid="panel-toggle"
          >
            <PanelRight size={16} aria-hidden="true" />
          </button>
        )}
        {!embedded && <CreditsPill />}
        {!embedded && <Notifications placement="bottom-end" className="tb-bell" />}
        <div className="seg lang" role="group" aria-label={t("user.language")}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l} title={l === "es" ? "Español" : "English"}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={theme.toggle}
          aria-label={theme.resolved === "dark" ? t("theme.toLight") : t("theme.toDark")}
          title={theme.resolved === "dark" ? t("theme.toLight") : t("theme.toDark")}
        >
          {theme.resolved === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>
      </div>
    </header>
    {qrOpen && <QrDialog onClose={() => setQrOpen(false)} />}
    </>
  );
}
