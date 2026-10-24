// The public page of a referral link (spec 021 FR-002): says that someone invited the visitor and nothing about who.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "../i18n";
import { Logo } from "../shell/Logo";
import { CLOUD } from "../cloud/config";
import { captureReferralTouch } from "../cloud/acquisition";
import { rememberReferral } from "../cloud/referral";

export default function ReferralLanding() {
  const t = useT();
  const nav = useNavigate();
  const { code = "" } = useParams();
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${CLOUD.url}/api/referrals/check/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ valid: boolean }>) : { valid: false }))
      .then((j) => {
        if (!live) return;
        if (j.valid && rememberReferral(code)) captureReferralTouch();
        setValid(j.valid);
      })
      .catch(() => live && setValid(false));
    return () => {
      live = false;
    };
  }, [code]);
  return (
    <main className="signed-out" id="main">
      <div className="so-card">
        <div className="so-brand">
          <Logo size={36} />
          <span>Spec Reviewer</span>
        </div>
        <h1>{t("referral.landing.title")}</h1>
        <p>{t("referral.landing.body")}</p>
        {valid === false && <p className="muted small" role="status">{t("referral.landing.invalid")}</p>}
        <button type="button" className="btn primary lg" disabled={valid === null} onClick={() => nav("/", { replace: true })}>
          {t("referral.landing.cta")}
        </button>
      </div>
    </main>
  );
}
