import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useT, type Key } from "../../i18n";
import { PLAN_LIMITS, currentTenant, session, useSession, type Role } from "../../shell/session";
import { Avatar, Dialog } from "../../shell/ui";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";

const ROLES: Role[] = ["admin", "member", "viewer"];
const roleKey = (r: Role) => ("role." + r) as Key;

export default function Members() {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const limit = PLAN_LIMITS[currentTenant(s).plan].seats;
  return (
    <>
      <PageHeader
        title={t("settings.members")}
        description={t("members.desc", { n: s.members.length, max: limit })}
        demo
        actions={
          <button type="button" className="btn primary" onClick={() => setInviting(true)}>
            <UserPlus size={14} aria-hidden="true" /> {t("members.invite")}
          </button>
        }
      />
      <div className="card">
        <div className="table-wrap flush">
          <table className="data-table">
            <caption className="sr-only">{t("settings.members")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("members.member")}</th>
                <th scope="col">{t("members.role")}</th>
                <th scope="col">{t("members.status")}</th>
                <th scope="col">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="who">
                      <Avatar name={m.name} size={28} />
                      <div>
                        <div className="who-name">{m.name}</div>
                        <div className="muted small">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {m.role === "owner" ? (
                      <span>{t("role.owner")}</span>
                    ) : (
                      <select
                        value={m.role}
                        aria-label={t("members.roleOf", { name: m.name })}
                        onChange={(e) => {
                          session.setMemberRole(m.id, e.target.value as Role);
                          ui.toast(t("members.roleChanged", { name: m.name }));
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(roleKey(r))}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={"status " + (m.status === "active" ? "ok" : "pending")}>
                      <span className="status-dot" aria-hidden="true" /> {m.status === "active" ? t("members.active") : t("members.invited")}
                    </span>
                  </td>
                  <td className="actions">
                    {m.role === "owner" ? null : confirm === m.id ? (
                      <span className="inline-confirm" role="group" aria-label={t("members.confirmRemove", { name: m.name })}>
                        <span className="small">{t("members.confirmRemove", { name: m.name })}</span>
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() => {
                            session.removeMember(m.id);
                            setConfirm(null);
                            ui.toast(t("members.removed", { name: m.name }));
                          }}
                        >
                          {t("members.remove")}
                        </button>
                        <button type="button" className="btn sm" onClick={() => setConfirm(null)}>
                          {t("common.cancel")}
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn sm" onClick={() => setConfirm(m.id)} aria-label={`${t("members.remove")}: ${m.name}`}>
                        {t("members.remove")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ui = useUI();
  const s = useSession();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const dup = s.members.some((m) => m.email.toLowerCase() === email.trim().toLowerCase());
  const submit = () => {
    if (!valid || dup) return;
    session.inviteMember(email.trim(), role);
    ui.toast(t("members.invitedToast", { email: email.trim() }));
    onClose();
  };
  return (
    <Dialog
      title={t("members.invite")}
      description={t("members.inviteDesc")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn primary" disabled={!valid || dup} onClick={submit}>
            {t("members.sendInvite")}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>{t("members.email")}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@example.com" autoComplete="off" />
          {dup && <small className="err">{t("members.dup")}</small>}
        </label>
        <label className="field">
          <span>{t("members.role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(roleKey(r))}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{t("demo.simulated")}</p>
      </form>
    </Dialog>
  );
}
