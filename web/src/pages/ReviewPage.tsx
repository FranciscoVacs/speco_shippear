// /reviews/:featureId: header (repo, feature, actions) + findings list + source viewer.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, FolderGit2, Info, Link2, Sparkles } from "lucide-react";
import { useData } from "../DataContext";
import type { Bundle, Finding, Rule, Severity } from "../types";
import { Summary } from "../Header";
import { FindingRow } from "../FindingRow";
import { SOURCE_FILES, SourceViewer } from "../SourceViewer";
import { FAMILIES, SEV_LABEL_PLURAL, SEV_ORDER, family, naturalCompare } from "../util";
import { LoadFailure, SamplesBanner, ServerProblem, Skeleton } from "../States";
import { copyText } from "../CodeBlock";
import { useLang, useT } from "../i18n";
import { usePanel } from "../shell/usePanel";
import { useUI } from "../shell/UIContext";
import { isEmbedded } from "../data";
import { DemoLabel } from "../shell/ui";
import { ASK_EVENT, type AskDetail } from "./askEvent";
import { ExecSummary } from "../decision/ExecSummary";
import { Collapsible, useDisclosure } from "../shell/Collapsible";
import { tn } from "../decision/ui";

export { ASK_EVENT, type AskDetail } from "./askEvent";

