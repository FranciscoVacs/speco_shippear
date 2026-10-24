// Notifications bell + popover (FR-012). Simulated events from session.ts.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, Check, ListChecks, UserPlus, KeyRound, GaugeCircle, Plug, Mail, CreditCard } from "lucide-react";
import { useT, type Key } from "../i18n";
import { session, unreadCount, useSession, type NotifKind } from "./session";
import { fmtAgo } from "./format";
import { Popover, usePopover, type Placement } from "./ui";


const ICONS: Record<NotifKind, typeof Bell> = {
  review_done: ListChecks,
  member_joined: UserPlus,
  key_created: KeyRound,
  usage_80: GaugeCircle,
  integration: Plug,
  invite_sent: Mail,
  plan_renewal: CreditCard,
};

export function Notifications({ placement = "bottom-end", className = "" }: { placement?: Placement; className?: string }) {
  const t = useT();
  const s = useSession();
  const unread = unreadCount(s);
  return (
    <Popover
      role="dialog"
      label={t("notif.title")}
      placement={placement}
      className={className}
      panelClassName="notif-panel"
      trigger={(p, open) => (
        <button {...p} type="button" className={"icon-btn" + (open ? " on" : "")} aria-label={unread ? t("notif.bellUnread", { n: unread }) : t("notif.bell")} title={t("notif.title")}>
          <Bell size={16} aria-hidden="true" />
          {unread > 0 && <span className="dot" data-testid="unread-dot" aria-hidden="true" />}
        </button>
      )}
    >
      <NotifBody />
    </Popover>
  );
}

function NotifBody() {
  const t = useT();
  const s = useSession();
  const nav = useNavigate();
  const { close } = usePopover();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const unread = unreadCount(s);
  const list = tab === "unread" ? s.notifications.filter((n) => !n.read) : s.notifications;
  return (
    <>
      <div className="np-head">
        <h2>{t("notif.title")}</h2>
        <button type="button" className="link" disabled={unread === 0} onClick={() => session.markAllRead()}>
          <CheckCheck size={14} aria-hidden="true" /> {t("notif.markAll")}
        </button>
      </div>
      <div className="np-tabs" role="tablist" aria-label={t("notif.title")}>
        {(["all", "unread"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "on" : ""}
            onClick={() => setTab(k)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const other = k === "all" ? "unread" : "all";
                setTab(other);
                (e.currentTarget.parentElement?.querySelector(`[data-tab=${other}]`) as HTMLElement | null)?.focus();
              }
            }}
            data-tab={k}
            tabIndex={tab === k ? 0 : -1}
          >
            {k === "all" ? t("notif.all") : t("notif.unread")}
            {k === "unread" && unread > 0 && <span className="count">{unread}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="np-list">
        {list.length === 0 ? (
          <div className="np-empty">
            <BellOff size={22} aria-hidden="true" />
            <strong>{tab === "unread" ? t("notif.emptyUnread") : t("notif.empty")}</strong>
            <p>{t("notif.emptyHint")}</p>
          </div>
        ) : (
          <ul>
            {list.map((n) => {
              const Icon = ICONS[n.kind];
              return (
                <li key={n.id} className={n.read ? "read" : "unread"}>
                  <button
                    type="button"
                    className="np-main"
                    onClick={() => {
                      session.markRead(n.id);
                      close(false);
                      nav(n.href);
                    }}
                  >
                    <span className="np-ico" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="np-text">
                      <span>{t(("notif." + n.kind) as Key, n.vars)}</span>
                      <span className="muted small">{fmtAgo(t, n.minutesAgo)}</span>
                    </span>
                    {!n.read && <span className="np-dot" aria-hidden="true" />}
                    {!n.read && <span className="sr-only">{t("notif.unreadOne")}</span>}
                  </button>
                  {!n.read && (
                    <button type="button" className="icon-btn ghost sm" onClick={() => session.markRead(n.id)} aria-label={t("notif.markOne")} title={t("notif.markOne")}>
                      <Check size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
