// Workspace (tenant) switcher with plan badge (FR-009). Simulated.
import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Users } from "lucide-react";
import { useT } from "../i18n";
import { currentTenant, session, useSession } from "./session";
import { Avatar, Dialog, MenuHeading, MenuItem, MenuLink, MenuSep, Popover } from "./ui";
import { useUI } from "./UIContext";
import { cloudEnabled } from "../cloud/config";
import { createOrg, rememberOrg, slugify } from "../cloud/orgs";

export function TenantSwitcher() {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const cur = currentTenant(s);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Popover
        label={t("tenant.label")}
        placement="bottom-start"
        className="tenant-pop"
        panelClassName="tenant-panel"
        trigger={(p) => (
          <button {...p} type="button" className="tenant" aria-label={`${t("tenant.label")}: ${cur.name} (${cur.plan})`}>
            <Avatar name={cur.name} size={24} square />
            <span className="tenant-name">{cur.name}</span>
            <span className="plan-badge">{cur.plan}</span>
            <ChevronsUpDown size={14} className="tenant-chev" aria-hidden="true" />
          </button>
        )}
      >
        <MenuHeading>{t("tenant.workspaces")}</MenuHeading>
        <div role="group" aria-label={t("tenant.workspaces")}>
          {s.tenants.map((x) => (
            <MenuItem
              key={x.id}
              role="menuitemradio"
              checked={x.id === cur.id}
              icon={<Avatar name={x.name} size={20} square />}
              trailing={x.id === cur.id ? <Check size={14} /> : <span className="plan-badge">{x.plan}</span>}
              onSelect={() => {
                if (x.id !== cur.id) {
                  session.switchTenant(x.id);
                  if (cloudEnabled()) rememberOrg(x.id);
                  ui.toast(t("tenant.switched", { name: x.name }));
                }
              }}
            >
              {x.name}
            </MenuItem>
          ))}
        </div>
        <MenuSep />
        <MenuItem icon={<Plus size={15} />} onSelect={() => setCreating(true)}>
          {t("tenant.create")}
        </MenuItem>
        <MenuLink to="/settings/members" icon={<Users size={15} />}>
          {t("tenant.members")}
        </MenuLink>
      </Popover>
      {creating && <CreateWorkspace onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateWorkspace({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ui = useUI();
  const [name, setName] = useState("");
  const ok = name.trim().length >= 2;
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!ok) return;
    if (cloudEnabled()) {                                   // a real company: the service creates it and makes the person its owner
      const r = await createOrg(name.trim(), slugify(name));
      if ("error" in r) return setErr(r.error);
      ui.toast(t("tenant.created", { name: name.trim() }));
      return onClose();
    }
    const w = session.createTenant(name);
    ui.toast(t("tenant.created", { name: w.name }));
    onClose();
  };
  return (
    <Dialog
      title={t("tenant.create")}
      description={t("tenant.createDesc")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn primary" disabled={!ok} onClick={submit}>
            {t("tenant.createBtn")}
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
          <span>{t("tenant.nameLabel")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Labs" maxLength={40} />
        </label>
        {err && <p className="form-error" role="alert">{err}</p>}
        {!cloudEnabled() && <p className="muted small">{t("demo.simulated")}</p>}
      </form>
    </Dialog>
  );
}
