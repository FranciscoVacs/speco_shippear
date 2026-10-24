import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n";

/** Copies text; tolerates a rejected/missing Clipboard API (insecure origin, sandboxed iframe, permissions). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall back below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

type CopyState = "idle" | "ok" | "fail";

export function CopyButton({ text, label, className = "" }: { text: string; label?: string; className?: string }) {
  const t = useT();
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = async () => {
    const ok = await copyText(text);
    setState(ok ? "ok" : "fail");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), ok ? 1800 : 4000);
  };
  return (
    <span className={"copy " + className}>
      <button type="button" className="copy-btn" onClick={onClick} data-state={state}>
        {state === "ok" ? t("common.copied") : state === "fail" ? t("common.copyFailed") : label ?? t("common.copy")}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "ok" ? t("common.copiedSr") : state === "fail" ? t("common.copyFailedSr") : ""}
      </span>
    </span>
  );
}

/** Preformatted block with a copy button. The text is rendered as a text node only (never as HTML). */
export function CodeBlock({ code, lang, caption }: { code: string; lang?: string; caption?: string }) {
  return (
    <figure className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{caption ?? lang ?? "texto"}</span>
        <CopyButton text={code} />
      </div>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
