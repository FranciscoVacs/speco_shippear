// /agents: where a person learns how to connect an AI agent (Claude) to Speco through MCP, and sees who is already connected (spec 018).
// The address to paste is the service's /mcp; the agent only reads, decisions stay with people (D-012).
import { useState } from "react";
import { Bot, Check, Copy } from "lucide-react";
import { useT } from "../i18n";
import { CLOUD } from "../cloud/config";
import { PageHeader } from "./PageHeader";
import { Connected } from "./AuthorizeClient";

function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 2000); } catch { /* the text is selectable anyway */ }
  };
  return (
    <div className="agents-field">
      <code aria-label={label} data-testid="mcp-url">{value}</code>
      <button type="button" className="btn" onClick={copy}>{done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {t(done ? "agents.copied" : "agents.copy")}</button>
    </div>
  );
}

export default function AgentsPage() {
  const t = useT();
  const url = `${CLOUD.url}/mcp`;
  return (
    <>
      <PageHeader title={t("agents.title")} description={t("agents.desc")} />
      <section className="card agents-card" aria-labelledby="agents-url">
        <h2 id="agents-url"><Bot size={18} aria-hidden="true" /> {t("agents.urlTitle")}</h2>
        <CopyField value={url} label={t("agents.urlTitle")} />
        <h3 className="dec-h">{t("agents.claudeTitle")}</h3>
        <ol className="agents-steps">
          <li>{t("agents.s1")}</li>
          <li>{t("agents.s2")}</li>
          <li>{t("agents.s3")}</li>
          <li>{t("agents.s4")}</li>
        </ol>
        <h3 className="dec-h">{t("agents.codeTitle")}</h3>
        <CopyField value={`claude mcp add --transport http speco ${url}`} label={t("agents.codeTitle")} />
        <p className="muted small">{t("agents.rule")}</p>
      </section>
      <Connected />
    </>
  );
}
