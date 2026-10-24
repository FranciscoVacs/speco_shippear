// In front of the shell in cloud mode: sign-in, a first company, and the real list of companies (spec 015: FR-001..FR-003).
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useT } from "../i18n";
import { hydrateCloud, useSession } from "../shell/session";
import { LoadFailure, Skeleton } from "../States";
import { Logo } from "../shell/Logo";
import { rememberReturnTo, startAuth, takeReturnTo, useAuth } from "./auth";
import { reportAcquisition } from "./acquisition";
import { claimPendingReferral } from "./referral";
import { createOrg, loadOrgs, rememberOrg, rememberedOrg, slugify, takeOrgHint, toTenant, useOrgs } from "./orgs";
import { findInstallations, linkInstallation, type FoundInstallation } from "./github";

export function CloudGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const orgs = useOrgs();
  const session = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => startAuth(), []);
  // a deep link (for example a consent request) opened while signed out is kept through the sign-in and followed afterwards
  useEffect(() => {
    if (auth.status === "out") rememberReturnTo(loc.pathname + loc.search);
  }, [auth.status, loc.pathname, loc.search]);
  useEffect(() => {
    if (auth.status === "in" && session.signedIn && loc.pathname === "/") {
      const back = takeReturnTo();
      if (back) nav(back, { replace: true });
    }
  }, [auth.status, session.signedIn, loc.pathname, nav]);
  useEffect(() => {
    // a kept referral code is handed over first: the service only records it for an account that has no company yet (spec 021)
    if (auth.status === "in" && orgs.status === "idle") void Promise.all([claimPendingReferral(), reportAcquisition(false)]).finally(() => void loadOrgs());
  }, [auth.status, orgs.status]);
  useEffect(() => {
    if (auth.status === "in" && auth.user && orgs.status === "ready" && orgs.orgs.length) {
      // a link from a pull request opens the company it is about, if the person belongs to it
      const hint = takeOrgHint();
      if (hint && orgs.orgs.some((o) => o.id === hint)) rememberOrg(hint);
      hydrateCloud(auth.user, orgs.orgs.map(toTenant), rememberedOrg());
    }
  }, [auth.status, auth.user, orgs.status, orgs.orgs, session.signedIn]);

  if (auth.status === "loading") return <div className="page"><Skeleton /></div>;
  if (auth.status === "out") return <Navigate to="/signed-out" replace />;
  if (orgs.status === "idle" || orgs.status === "loading") return <div className="page"><Skeleton /></div>;
  if (orgs.status === "error") return <div className="page"><LoadFailure detail={orgs.error ?? "?"} onRetry={() => void loadOrgs()} /></div>;
  if (orgs.orgs.length === 0) return <CreateFirstCompany />;
  // the shell reads the session in its first render: wait until it holds the real person and companies, or it would bounce to /signed-out
  if (!session.signedIn) return <div className="page"><Skeleton /></div>;
  return <>{children}</>;
}

function CreateFirstCompany() {
  const t = useT();
  const nav = useNavigate();
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.name ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // what the person already has on GitHub: their own account connects with the company, in the same click
  const [own, setOwn] = useState<FoundInstallation[]>([]);
  const [take, setTake] = useState<Set<number>>(new Set());
  useEffect(() => {
    void findInstallations().then((found) => {
      const mine = found.filter((i) => i.claim);
      setOwn(mine);
      setTake(new Set(mine.map((i) => i.installation_id)));
    });
  }, []);
  const toggle = (id: number) => setTake((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <main className="signed-out" id="main">
      <div className="so-card">
        <div className="so-brand">
          <Logo size={36} />
          <span>Spec Reviewer</span>
        </div>
        <h1>{t("cloud.company.title")}</h1>
        <p>{t("cloud.company.body")}</p>
        <form
          className="cloud-email"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await createOrg(name.trim(), slugify(name));
            if ("error" in r) {
              setBusy(false);
              setErr(r.error);
              return;
            }
            void reportAcquisition(true);                       // a new account with no kept link came straight to us (spec 022)
            if (!take.size) return;
            // the company exists either way: a connection that fails here is offered again on /connect
            const linked = await Promise.allSettled([...take].map((id) => linkInstallation(r.id, id)));
            nav("/connect?linked=" + linked.filter((x) => x.status === "fulfilled").length, { replace: true });
          }}
        >
          <label className="field">
            <span>{t("tenant.nameLabel")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Labs" maxLength={40} autoFocus />
          </label>
          {own.map((i) => (
            <label key={i.installation_id} className="check-row">
              <input type="checkbox" checked={take.has(i.installation_id)} onChange={() => toggle(i.installation_id)} />
              <span>{t("cloud.company.withGitHub", { account: i.account, n: i.repositories ?? 0 })}</span>
            </label>
          ))}
          <button type="submit" className="btn primary lg" disabled={busy || name.trim().length < 2}>{t(take.size ? "cloud.company.createAndConnect" : "tenant.createBtn")}</button>
        </form>
        {err && <p className="form-error" role="alert">{err}</p>}
      </div>
    </main>
  );
}
