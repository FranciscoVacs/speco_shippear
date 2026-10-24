// Application shell (FR-008, FR-016): sidebar + top bar + page + right-hand agent panel container.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { PanelRight, Sparkles, X } from "lucide-react";
import { useT } from "../i18n";
import { AgentSlot, type AgentContext } from "../agent/AgentSlot";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { UIProvider, useUI } from "./UIContext";
import { closePanelSheet, usePanel } from "./usePanel";
import { useSession } from "./session";
import { storage } from "./storage";
import { Skeleton } from "../States";
import { agentEnabled } from "../agent/store";
import { Checklist, useActivationWatcher } from "../activation/Checklist";
import { SurveyPrompt } from "../cloud/SurveyPrompt";
import { ValueCheck } from "../cloud/ValueCheck";
import { BelloAssistant } from "../bello/assistant/BelloAssistant";

const isBelloRoute = (p: string) => ["/", "/dashboard", "/specs", "/reglas", "/trazabilidad"].includes(p);

export const SIDEBAR_KEY = "sr-sidebar";
const MOBILE_Q = "(max-width: 900px)";

function useMedia(q: string): boolean {
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener("change", on);
    on();
    return () => m.removeEventListener("change", on);
  }, [q]);
  return v;
}

export function Shell({ embedded }: { embedded: boolean }) {
  const s = useSession();
  const nav = useNavigate();
  if (!embedded && !s.signedIn) return <Navigate to="/signed-out" replace />;
  return (
    <UIProvider onOpenGuide={() => nav("/docs")}>
      <Frame embedded={embedded} />
    </UIProvider>
  );
}

function Frame({ embedded }: { embedded: boolean }) {
  const t = useT();
  const ui = useUI();
  const loc = useLocation();
  const panel = usePanel();
  const mobile = useMedia(MOBILE_Q);
  const [collapsed, setCollapsed] = useState(() => storage.get(SIDEBAR_KEY) === "1");
  const [drawer, setDrawer] = useState(false);
  const review = useMatch("/reviews/:featureId");
  const rule = useMatch("/rules/:ruleId");
  const mainRef = useRef<HTMLElement>(null);
  const p = loc.pathname;
  useActivationWatcher();

  const page: AgentContext["page"] = p === "/" ? "home" : review ? "review" : p === "/reviews" ? "reviews" : rule ? "rule" : p === "/rules" ? "rules" : p === "/docs" ? "docs" : "other";
  // the exported single file has no agent; the hosted demo page (embedded report, memory router) has the simulated one
  const hasPanel = agentEnabled() && p !== "/" && !p.startsWith("/settings");
  const context: AgentContext = {
    page,
    featureId: review ? decodeURIComponent(review.params.featureId ?? "") : null,
    ruleId: rule ? decodeURIComponent(rule.params.ruleId ?? "") : null,
  };

  const toggleSidebar = useCallback(() => {
    if (mobile) setDrawer((d) => !d);
    else
      setCollapsed((c) => {
        storage.set(SIDEBAR_KEY, c ? "0" : "1");
        return !c;
      });
  }, [mobile]);

  // route changes: close the drawer and the panel sheet
  useEffect(() => {
    setDrawer(false);
    closePanelSheet();
  }, [p]);
  useEffect(() => {
    if (!mobile) setDrawer(false);
  }, [mobile]);
  // closing the drawer (Esc, backdrop, X) gives focus back to the hamburger that opened it
  const wasDrawer = useRef(false);
  useEffect(() => {
    if (wasDrawer.current && !drawer) {
      const a = document.activeElement;
      if (!a || a === document.body || document.getElementById("sidebar")?.contains(a)) document.getElementById("sb-toggle")?.focus();
    }
    wasDrawer.current = drawer;
  }, [drawer]);

  // global shortcuts: Ctrl/Cmd + K palette, J panel, B sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        ui.togglePalette();
      } else if (k === "j" && hasPanel) {
        e.preventDefault();
        panel.toggle();
      } else if (k === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ui, hasPanel, panel, toggleSidebar]);

  // the overlay sheet closes with Esc
  const sheetOpen = hasPanel && panel.overlay && panel.open;
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[aria-modal=true]")) panel.setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, panel]);

  const showPanel = hasPanel && panel.open;
  const cls = ["shell", collapsed ? "collapsed" : "", drawer ? "drawer-open" : "", showPanel ? "with-panel" : ""].filter(Boolean).join(" ");

  return (
    <>
      <div className={cls} {...(ui.onboardingOpen ? { inert: "" } : {})}>
        <a
          className="skip"
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            mainRef.current?.focus();
          }}
        >
          {t("skip")}
        </a>
        <Sidebar embedded={embedded} drawerOpen={drawer} onCloseDrawer={() => setDrawer(false)} checklist={!mobile} />
        {drawer && <div className="sb-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />}
        <div className="shell-main" {...(drawer ? { inert: "" } : {})}>
          <TopBar embedded={embedded} hasPanel={hasPanel} sidebarCollapsed={collapsed} drawerOpen={drawer} mobile={mobile} onToggleSidebar={toggleSidebar} />
          <div className="shell-body">
            <main id="main" ref={mainRef} tabIndex={-1} className={p === "/" ? "main-home" : ""}>
              <Suspense fallback={<div className="page"><Skeleton /></div>}>
                <Outlet />
              </Suspense>
            </main>
            {showPanel && (
              <>
                {panel.overlay && <div className="rp-backdrop" onClick={() => panel.setOpen(false)} aria-hidden="true" />}
                <aside id="agent-panel" className={"rpanel" + (panel.overlay ? " sheet" : "")} aria-label={t("panel.title")} data-testid="agent-panel">
                  <div className="rp-head">
                    <span className="rp-title">
                      <Sparkles size={15} aria-hidden="true" /> {t("panel.title")}
                    </span>
                    <button type="button" className="icon-btn ghost" onClick={() => panel.setOpen(false)} aria-label={t("panel.collapse")} title={`${t("panel.collapse")}`}>
                      {panel.overlay ? <X size={16} aria-hidden="true" /> : <PanelRight size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  <div className="rp-body">
                    {isBelloRoute(p) ? <BelloAssistant compact /> : <AgentSlot variant="panel" context={context} />}
                  </div>
                </aside>
              </>
            )}
          </div>
          {!embedded && mobile && <Checklist floating />}
          {!embedded && <SurveyPrompt />}
          {!embedded && <ValueCheck />}
        </div>
      </div>
    </>
  );
}
