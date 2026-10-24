// Sign-in screen for cloud mode (FR-001): GitHub, or a link by email. Passwords never exist in this app.
import { useState } from "react";
import { LogIn, Mail } from "lucide-react";
import { useT } from "../i18n";
import { Logo } from "../shell/Logo";
import { lastSignInError, signInWithEmail, signInWithGitHub } from "./auth";

export function SignInCloud() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  const failed = lastSignInError();
  return (
    <>
      <div className="so-brand">
        <Logo size={36} />
        <span>Spec Reviewer</span>
      </div>
      <h1>{t("cloud.signin.title")}</h1>
      <p>{t("cloud.signin.body")}</p>
      {failed && <p className="form-error" role="alert">{t("cloud.signin.failed", { detail: failed })}</p>}
      <button type="button" className="btn primary lg" onClick={() => void signInWithGitHub()}>
        <LogIn size={16} aria-hidden="true" /> {t("cloud.signin.github")}
      </button>
      <p className="muted small">{t("cloud.signin.or")}</p>
      <form
        className="cloud-email"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("sending");
          const error = await signInWithEmail(email.trim());
          if (error) {
            setErr(error);
            setState("error");
          } else setState("sent");
        }}
      >
        <label className="field">
          <span className="sr-only">{t("cloud.signin.email")}</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("cloud.signin.email")} autoComplete="email" />
        </label>
        <button type="submit" className="btn" disabled={state === "sending" || !email.trim()}>
          <Mail size={15} aria-hidden="true" /> {t("cloud.signin.link")}
        </button>
      </form>
      {state === "sent" && <p role="status">{t("cloud.signin.sent")}</p>}
      {state === "error" && <p className="form-error" role="alert">{err}</p>}
    </>
  );
}
