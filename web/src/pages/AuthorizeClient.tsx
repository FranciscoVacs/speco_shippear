// /oauth/consent: a person decides whether an AI agent (Claude, through MCP) may connect to their Speco (spec 018).
// Supabase Auth is the OAuth server; it sends the browser here with `authorization_id`. What the agent can and cannot do is said in plain
// words, because the person is the only one who can decide: the agent can read, never decide (D-012).
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { useT } from "../i18n";
import { decideAuthorization, listGrants, lookupAuthorization, revokeGrant, type AuthorizationRequest, type Grant } from "../cloud/auth";
import { cloudEnabled } from "../cloud/config";
import { PageHeader } from "./PageHeader";

type View = { s: "loading" } | { s: "ask"; req: AuthorizationRequest } | { s: "error"; message: string } | { s: "going" };

export default function AuthorizeClient() {
  const t = useT();
  const [params] = useSearchParams();
  const id = params.get("authorization_id");
  const [view, setView] = useState<View>({ s: "loading" });

  useEffect(() => {
    if (!id) return setView({ s: "error", message: t("oauth.noId") });
    let live = true;
    lookupAuthorization(id).then((r) => {
      if (!live) return;
      if (r.kind === "redirect") {                       // the person had already said yes to this client
        setView({ s: "going" });
        window.location.assign(r.url);
      } else if (r.kind === "ask") setView({ s: "ask", req: r.request });
      else setView({ s: "error", message: r.message });
    });
    return () => {
      live = false;
    };
  }, [id, t]);

  const decide = async (approve: boolean) => {
    if (!id) return;
    setView({ s: "going" });
    const r = await decideAuthorization(id, approve);
    if ("url" in r) window.location.assign(r.url);
    else setView({ s: "error", message: r.error });
  };

  return (
    <div className="page page-oauth">
      <PageHeader title={t("oauth.title")} description={t("oauth.desc")} />
      {view.s === "loading" && <p role="status" className="muted">{t("common.loading")}</p>}
      {view.s === "going" && <p role="status">{t("oauth.going")}</p>}
      {view.s === "error" && <div className="state" role="alert"><h2>{t("oauth.error")}</h2><p>{view.message}</p></div>}
      {view.s === "ask" && <Consent req={view.req} onDecide={decide} />}
      {cloudEnabled() && <Connected />}
    </div>
  );
}

function Consent({ req, onDecide }: { req: AuthorizationRequest; onDecide: (approve: boolean) => void }) {
  const t = useT();
  let host = req.redirectUri;
  try {
    host = new URL(req.redirectUri).host;
  } catch {
    /* show it as it came */
  }
  return (
    <section className="card oauth-card" aria-labelledby="oauth-client" data-testid="consent">
      <h2 id="oauth-client"><Bot size={18} aria-hidden="true" /> {t("oauth.asks", { client: req.clientName })}</h2>
      <p className="muted">{t("oauth.from", { host })}</p>
      <div className="oauth-cols">
        <div>
          <h3>{t("oauth.can")}</h3>
          <ul>{(["oauth.can1", "oauth.can2", "oauth.can3"] as const).map((k) => <li key={k}><Check size={14} aria-hidden="true" /> {t(k)}</li>)}</ul>
        </div>
        <div>
          <h3>{t("oauth.cannot")}</h3>
          <ul>{(["oauth.cannot1", "oauth.cannot2", "oauth.cannot3"] as const).map((k) => <li key={k}><X size={14} aria-hidden="true" /> {t(k)}</li>)}</ul>
        </div>
      </div>
      <p className="callout"><ShieldCheck size={14} aria-hidden="true" /> {t("oauth.warn")}</p>
      <div className="pt-actions">
        <button type="button" className="btn primary" onClick={() => onDecide(true)}>{t("oauth.allow")}</button>
        <button type="button" className="btn" onClick={() => onDecide(false)}>{t("oauth.deny")}</button>
      </div>
    </section>
  );
}

/** the agents this person already connected, with a way to cut each one off */
export function Connected() {
  const t = useT();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  useEffect(() => void listGrants().then(setGrants).catch(() => setGrants([])), []);
  if (!grants || grants.length === 0) return null;
  return (
    <section aria-labelledby="oauth-grants" className="oauth-grants">
      <h2 id="oauth-grants" className="dec-h">{t("oauth.connected")}</h2>
      <ul className="cloud-repos">
        {grants.map((g) => (
          <li key={g.clientId} className="cloud-repo" data-client={g.clientName}>
            <span>{g.clientName}</span>
            <button type="button" className="btn" onClick={async () => { if (await revokeGrant(g.clientId)) setGrants((l) => (l ?? []).filter((x) => x.clientId !== g.clientId)); }}>{t("oauth.revoke")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
