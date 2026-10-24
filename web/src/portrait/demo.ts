// The portrait in the public demo: seeded rules in the browser, with the same rules the cloud service enforces.
// Nothing leaves the page. A second backend (HTTP, against the cloud API) will implement the same functions.
import { useSyncExternalStore } from "react";
import { readJSON, storage } from "../shell/storage";
import type { Action, Baseline, Drift, PortraitState, Rule, Text } from "./model";

export const PORTRAIT_KEY = "sr-portrait";
const VERSION = 1;
const ME = "Alex Demo";

const ev = (path: string, start_line: number, end_line: number, excerpt: string) => ({ path, start_line, end_line, excerpt });
const t2 = (es: string, en: string): Text => ({ es, en });

function seed(): PortraitState {
  const rules: Rule[] = [
    { id: "r1", code: "BR-001", statement: t2("Los planes anuales se reembolsan completos si se cancelan dentro de los 14 días", "Annual plans are refunded in full if cancelled within 14 days"),
      category: "money", risk: "high", origin: "code", confidence: "medium", status: "proposed", repo: "acme/billing",
      evidence: [ev("src/billing/refunds.py", 42, 44, "if plan.interval == 'year' and days_since_purchase <= 14:\n    return plan.amount")] },
    { id: "r2", code: "BR-002", statement: t2("Solo los dueños y administradores pueden invitar miembros", "Only owners and admins can invite members"),
      category: "permissions", risk: "high", origin: "spec", confidence: "high", status: "proposed", repo: "acme/team-app",
      evidence: [ev("specs/003-team-invitations/spec.md", 21, 21, "- **FR-002**: The system MUST allow only owners and admins to invite members")] },
    { id: "r3", code: "BR-003", statement: t2("Cada plan limita los asientos: 3 en Hobby y 20 en Pro", "Each plan caps seats: 3 on Hobby and 20 on Pro"),
      category: "limits", risk: "medium", origin: "code", confidence: "medium", status: "proposed", repo: "acme/billing",
      evidence: [ev("src/billing/plans.py", 8, 8, "MAX_SEATS = {'hobby': 3, 'pro': 20}")] },
    { id: "r4", code: "BR-004", statement: t2("Las invitaciones sin aceptar se borran a los 30 días", "Invitations that are not accepted are deleted after 30 days"),
      category: "data", risk: "medium", origin: "code", confidence: "low", status: "proposed", repo: "acme/team-app",
      evidence: [ev("src/jobs/cleanup.py", 15, 16, "Invitation.objects.filter(created__lt=now() - timedelta(days=30), accepted=False).delete()")] },
    { id: "r5", code: "BR-005", statement: t2("Quien recibe una invitación recibe un email en menos de 60 segundos", "The person invited gets an email within 60 seconds"),
      category: "notifications", risk: "low", origin: "spec", confidence: "high", status: "proposed", repo: "acme/team-app",
      evidence: [ev("specs/003-team-invitations/spec.md", 20, 20, "- **FR-001**: When an invitation is created, the system MUST email the address within 60 seconds")] },
    { id: "r6", code: "BR-006", statement: t2("Las facturas vencidas hace más de 30 días suspenden la cuenta", "Invoices overdue by more than 30 days suspend the account"),
      category: "money", risk: "high", origin: "code", confidence: "medium", status: "confirmed", repo: "acme/billing", decidedBy: ME, decidedAt: "2026-10-12T10:00:00Z",
      evidence: [ev("src/billing/dunning.py", 20, 22, "if invoice.days_overdue > 30:\n    account.suspend()")] },
    { id: "r7", code: "BR-007", statement: t2("Los reembolsos se pagan en una hora", "Refunds are paid within one hour"),
      category: "money", risk: "high", origin: "code", confidence: "low", status: "rejected", repo: "acme/billing", decidedBy: ME, decidedAt: "2026-10-12T10:05:00Z",
      note: "No es así: el pago depende del banco, no lo prometemos.", evidence: [ev("src/billing/refunds.py", 60, 60, "queue.enqueue(pay_refund, delay=0)")] },
  ];
  const drift: Drift[] = [{ id: "d1", ruleId: "r6", kind: "evidence_changed", commit: "9f3c2a1", at: "2026-10-14T16:30:00Z", status: "open",
    detail: t2("Cambiaron las líneas 20-22 de src/billing/dunning.py (ahora suspende a los 45 días)", "Lines 20-22 of src/billing/dunning.py changed (it now suspends after 45 days)") }];
  return {
    v: VERSION, rules, drift, baselines: [],
    repos: [
      { name: "acme/billing", counts: { specs: 4, docs: 12, api: 1, tests: 58, database: 9, config: 6, code: 143, other: 11 }, total: 244, consent: false },
      { name: "acme/team-app", counts: { specs: 6, docs: 8, api: 2, tests: 41, database: 5, config: 5, code: 97, other: 14 }, total: 178, consent: false },
    ],
  };
}