export default function ReviewPage() {
  const t = useT();
  const { lang } = useLang();
  const ui = useUI();
  const panel = usePanel();
  const params = useParams();
  const { loader, loading: booting, error: bootError, retry, ruleById } = useData();
  const embedded = isEmbedded();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const wanted = decodeURIComponent(params.featureId ?? "");
  const info = loader?.features.find((f) => f.id === wanted) ?? loader?.resolve?.(wanted) ?? (embedded ? loader?.features[0] : undefined);
  const featureId = info?.id ?? "";

  useEffect(() => {
    if (!loader || !featureId || loader.issue) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader
      .load(featureId)
      .then((b) => !cancelled && setBundle(b))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [loader, featureId, tick]);

  const ask = useCallback(
    (f: Finding) => {
      const ids = f.ids.length ? ` (${f.ids.join(", ")})` : "";
      const text = t("agent.focusQuestion", { rule: f.rule, ids, feature: featureId, message: f.message.replace(/[.\s]+$/, "") });
      panel.setOpen(true);
      window.dispatchEvent(new CustomEvent<AskDetail>(ASK_EVENT, { detail: { text, focus: { rule: f.rule, ids: f.ids }, featureId } }));
    },
    [panel, featureId, t],
  );

  if (booting && !loader) return <div className="page"><Skeleton /></div>;
  if (bootError || !loader) return <div className="page"><LoadFailure detail={bootError ?? "?"} onRetry={retry} /></div>;
  if (loader.issue) return <div className="page"><ServerProblem issue={loader.issue} onRetry={retry} /></div>;
  if (!info) {
    return (
      <div className="page">
        <div className="state help-state" role="status">
          <h2>{t("review.notfound")}</h2>
          <p>{t("review.notfoundBody", { id: wanted })}</p>
          <div className="state-actions">
            <Link className="btn" to="/reviews">
              {t("review.backToList")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const header = (
    <div className="page-head review-head">
      <div className="ph-main">
        {!embedded && (
          <div className="eyebrow">
            <FolderGit2 size={13} aria-hidden="true" /> {info.repo ?? "local"}
            {loader.mode === "samples" && <DemoLabel />}
          </div>
        )}
        <h1 className="mono-title">{info.feature}</h1>
        <p className="muted">{bundle ? t("review.subtitle", { n: bundle.report.findings.length }) : t("common.loading")}</p>
      </div>
      <div className="page-actions">
        <button
          type="button"
          className="btn"
          onClick={async () => ui.toast((await copyText(location.href)) ? t("review.linkCopied") : t("review.linkFailed"))}
        >
          <Link2 size={14} aria-hidden="true" /> {t("review.copyLink")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!bundle}
          onClick={() => {
            if (!bundle) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(bundle.report, null, 2)], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${info.id}.report.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={14} aria-hidden="true" /> {t("review.export")}
        </button>
        {!embedded && !(panel.open) && (
          <button type="button" className="btn primary" onClick={() => panel.setOpen(true)}>
            <Sparkles size={14} aria-hidden="true" /> {t("review.askAgent")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="page page-review">
      {lang === "en" && (
        <p className="content-note" role="note">
          <Info size={14} aria-hidden="true" /> {t("content.note")}
        </p>
      )}
      {error && <LoadFailure detail={error} onRetry={() => setTick((x) => x + 1)} />}
      {!error && loading && !bundle && (
        <>
          {header}
          <Skeleton />
        </>
      )}
      {bundle && !error && <Review key={featureId} approvalRef={loader.mode === "cloud" ? featureId : undefined} bundle={bundle} loading={loading} ruleById={ruleById} canAsk={!embedded} onAsk={ask} header={header} banner={loader.mode === "samples" ? <SamplesBanner /> : bundle.source === "pr" ? <p role="status" className="callout">{t("review.prVersion")}</p> : null} />}
    </div>
  );
}

interface ReviewProps {
  /** what the approval log is keyed by when it is not the feature name (cloud) */
  approvalRef?: string;
  bundle: Bundle;
  loading: boolean;
  ruleById: Map<string, Rule>;
  canAsk: boolean;
  onAsk: (f: Finding) => void;
  /** page header (repo, feature, actions) rendered above the summary */
  header: ReactNode;
  /** shown between the header and the summary (samples notice) */
  banner?: ReactNode;
}

type GroupBy = "severity" | "id";

function Review({ approvalRef, bundle, loading, ruleById, canAsk, onAsk, header, banner }: ReviewProps) {
  const t = useT();
  const { report, sources } = bundle;
  const findings = report.findings;
  const [sevs, setSevs] = useState<Set<Severity>>(new Set());
  const [fams, setFams] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("severity");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  // 031/FR-006: a version that moves decided numbers in the code opens on them
  const [file, setFile] = useState<string>(() => (sources["values.md"] != null ? "values.md" : SOURCE_FILES.find((f) => sources[f] != null) ?? "spec.md"));
  const [focusTick, setFocusTick] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: number[] = [];
    findings.forEach((f, i) => {
      if (sevs.size && !sevs.has(f.severity)) return;
      if (fams.size && !fams.has(family(f))) return;
      if (needle) {
        const hay = [f.rule, f.rule_name, f.message, f.fix, f.ids.join(" "), f.location ? `${f.location.file}:${f.location.line}` : "", ...f.evidence]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return;
      }
      out.push(i);
    });
    return out;
  }, [findings, sevs, fams, q]);

  const groups = useMemo(() => {
    if (groupBy === "severity") {
      return SEV_ORDER.map((s) => ({
        key: s,
        title: SEV_LABEL_PLURAL[s],
        sev: s as Severity | null,
        items: visible.filter((i) => findings[i].severity === s),
      })).filter((g) => g.items.length);
    }
    const m = new Map<string, number[]>();
    visible.forEach((i) => {
      const key = findings[i].ids[0] ?? "(sin id)";
      m.set(key, [...(m.get(key) ?? []), i]);
    });
    return [...m.entries()]
      .sort(([a], [b]) => naturalCompare(a, b))
      .map(([key, items]) => ({ key, title: key, sev: null as Severity | null, items }));
  }, [visible, groupBy, findings]);

  const locate = useCallback(
    (i: number) => {
      setSelected(i);
      const loc = findings[i].location;
      if (loc && sources[loc.file] != null) setFile(loc.file);
      setFocusTick((t) => t + 1);
      if (window.matchMedia("(max-width: 999px)").matches) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [findings, sources],
  );

  // Selecting through a gutter marker: highlight + reveal the finding in the list.
  const fromMarker = useCallback((i: number) => {
    setSelected(i);
    setFocusTick((t) => t + 1);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-finding="${i}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  const onToggle = (i: number) => {
    setExpanded((e) => toggleIn(e, i));
    locate(i);
  };

  const filtersActive = sevs.size > 0 || fams.size > 0 || q.trim() !== "";
  const clear = () => {
    setSevs(new Set());
    setFams(new Set());
    setQ("");
  };
  const allExpanded = visible.length > 0 && visible.every((i) => expanded.has(i));

  // Simple by default (NFR-002): the executive summary is first and the technical detail is one action away. It starts open
  // in an exported report (NFR-009), when the report has no summary (older export) or when the address points at a finding (NFR-006).
  const hashFinding = (() => {
    const m = /^#finding-(\d+)$/.exec(typeof location !== "undefined" ? location.hash : "");
    return m ? Number(m[1]) : null;
  })();
  const [techOpen, setTechOpen] = useDisclosure("review-detail", !canAsk || !report.decision, hashFinding !== null && hashFinding < findings.length);
  const blockers = report.summary.blocker ?? 0;
  const tech = {
    summary: blockers ? tn(t, "tech.countBlockers", findings.length, { b: blockers }) : tn(t, "tech.count", findings.length),
  };
  useEffect(() => {
    if (hashFinding !== null && hashFinding < findings.length) setSelected(hashFinding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={loading ? "review loading" : "review"}>
      {header}
      {banner}
      <ExecSummary
        report={report}
        feature={report.feature}
        approvalRef={approvalRef}
        sources={sources}
        canAsk={canAsk}
        onAsk={onAsk}
        onGo={(f) => {
          const i = findings.indexOf(f);
          if (i >= 0) {
            history.replaceState(null, "", `#finding-${i}`); // a shareable address that points at this finding (NFR-006)
            setTechOpen(true);
            setSelected(i);
            requestAnimationFrame(() => document.getElementById("findings-anchor")?.scrollIntoView({ block: "start" }));
          }
        }}
      />
      <Collapsible
        id="review-detail"
        title={t("tech.title")}
        summary={tech.summary}
        open={techOpen}
        onOpenChange={setTechOpen}
      >
      <Summary report={report} activeSev={sevs} onSev={(s) => setSevs((x) => toggleIn(x, s))} />
      {report.notes?.length > 0 && (
        <ul className="notes" aria-label="Avisos del parser">
          {report.notes.map((n, i) => (
            <li key={i}>
              <span aria-hidden="true">ⓘ</span> {n}
            </li>
          ))}
        </ul>
      )}
      <div className="split" id="findings-anchor">
        <section className="findings" aria-label="Hallazgos">
          <div className="toolbar">
            <input
              type="search"
              className="search"
              placeholder="Buscar en hallazgos…"
              aria-label="Buscar en hallazgos"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="filter-row">
              <div className="seg" role="group" aria-label="Familia de regla">
                {FAMILIES.map((f) => (
                  <button key={f.id} aria-pressed={fams.has(f.id)} onClick={() => setFams((x) => toggleIn(x, f.id))}>
                    <code>{f.id}</code> {f.label}
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Agrupar por">
                <button aria-pressed={groupBy === "severity"} onClick={() => setGroupBy("severity")}>
                  Por severidad
                </button>
                <button aria-pressed={groupBy === "id"} onClick={() => setGroupBy("id")}>
                  Por requisito/id
                </button>
              </div>
            </div>
            <div className="toolbar-foot">
              <span className="muted" aria-live="polite">
                {visible.length} de {findings.length} hallazgos
              </span>
              {filtersActive && (
                <button className="link" onClick={clear}>
                  Limpiar filtros
                </button>
              )}
              {visible.length > 0 && (
                <button
                  className="link"
                  onClick={() => setExpanded(allExpanded ? new Set() : new Set(visible))}
                >
                  {allExpanded ? "Contraer todo" : "Expandir todo"}
                </button>
              )}
            </div>
          </div>
          <div ref={listRef}>
            {findings.length === 0 ? (
              <div className="state ok">
                <h2>Sin hallazgos</h2>
                <p>El reviewer no encontró problemas en esta spec. Buen trabajo.</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="state">
                <h2>Ningún hallazgo coincide</h2>
                <p>Los filtros actuales ocultan todo.</p>
                <button className="btn" onClick={clear}>
                  Limpiar filtros
                </button>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="group">
                  <h3 className={g.sev ? `group-title g-${g.sev}` : "group-title"}>
                    {g.title} <span className="count">{g.items.length}</span>
                  </h3>
                  <ul className="flist">
                    {g.items.map((i) => (
                      <FindingRow
                        key={i}
                        f={findings[i] as Finding}
                        index={i}
                        expanded={expanded.has(i)}
                        selected={selected === i}
                        rule={ruleById.get(findings[i].rule) ?? null}
                        canAsk={canAsk}
                        onToggle={onToggle}
                        onLocate={locate}
                        onAsk={(k) => onAsk(findings[k])}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>
        <SourceViewer
          sources={sources}
          findings={findings}
          file={file}
          onFile={setFile}
          selected={selected}
          onSelect={fromMarker}
          panelRef={panelRef}
          focusTick={focusTick}
        />
      </div>
      </Collapsible>
    </div>
  );
}
