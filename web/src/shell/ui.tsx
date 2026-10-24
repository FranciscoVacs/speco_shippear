// Small accessible UI primitives shared by the shell and the settings pages: Popover (menus and panels),
// Dialog (modal with focus trap), Avatar, DemoLabel.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type ReactNode, type Ref } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { X, FlaskConical } from "lucide-react";
import { useT } from "../i18n";

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ITEM = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])';

// ---------------------------------------------------------------- Avatar
const HUES = [210, 262, 330, 20, 150, 190, 45];
export function Avatar({ name, size = 24, square = false }: { name: string; size?: number; square?: boolean }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  const hue = HUES[h % HUES.length];
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
    background: `hsl(${hue} 55% 38%)`,
    borderRadius: square ? Math.round(size * 0.28) : "50%",
  };
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {ini}
    </span>
  );
}

// ---------------------------------------------------------------- Demo label (FR-014)
export function DemoLabel({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span className={"demo-label " + className} data-testid="demo-label" title={t("demo.title")}>
      <FlaskConical size={12} aria-hidden="true" /> {t("demo.label")}
    </span>
  );
}

// ---------------------------------------------------------------- Popover
interface TriggerProps {
  ref: Ref<HTMLButtonElement>;
  id: string;
  onClick: () => void;
  onKeyDown: (e: RKeyboardEvent<HTMLButtonElement>) => void;
  "aria-haspopup": "menu" | "dialog";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
}
interface PopoverApi {
  close: (refocus?: boolean) => void;
}
const PopoverCtx = createContext<PopoverApi>({ close: () => undefined });
export const usePopover = () => useContext(PopoverCtx);

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start";

interface PopoverProps {
  trigger: (p: TriggerProps, open: boolean) => ReactNode;
  children: ReactNode;
  /** accessible name of the panel */
  label: string;
  role?: "menu" | "dialog";
  placement?: Placement;
  className?: string;
  panelClassName?: string;
  /** receives the trigger element (e.g. to return focus to it from elsewhere) */
  triggerRef?: { current: HTMLButtonElement | null };
}

export function Popover({ trigger, children, label, role = "menu", placement = "bottom-start", className = "", panelClassName = "", triggerRef }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const uid = useId();
  const panelId = "pop-" + uid.replace(/:/g, "");

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    if (!p) return;
    const first = role === "menu" ? p.querySelector<HTMLElement>(ITEM) : p.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? p).focus();
  }, [open, role]);

  const onPanelKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (role !== "menu") return;
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  };

  const tp: TriggerProps = {
    ref: (el) => {
      btn.current = el;
      if (triggerRef) triggerRef.current = el;
    },
    id: panelId + "-btn",
    onClick: () => setOpen((o) => !o),
    onKeyDown: (e) => {
      if (role === "menu" && (e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
        e.preventDefault();
        setOpen(true);
      }
    },
    "aria-haspopup": role,
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
  };

  return (
    <div className={"pop " + className} ref={wrap}>
      {trigger(tp, open)}
      {open && (
        <PopoverCtx.Provider value={{ close }}>
          <div
            ref={panel}
            id={panelId}
            className={`pop-panel pl-${placement} ${panelClassName}`}
            role={role}
            aria-label={label}
            aria-labelledby={undefined}
            tabIndex={-1}
            onKeyDown={onPanelKey}
          >
            {children}
          </div>
        </PopoverCtx.Provider>
      )}
    </div>
  );
}

interface ItemBase {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  trailing?: ReactNode;
}
export function MenuItem({ onSelect, children, icon, trailing, className = "", role = "menuitem", checked, danger }: ItemBase & { onSelect: () => void; role?: "menuitem" | "menuitemradio"; checked?: boolean; danger?: boolean }) {
  const { close } = usePopover();
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitemradio" ? !!checked : undefined}
      className={"mi " + (danger ? "danger " : "") + className}
      tabIndex={-1}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      <span className="mi-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mi-label">{children}</span>
      {trailing && <span className="mi-trail">{trailing}</span>}
    </button>
  );
}
export function MenuLink({ to, children, icon, trailing, className = "", ...rest }: ItemBase & Omit<LinkProps, "className" | "children">) {
  const { close } = usePopover();
  return (
    <Link {...rest} to={to} role="menuitem" className={"mi " + className} tabIndex={-1} onClick={() => close(false)}>
      <span className="mi-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mi-label">{children}</span>
      {trailing && <span className="mi-trail">{trailing}</span>}
    </Link>
  );
}
export function MenuSep() {
  return <div className="mi-sep" role="separator" />;
}
export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mi-heading" aria-hidden="true">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Dialog
interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Dialog({ title, description, onClose, children, footer, wide }: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const body = ref.current?.querySelector<HTMLElement>("[data-autofocus], .dlg-body input, .dlg-body select, .dlg-body textarea");
    (body ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE) ?? ref.current)?.focus();
    return () => {
      document.body.style.overflow = prev;
      const o = openerRef.current;
      if (o && document.contains(o)) o.focus();
    };
  }, []);

  const onKeyDown = (e: RKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const a = document.activeElement;
    if (e.shiftKey && (a === first || !ref.current?.contains(a))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (a === last || !ref.current?.contains(a))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div
        ref={ref}
        className={"modal dlg" + (wide ? " wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dlg-t-${uid}`}
        aria-describedby={description ? `dlg-d-${uid}` : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="dlg-head">
          <div>
            <h2 id={`dlg-t-${uid}`}>{title}</h2>
            {description && (
              <p id={`dlg-d-${uid}`} className="muted">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="icon-btn ghost" onClick={onClose} aria-label={t("common.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </div>
  );
}
