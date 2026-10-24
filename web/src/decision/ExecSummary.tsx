// Executive summary at the top of a review: one verdict, what waits for the approver, what is at risk, what is the team's.
// Rule ids and technical wording stay in the findings list below; this card speaks in consequences.
import { Copy, Sparkles } from "lucide-react";
import { useT, type Key } from "../i18n";
import { useUI } from "../shell/UIContext";
import { copyText } from "../CodeBlock";
import type { Finding, Report, Sources } from "../types";
import { RISKS, VerdictBadge, impactKey, tn } from "./ui";
import { ApprovalPanel } from "./ApprovalPanel";

export function useSummaryText(report: Report, feature: string) {
  const t = useT();
  const d = report.decision!;
  const open = report.findings.filter((f) => f.severity !== "suggestion");
  const mine = open.filter((f) => f.owner === "decision");
  const n = d.verdict === "needs_decision" ? mine.length : d.verdict === "blocked" ? open.filter((f) => f.severity === "blocker").length : open.length;
  const headline = d.verdict === "ready" ? t("verdict.headline.ready") : tn(t, `verdict.headline.${d.verdict}`, n);
  return { headline, mine, open, build: () => plainText(t, feature, report, headline, mine) };
}

function plainText(t: ReturnType<typeof useT>, feature: string, r: Report, headline: string, mine: Finding[]): string {
  const d = r.decision!;
  const lines = [`*${t("exec.plainText", { feature })}*`, `${t("exec.plainState")}: ${t(`verdict.${d.verdict}` as Key)}`, headline];
  if (mine.length) {
    lines.push("", `${t("exec.plainMine")}:`);
    for (const f of mine) {
      const k = impactKey(f.rule);
      lines.push(`• ${f.ids.join(", ")}: ${k ? t(k) : f.message}`);
    }
  }
  const risks = RISKS.filter((k) => d.risks[k] > 0);
  if (risks.length) lines.push("", `${t("exec.plainRisks")}:`, ...risks.map((k) => `• ${t(`risk.${k}` as Key)} (${d.risks[k]})`));
  return lines.join("\n");
}

export function ExecSummary({ report, feature, canAsk, onAsk, onGo, sources, approvalRef }: { report: Report; feature: string; canAsk: boolean; onAsk: (f: Finding) => void; onGo?: (f: Finding) => void; sources?: Sources; approvalRef?: string }) {
  if (!report.decision) return null; // report exported by an older version: the technical view below still works
  return <Inner report={report} feature={feature} canAsk={canAsk} onAsk={onAsk} onGo={onGo} sources={sources} approvalRef={approvalRef} />;
}

function Inner({ report, feature, canAsk, onAsk, onGo, sources, approvalRef }: { report: Report; feature: string; canAsk: boolean; onAsk: (f: Finding) => void; onGo?: (f: Finding) => void; sources?: Sources; approvalRef?: string }) {
  const t = useT();
  const ui = useUI();
  const d = report.decision!;
  const { headline, mine, open, build } = useSummaryText(report, feature);
  const teamN = open.length - mine.length;
  const suggestions = report.findings.length - open.length;
  const risks = RISKS.filter((k) => d.risks[k] > 0).sort((a, b) => d.risks[b] - d.risks[a]);
  return (
    <section className={`exec v-${d.verdict}-card`} aria-labelledby="exec-title">
      <div className="exec-head">
        <div>
          <h2 id="exec-title" className="exec-title">
            {t("exec.title")}
          </h2>
          <VerdictBadge verdict={d.verdict} size="lg" />
        </div>
        <button
          type="button"
          className="btn"
          onClick={async () => ui.toast((await copyText(build())) ? t("exec.copied") : t("exec.copyFailed"))}
        >
          <Copy size={14} aria-hidden="true" /> {t("exec.copy")}
        </button>
      </div>
      <p className="exec-headline">{headline}</p>

      <div className="exec-grid">
        <div className="exec-col">
          <h3>{t("exec.mine")}</h3>
          {mine.length === 0 ? (
            <p className="muted">{t("exec.mineEmpty")}</p>
          ) : (
            <ul className="turn-list">
              {mine.map((f, i) => {
                const k = impactKey(f.rule);
                return (
                  <li key={i} className="turn-item">
                    <div className="turn-ids">{f.ids.join(" · ") || f.rule}</div>
                    <p>{k ? t(k) : f.message}</p>
                    <div className="turn-actions">
                      {onGo && (
                        <button type="button" className="link" onClick={() => onGo(f)}>
                          {t("exec.where")}
                        </button>
                      )}
                      {canAsk && (
                        <button type="button" className="link" onClick={() => onAsk(f)}>
                          <Sparkles size={12} aria-hidden="true" /> {t("exec.ask")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="exec-col">
          <h3>{t("exec.risks")}</h3>
          {risks.length === 0 ? (
            <p className="muted">{t("exec.risksEmpty")}</p>
          ) : (
            <ul className="risk-list">
              {risks.map((k) => (
                <li key={k} className={`risk r-${k}`}>
                  <strong>
                    {t(`risk.${k}` as Key)} <span className="risk-n">{d.risks[k]}</span>
                  </strong>
                  <p>{t(`risk.${k}.desc` as Key)}</p>
                </li>
              ))}
            </ul>
          )}
          <h3 className="exec-sub">{t("exec.team")}</h3>
          <p className="muted">{teamN ? tn(t, "exec.teamLine", teamN) : t("exec.teamNone")}</p>
          {suggestions > 0 && <p className="muted small">{tn(t, "exec.suggestions", suggestions)}</p>}
        </div>
      </div>
      {canAsk && sources && <ApprovalPanel report={report} feature={feature} sources={sources} approvalRef={approvalRef} />}
    </section>
  );
}
