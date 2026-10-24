import { useState } from "react";
import { Check, Copy, Plus, TriangleAlert } from "lucide-react";
import { useT } from "../../i18n";
import { session, useSession } from "../../shell/session";
import { fmtAgo } from "../../shell/format";
import { Dialog } from "../../shell/ui";
import { useUI } from "../../shell/UIContext";
import { copyText } from "../../CodeBlock";
import { PageHeader } from "../PageHeader";

export default function ApiKeys() {
  const t = useT();
  const s = useSession();
  const ui = useUI();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title={t("settings.apiKeys")}
        description={t("keys.desc")}
        demo
        actions={
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden="true" /> {t("keys.create")}
          </button>
        }
      />
      <div className="card">
        <div className="table-wrap flush">
          <table className="data-table">
            <caption className="sr-only">{t("settings.apiKeys")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("keys.name")}</th>
                <th scope="col">{t("keys.key")}</th>
                <th scope="col">{t("keys.created")}</th>
                <th scope="col">{t("keys.lastUsed")}</th>
                <th scope="col">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {s.apiKeys.map((k) => (
                <tr key={k.id} className={k.revoked ? "revoked" : ""}>
                  <td className="who-name">{k.name}</td>
                  <td>
                    <code>{k.prefix}…</code>
                  </td>
                  <td>{k.createdDaysAgo === 0 ? t("time.now") : t("time.d", { n: k.createdDaysAgo })}</td>
                  <td>{k.revoked ? "—" : fmtAgo(t, k.lastUsedMin)}</td>
                  <td className="actions">
                    {k.revoked ? (
                      <span className="status revoked-s">
                        <span className="status-dot" aria-hidden="true" /> {t("keys.revoked")}
                      </span>
                    ) : confirm === k.id ? (
                      <span className="inline-confirm" role="group" aria-label={t("keys.confirmRevoke", { name: k.name })}>
                        <span className="small">{t("keys.confirmRevoke", { name: k.name })}</span>
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() => {
                            session.revokeApiKey(k.id);
                            setConfirm(null);
                            ui.toast(t("keys.revokedToast", { name: k.name }));
                          }}
                        >
                          {t("keys.revoke")}
                        </button>
                        <button type="button" className="btn sm" onClick={() => setConfirm(null)}>
                          {t("common.cancel")}
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn sm" onClick={() => setConfirm(k.id)} aria-label={`${t("keys.revoke")}: ${k.name}`}>
                        {t("keys.revoke")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {creating && <CreateKey onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateKey({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const create = () => {
    if (name.trim().length < 2) return;
    setSecret(session.createApiKey(name).secret);
  };
  if (secret) {
    return (
      <Dialog
        title={t("keys.createdTitle")}
        onClose={onClose}
        footer={
          <button type="button" className="btn primary" onClick={onClose}>
            {t("keys.done")}
          </button>
        }
      >
        <p className="callout warn">
          <TriangleAlert size={15} aria-hidden="true" /> {t("keys.once")}
        </p>
        <div className="secret">
          <code data-testid="api-secret">{secret}</code>
          <button
            type="button"
            className="btn sm"
            data-autofocus
            onClick={async () => {
              setCopied(await copyText(secret));
            }}
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <p className="muted small" role="status">
          {copied === true ? t("keys.copiedHint") : copied === false ? t("keys.copyFailed") : t("demo.fakeKey")}
        </p>
      </Dialog>
    );
  }
  return (
    <Dialog
      title={t("keys.create")}
      description={t("keys.createDesc")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn primary" disabled={name.trim().length < 2} onClick={create}>
            {t("keys.createBtn")}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label className="field">
          <span>{t("keys.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="CI pipeline" maxLength={40} />
        </label>
      </form>
    </Dialog>
  );
}