function load(): PortraitState {
  const s = readJSON<PortraitState>(PORTRAIT_KEY);
  return s && s.v === VERSION && Array.isArray(s.rules) ? s : seed();
}

let state: PortraitState = load();
const subs = new Set<() => void>();
function set(next: PortraitState) {
  state = next;
  storage.set(PORTRAIT_KEY, JSON.stringify(next));
  subs.forEach((f) => f());
}

export const usePortrait = (): PortraitState => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state, () => state);

export type Failure = "reason" | "statement" | "taken" | "note" | "none";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export const statementOf = (r: Rule, lang: "es" | "en") => (typeof r.statement === "string" ? r.statement : r.statement[lang]);

/** same rules as `decide_rule` in the database: rejecting needs a reason, a correction needs its new statement and cannot copy another rule */
export function decide(id: string, action: Action, opts: { statement?: string; note?: string }, lang: "es" | "en"): Failure | null {
  const r = state.rules.find((x) => x.id === id);
  if (!r) return "none";
  const note = (opts.note ?? "").trim();
  if (action === "reject" && !note) return "reason";
  let statement: Text = r.statement;
  if (action === "correct") {
    const s = (opts.statement ?? "").trim();
    if (!s) return "statement";
    if (state.rules.some((o) => o.id !== id && o.repo === r.repo && norm(statementOf(o, lang)) === norm(s))) return "taken";
    statement = s;
  }
  set({
    ...state,
    rules: state.rules.map((x) => (x.id === id
      ? { ...x, statement, status: action === "reject" ? "rejected" : "confirmed", confidence: action === "reject" ? x.confidence : "high", decidedBy: ME, decidedAt: new Date().toISOString(), note }
      : x)),
  });
  return null;
}

async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0x811c9dc5; // not cryptographic: only if SubtleCrypto is unavailable (insecure context)
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h.toString(16).padStart(8, "0").repeat(8);
  }
}

/** a snapshot of the confirmed rules and their evidence; the hash follows the content (SC-002) */
export async function freeze(name: string): Promise<Baseline | null> {
  const confirmed = state.rules.filter((r) => r.status === "confirmed");
  if (confirmed.length === 0 || !name.trim()) return null;
  const canon = JSON.stringify(confirmed.map((r) => ({ c: r.code, s: typeof r.statement === "string" ? r.statement : r.statement.en, e: r.evidence.map((e) => [e.path, e.start_line, e.end_line, e.excerpt]) })));
  const b: Baseline = { id: `b${state.baselines.length + 1}`, name: name.trim(), at: new Date().toISOString(), by: ME, count: confirmed.length, hash: await sha256(canon) };
  set({ ...state, baselines: [b, ...state.baselines] });
  return b;
}

export function acknowledge(id: string, note: string): Failure | null {
  if (!note.trim()) return "note";
  set({ ...state, drift: state.drift.map((d) => (d.id === id ? { ...d, status: "acknowledged", ackNote: note.trim() } : d)) });
  return null;
}

export function setConsent(repo: string, on: boolean) {
  set({ ...state, repos: state.repos.map((r) => (r.name === repo ? { ...r, consent: on } : r)) });
}

export function resetPortrait() {
  set(seed());
}
