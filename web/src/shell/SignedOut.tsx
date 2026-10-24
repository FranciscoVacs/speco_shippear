// Signed-out screen (FR-011). Simulated: "signing in" just restores the demo session.
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLang, useT } from "../i18n";
import { session } from "./session";
import { Logo } from "./Logo";
import { DemoLabel } from "./ui";
import { cloudEnabled } from "../cloud/config";
import { SignInCloud } from "../cloud/SignInCloud";
import { startAuth, useAuth } from "../cloud/auth";

export function SignedOut() {
  const t = useT();
  const { lang, setLang } = useLang();
  const nav = useNavigate();
  const btn = useRef<HTMLButtonElement>(null);
  const cloud = cloudEnabled();
  const auth = useAuth();
  useEffect(() => {
    if (!cloud) return;
    startAuth();
    if (auth.status === "in") nav("/", { replace: true });
  }, [cloud, auth.status, nav]);
  useEffect(() => {
    document.title = `${t("signedout.title")} · Spec Reviewer`;
    btn.current?.focus();
  }, [t]);
  return (
    <main className="signed-out" id="main">
      <div className="so-lang seg" role="group" aria-label={t("user.language")}>
        {(["es", "en"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="so-card">
        {cloud ? <SignInCloud /> : (
          <>
            <div className="so-brand">
              <Logo size={36} />
              <span>Spec Reviewer</span>
            </div>
            <h1>{t("signedout.title")}</h1>
            <p>{t("signedout.body")}</p>
            <button
              ref={btn}
              type="button"
              className="btn primary lg"
              onClick={() => {
                session.signIn();
                nav("/");
              }}
            >
              {t("signedout.signin")}
            </button>
            <DemoLabel />
          </>
        )}
      </div>
    </main>
  );
}
