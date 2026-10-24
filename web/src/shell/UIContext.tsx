// Shell-wide UI state: toasts (aria-live), and the dialogs that the Help menu, the user menu and shortcuts open.
// The first visit no longer opens the introduction dialog: the first steps checklist (src/activation) takes its place (spec 012).
import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useT } from "../i18n";
import { Onboarding } from "../Onboarding";
import { Dialog } from "./ui";
import { isMac, mod } from "./platform";

const loadPalette = () => import("./CommandPalette");
const CommandPalette = lazy(loadPalette);

interface UI {
  toast: (msg: string) => void;
  openOnboarding: () => void;
  openShortcuts: () => void;
  openChangelog: () => void;
  openSupport: () => void;
  openPalette: () => void;
  togglePalette: () => void;
  onboardingOpen: boolean;
  /** the Help button of the top bar: focus goes back there when the introduction closes */
  helpRef: MutableRefObject<HTMLButtonElement | null>;
}
const Ctx = createContext<UI | null>(null);
export const useUI = (): UI => {
  const c = useContext(Ctx);
  if (!c) throw new Error("UIProvider missing");
  return c;
};

type DialogName = "shortcuts" | "changelog" | "support" | null;

export function UIProvider({ children, onOpenGuide }: { children: ReactNode; onOpenGuide: () => void }) {
  const t = useT();
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [palette, setPalette] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const helpRef = useRef<HTMLButtonElement | null>(null);
  const seq = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = ++seq.current;
    setToasts((l) => [...l.slice(-2), { id, msg }]);
    window.setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);

  const value = useMemo<UI>(
    () => ({
      toast,
      openOnboarding: () => setOnboarding(true),
      openShortcuts: () => setDialog("shortcuts"),
      openChangelog: () => setDialog("changelog"),
      openSupport: () => setDialog("support"),
      openPalette: () => setPalette(true),
      togglePalette: () => setPalette((p) => !p),
      onboardingOpen: onboarding,
      helpRef,
    }),
    [toast, onboarding],
  );

  // warm the palette chunk up so Ctrl+K opens instantly (it is not part of the first paint)
  useEffect(() => {
    const id = window.setTimeout(() => void loadPalette(), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // "?" opens the shortcuts dialog unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("[aria-modal=true]")) return;
      e.preventDefault();
      setDialog("shortcuts");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={value}>
      {children}
      {palette && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPalette(false)} />
        </Suspense>
      )}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === "changelog" && <ChangelogDialog onClose={() => setDialog(null)} />}
      {dialog === "support" && <SupportDialog onClose={() => setDialog(null)} onSent={() => toast(t("support.sent"))} />}
      {onboarding && (
        <Onboarding
          onClose={() => setOnboarding(false)}
          fallbackFocus={() => helpRef.current}
          onOpenGuide={() => {
            setOnboarding(false);
            onOpenGuide();
          }}
        />
      )}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((x) => (
          <div key={x.id} className="toast">
            {x.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const rows: [string[], string][] = [
    [[mod, "K"], t("sc.palette")],
    [[mod, "J"], t("sc.panel")],
    [[mod, "B"], t("sc.sidebar")],
    [["?"], t("sc.help")],
    [["↑", "↓"], t("sc.arrows")],
    [["Enter"], t("sc.enter")],
    [["Esc"], t("sc.esc")],
  ];
  return (
    <Dialog title={t("sc.title")} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>{t("common.close")}</button>}>
      <table className="kbd-table">
        <caption className="sr-only">{t("sc.title")}</caption>
        <tbody>
          {rows.map(([keys, label]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>
                {keys.map((k, i) => (
                  <span key={i}>
                    {i > 0 && <span className="muted"> + </span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{isMac ? t("sc.macnote") : t("sc.winnote")}</p>
    </Dialog>
  );
}

function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const items = [
    { v: "0.9.0", d: t("cl.date1"), title: t("cl.t1"), body: t("cl.b1") },
    { v: "0.8.2", d: t("cl.date2"), title: t("cl.t2"), body: t("cl.b2") },
    { v: "0.8.0", d: t("cl.date3"), title: t("cl.t3"), body: t("cl.b3") },
  ];
  return (
    <Dialog title={t("cl.title")} description={t("cl.desc")} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>{t("common.close")}</button>}>
      <ol className="changelog">
        {items.map((i) => (
          <li key={i.v}>
            <div className="cl-meta">
              <code>v{i.v}</code>
              <span className="muted">{i.d}</span>
            </div>
            <strong>{i.title}</strong>
            <p>{i.body}</p>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

function SupportDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const t = useT();
  const [msg, setMsg] = useState("");
  return (
    <Dialog
      title={t("support.title")}
      description={t("support.desc")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn primary"
            disabled={!msg.trim()}
            onClick={() => {
              onSent();
              onClose();
            }}
          >
            {t("support.send")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("support.label")}</span>
        <textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t("support.placeholder")} />
      </label>
    </Dialog>
  );
}
