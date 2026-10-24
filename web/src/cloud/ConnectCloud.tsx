// /connect in cloud mode (specs 015, 019): connect a code host (GitHub App or a Bitbucket workspace), choose which repositories Speco reads,
// and ask for the portrait. A company with hundreds of repositories reads none until it chooses (SC-004 of spec 019).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FolderGit2, Loader2 } from "lucide-react";
import { useT } from "../i18n";
import { currentTenant, useSession } from "../shell/session";
import { useUI } from "../shell/UIContext";
import { PageHeader } from "../pages/PageHeader";
import { LoadFailure, Skeleton } from "../States";
import { api, ApiError } from "./api";
import { useOrgs } from "./orgs";
import { findInstallations, goInstall, linkInstallation, type FoundInstallation } from "./github";

interface Repo {
  id: string;
  full_name: string;
  status: "active" | "available";
  last_synced_at: string | null;
  provider: string;
}
interface Conn {
  id: string;
  provider: "github" | "bitbucket";
  account: string;
  active: number;
  available: number;
  details: { webhook?: boolean };
}

const SHOWN = 200;                                       // a list of thousands is never drawn at once
const NAMES = { github: "GitHub", bitbucket: "Bitbucket" } as const;

export function ConnectCloud() {
  const t = useT();
  const ui = useUI();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const org = currentTenant(useSession());
  const role = useOrgs().orgs.find((o) => o.id === org?.id)?.role ?? "";
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [conns, setConns] = useState<Conn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bbOpen, setBbOpen] = useState(false);
  const [bb, setBb] = useState({ workspace: "", key: "", secret: "" });
  const [bbError, setBbError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInstallation[]>([]);
  const canConnect = role === "owner" || role === "admin";
  const canAsk = canConnect || role === "approver";

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const [r, c] = await Promise.all([api<Repo[]>(`/api/orgs/${org.id}/repositories?status=all`), api<Conn[]>(`/api/orgs/${org.id}/connections`)]);
      setRepos(r);
      setConns(c);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    }
  }, [org]);
  useEffect(() => void load(), [load]);
  useEffect(() => void findInstallations().then(setFound), []);
  // installations on GitHub this company does not have yet; one that belongs to another company is not offered
  const offered = found.filter((i) => !i.linked_org);
  const active = useMemo(() => (repos ?? []).filter((r) => r.status === "active"), [repos]);
  const available = useMemo(() => (repos ?? []).filter((r) => r.status === "available"), [repos]);
  // a repository is read as soon as it is chosen: keep looking until every one has been synced once
  const waiting = active.some((r) => !r.last_synced_at);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [waiting, load]);

  const failure = (e: unknown) => ui.toast(e instanceof ApiError ? e.detail : t("pt.err.network"));
  const connectGitHub = async (targetId?: number) => {
    setBusy(true);
    try {
      await goInstall(org!.id, targetId);                 // GitHub shows its own page; it sends the person back here when done
    } catch (e) {
      setBusy(false);
      failure(e);
    }
  };
  const connectFound = async (i: FoundInstallation) => {
    setBusy(true);
    try {
      const n = await linkInstallation(org!.id, i.installation_id);
      setFound(await findInstallations());
      await load();
      setNotice(t("connect.cloud.installed", { n }));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };
  const connectBitbucket = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setBbError(null);
    try {
      const r = await api<{ repositories: number }>(`/api/orgs/${org!.id}/connections/bitbucket`, { body: { workspace: bb.workspace.trim(), client_key: bb.key.trim(), client_secret: bb.secret.trim() } });
      setBb({ workspace: "", key: "", secret: "" });      // the secret never stays in the page
      setBbOpen(false);
      await load();                                       // say it is done only when the list shows it
      setNotice(t("connect.bb.connected", { n: r.repositories }));
    } catch (e) {
      setBbError(e instanceof ApiError ? e.detail : t("pt.err.network"));
    } finally {
      setBusy(false);
    }
  };
  const choose = async (ids: string[], selected: boolean, done: string) => {
    setBusy(true);
    try {
      await api(`/api/orgs/${org!.id}/repositories/select`, { body: { repo_ids: ids, selected } });
      setPicked(new Set());
      await load();
      setNotice(done);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };
  const refresh = async (c: Conn) => {
    setBusy(true);
    try {
      const r = await api<{ added: number; removed: number; queued: number }>(`/api/orgs/${org!.id}/connections/${c.id}/refresh`, { body: {} });
      await load();
      setNotice(t("connect.conn.refreshed", r));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async (c: Conn) => {
    setBusy(true);
    try {
      await api(`/api/orgs/${org!.id}/connections/${c.id}/disconnect`, { body: {} });
      setConfirming(null);
      await load();
      setNotice(t("connect.conn.disconnected"));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };
  const portrait = async (ids: string[]) => {
    setBusy(true);
    try {
      for (const id of ids) await api(`/api/repos/${id}/portrait`, { method: "POST", body: {} });
      ui.toast(t("connect.cloud.queued"));
      nav("/portrait");
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  const matches = useMemo(() => available.filter((r) => r.full_name.toLowerCase().includes(query.trim().toLowerCase())), [available, query]);
  if (error) return <div className="page"><LoadFailure detail={error} onRetry={() => void load()} /></div>;
  if (!repos) return <div className="page"><Skeleton /></div>;
  const installed = params.get("installed");
  const linked = params.get("linked");
  const githubProblem = params.get("github");
  const any = repos.length > 0 || conns.length > 0;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page page-connect">
      <PageHeader
        title={t("connect.title")}
        description={t("connect.cloud.desc", { org: org?.name ?? "" })}
        actions={canConnect ? (
          <>
            <button type="button" className={offered.length ? "btn" : "btn primary"} onClick={() => void connectGitHub()} disabled={busy}>{t(any || offered.length ? "connect.cloud.more" : "connect.cloud.connect")}</button>
            <button type="button" className="btn" aria-expanded={bbOpen} onClick={() => setBbOpen(!bbOpen)}>{t("connect.bb.connect")}</button>
          </>
        ) : undefined}
      />
      {installed !== null && <p role="status" className="callout">{t("connect.cloud.installed", { n: installed })}</p>}
      {githubProblem && <p role="alert" className="callout warn">{t(githubProblem === "sign-in" ? "connect.github.signIn" : "connect.github.unverified")}</p>}
      {linked !== null && <p role="status" className="callout">{t(linked === "0" ? "connect.found.failed" : "connect.found.linked")}</p>}
      {canConnect && offered.length > 0 && (
        <section aria-labelledby="found-h" className="card">
          <h2 id="found-h" className="dec-h">{t("connect.found.title")}</h2>
          <ul className="cloud-repos conns">
            {offered.map((i) => (
              <li key={i.installation_id} className="cloud-repo conn" data-found={i.account}>
                <span><strong>GitHub</strong> · {i.account}{i.repositories !== null && <span className="muted small"> {t("connect.found.repos", { n: i.repositories })}</span>}</span>
                {i.claim
                  ? <button type="button" className="btn primary" disabled={busy} onClick={() => void connectFound(i)}>{t("connect.found.connect", { account: i.account })}</button>
                  : <button type="button" className="btn" disabled={busy} onClick={() => void connectGitHub(i.account_id)}>{t("connect.found.onGitHub", { account: i.account })}</button>}
              </li>
            ))}
          </ul>
          {offered.some((i) => !i.claim) && <p className="muted small">{t("connect.found.orgWhy")}</p>}
        </section>
      )}
      {notice && <p role="status" className="callout">{notice}</p>}
      {!canConnect && <p className="muted">{t("connect.cloud.cannot")}</p>}

      {bbOpen && canConnect && (
        <form className="card bb-form" aria-label={t("connect.bb.title")} onSubmit={(e) => void connectBitbucket(e)}>
          <h2>{t("connect.bb.title")}</h2>
          <p className="muted small">{t("connect.bb.help")}</p>
          <label className="field"><span>{t("connect.bb.workspace")}</span>
            <input value={bb.workspace} onChange={(e) => setBb({ ...bb, workspace: e.target.value })} required autoComplete="off" spellCheck={false} />
            <span className="muted small">{t("connect.bb.workspaceHint")}</span></label>
          <label className="field"><span>{t("connect.bb.key")}</span>
            <input value={bb.key} onChange={(e) => setBb({ ...bb, key: e.target.value })} required autoComplete="off" spellCheck={false} /></label>
          <label className="field"><span>{t("connect.bb.secret")}</span>
            <input type="password" value={bb.secret} onChange={(e) => setBb({ ...bb, secret: e.target.value })} required autoComplete="new-password" /></label>
          {bbError && <p className="form-error" role="alert">{bbError}</p>}
          <button type="submit" className="btn primary" disabled={busy || !bb.workspace.trim() || !bb.key.trim() || !bb.secret.trim()}>{t("connect.bb.submit")}</button>
        </form>
      )}

      {!any ? (
        <div className="state"><h2>{t("connect.cloud.empty")}</h2><p>{t("connect.cloud.emptyBody")}</p></div>
      ) : (
        <>
          {conns.length > 0 && (
            <section aria-labelledby="conns-h">
              <h2 id="conns-h" className="dec-h">{t("connect.conns")}</h2>
              <ul className="cloud-repos conns">
                {conns.map((c) => (
                  <li key={c.id} className="cloud-repo conn" data-connection={`${c.provider}:${c.account}`}>
                    <span><strong>{NAMES[c.provider]}</strong> · {c.account} <span className="muted small">{t("connect.conn.counts", { active: c.active, available: c.available })}</span></span>
                    {c.provider === "bitbucket" && !c.details.webhook && <span className="muted small">{t("connect.conn.noHook")}</span>}
                    {canConnect && (
                      <span className="conn-actions">
                        {c.provider === "bitbucket" && <button type="button" className="btn" disabled={busy} onClick={() => void refresh(c)}>{t("connect.conn.refresh")}</button>}
                        {confirming === c.id ? (
                          <>
                            <button type="button" className="btn danger" disabled={busy} onClick={() => void disconnect(c)}>{t("connect.conn.confirm", { name: c.account })}</button>
                            <button type="button" className="btn" onClick={() => setConfirming(null)}>{t("connect.conn.cancel")}</button>
                          </>
                        ) : c.provider === "bitbucket" ? <button type="button" className="btn" onClick={() => setConfirming(c.id)}>{t("connect.conn.disconnect")}</button> : null}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {available.length > 0 && (
            <section aria-labelledby="avail-h">
              <h2 id="avail-h" className="dec-h">{t("connect.avail", { n: available.length })}</h2>
              <p className="muted small">{t("connect.avail.desc")}</p>
              <label className="field search-field"><span className="sr-only">{t("connect.avail.search")}</span>
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("connect.avail.search")} aria-label={t("connect.avail.search")} /></label>
              <ul className="cloud-repos avail" aria-label={t("connect.avail", { n: available.length })}>
                {matches.slice(0, SHOWN).map((r) => (
                  <li key={r.id} className="cloud-repo" data-available={r.full_name}>
                    <label className="check"><input type="checkbox" disabled={!canConnect} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /> <FolderGit2 size={14} aria-hidden="true" /> {r.full_name}</label>
                  </li>
                ))}
              </ul>
              {matches.length > SHOWN && <p className="muted small">{t("connect.avail.shown", { shown: SHOWN, total: matches.length })}</p>}
              {canConnect && (
                <p className="avail-actions">
                  <button type="button" className="btn" onClick={() => setPicked(new Set(matches.slice(0, 500).map((r) => r.id)))} disabled={matches.length === 0}>{t("connect.avail.all")}</button>{" "}
                  <button type="button" className="btn primary" disabled={busy || picked.size === 0} onClick={() => void choose([...picked], true, t("connect.avail.started", { n: picked.size }))}>{t("connect.avail.read", { n: picked.size })}</button>
                </p>
              )}
            </section>
          )}

          {active.length > 0 && (
            <section aria-labelledby="active-h">
              <h2 id="active-h" className="dec-h">{t("connect.active", { n: active.length })}</h2>
              <ul className="cloud-repos" aria-label={t("pt.reposTitle")}>
                {active.map((r) => (
                  <li key={r.id} className="cloud-repo" data-repo={r.full_name}>
                    <span><FolderGit2 size={14} aria-hidden="true" /> {r.full_name}</span>
                    {r.last_synced_at ? <span className="muted small">{t("connect.cloud.synced")}</span> : <span className="muted small"><Loader2 size={13} className="ag-spin" aria-hidden="true" /> {t("connect.cloud.reading")}</span>}
                    {canConnect && <button type="button" className="btn" disabled={busy} aria-label={`${t("connect.active.stop")}: ${r.full_name}`} onClick={() => void choose([r.id], false, t("connect.active.stopped", { name: r.full_name }))}>{t("connect.active.stop")}</button>}
                  </li>
                ))}
              </ul>
              {canAsk ? (
                <p><button type="button" className="btn primary" disabled={busy || waiting} onClick={() => void portrait(active.map((r) => r.id))}>{t("connect.cloud.portrait")}</button>
                  {waiting && <span className="muted small"> {t("connect.cloud.wait")}</span>}</p>
              ) : (
                <p><Link className="btn" to="/portrait">{t("nav.portrait")}</Link></p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
