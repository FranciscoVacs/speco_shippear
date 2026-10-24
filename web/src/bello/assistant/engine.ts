import { RULES, STATUS_LABEL, rule as ruleById, type Level, type Requirement, type Spec } from "../data";
import { allSpecs, nextRequirementId, requirementStatus, verifiedRatio } from "../store";
import { ruleCompliance } from "../metrics";

export interface Check {
  ruleId: string;
  ok: boolean;
  note: string;
}

export type Reply =
  | { kind: "text"; text: string }
  | { kind: "draft"; intro: string; req: Requirement; checks: Check[] }
  | { kind: "status"; text: string; specs: Spec[]; pct?: number };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

interface Topic {
  match: string[];
  rules: string[];
  impacts: { module: string; level: Level; note: string }[];
  specs: (subject: string) => { title: string; ears: string; rules: string[] }[];
}

const TOPICS: Topic[] = [
  {
    match: ["transfer", "enviar dinero", "pago", "pagar", "debito automatico", "programad"],
    rules: ["BCRA-SNP", "BEL-ARCH-01", "BEL-MNY-02"],
    impacts: [
      { module: "payments-api", level: "alto", note: "Nuevo flujo de operación." },
      { module: "core-ledger", level: "medio", note: "Asientos con idempotency-key." },
      { module: "app-mobile", level: "medio", note: "Pantallas del flujo." },
    ],
    specs: (s) => [
      { title: `${s}: alta de la operación`, ears: `When a client confirms ${s.toLowerCase()}, the system MUST post a balanced ledger entry with an idempotency key.`, rules: ["BEL-ARCH-01", "BEL-MNY-02"] },
      { title: "Respeto de límites por perfil", ears: "When the operation amount exceeds the remaining daily limit, the system MUST reject it and show the available limit.", rules: ["BCRA-SNP"] },
      { title: "Segundo factor sobre umbral", ears: "When the amount exceeds ARS 100.000, the system MUST require a one-time code before posting.", rules: ["BCRA-7724", "ISO-27001"] },
    ],
  },
  {
    match: ["tarjeta", "card", "pan", "cvv"],
    rules: ["PCI-DSS", "BEL-SEC-03"],
    impacts: [
      { module: "cards-svc", level: "alto", note: "Lógica de tarjeta y vault." },
      { module: "app-mobile", level: "medio", note: "Vista de tarjeta." },
    ],
    specs: (s) => [
      { title: `${s}: operación sobre la tarjeta`, ears: `When the client requests ${s.toLowerCase()}, the system MUST apply it to the card within 5 seconds.`, rules: ["PCI-DSS"] },
      { title: "PAN nunca expuesto", ears: "When card data is displayed or logged, the system MUST mask the PAN to its last 4 digits.", rules: ["PCI-DSS", "BEL-SEC-03"] },
    ],
  },
  {
    match: ["alta", "onboarding", "registro", "kyc", "abrir cuenta", "cuenta nueva", "cliente nuevo"],
    rules: ["UIF-30", "LEY-25326"],
    impacts: [
      { module: "onboarding-svc", level: "alto", note: "Nuevo paso de alta." },
      { module: "risk-engine", level: "medio", note: "Screening PEP / sanciones." },
    ],
    specs: () => [
      { title: "Debida diligencia del cliente", ears: "When a prospect completes the form, the system MUST validate identity and screen PEP and sanctions lists before activating the account.", rules: ["UIF-30"] },
      { title: "Consentimiento registrado", ears: "When the prospect accepts terms, the system MUST store a versioned, timestamped consent.", rules: ["LEY-25326"] },
    ],
  },
  {
    match: ["dato", "perfil", "email", "telefono", "domicilio", "privacidad", "borrar cuenta", "baja"],
    rules: ["LEY-25326"],
    impacts: [{ module: "onboarding-svc", level: "medio", note: "Gestión de datos personales." }],
    specs: () => [{ title: "Derechos del titular", ears: "When a client requests access, rectification or deletion of personal data, the system MUST fulfil it within 10 business days.", rules: ["LEY-25326"] }],
  },
  {
    match: ["login", "contrasena", "clave", "biometr", "2fa", "seguridad", "sesion", "dispositivo"],
    rules: ["BCRA-7724", "ISO-27001"],
    impacts: [
      { module: "app-mobile", level: "alto", note: "Flujo de autenticación." },
      { module: "risk-engine", level: "bajo", note: "Señales de dispositivo." },
    ],
    specs: (s) => [
      { title: `${s}: autenticación reforzada`, ears: "When a client signs in from a new device, the system MUST require a second factor and register the device.", rules: ["BCRA-7724", "ISO-27001"] },
    ],
  },
  {
    match: ["interes", "plazo fijo", "inversion", "remunerad", "rendimiento", "fci"],
    rules: ["BEL-MNY-02", "BEL-ARCH-01", "SPC-CON"],
    impacts: [
      { module: "core-ledger", level: "alto", note: "Job de devengamiento." },
      { module: "reporting", level: "medio", note: "Régimen informativo." },
    ],
    specs: (s) => [
      { title: `${s}: cálculo y acreditación`, ears: "When the daily close runs, the system MUST accrue returns in cents and post them through core-ledger.", rules: ["BEL-MNY-02", "BEL-ARCH-01"] },
      { title: "Informe al regulador", ears: "When the month closes, the system MUST generate the regulatory report by the 10th business day.", rules: ["BCRA-7724"] },
    ],
  },
];

const STATUS_WORDS = ["estado", "como esta", "como va", "que falta", "falla", "fallan", "riesgo", "avance", "progreso", "cumplimiento", "cumplimos", "resumen", "pendiente"];

export function isStatusQuery(text: string): boolean {
  const t = norm(text);
  return has(t, STATUS_WORDS) || t.startsWith("?") || /^(que|cual|cuanto|como)\b/.test(t);
}

export function answer(text: string, reqs: Requirement[]): Reply {
  const t = norm(text.trim());
  if (!t) return { kind: "text", text: "Escribí qué necesitás o preguntá por el estado de un requerimiento." };
  return isStatusQuery(t) ? status(t, reqs) : draft(text.trim(), t, reqs);
}

function status(t: string, reqs: Requirement[]): Reply {
  const specs = allSpecs(reqs);
  const r = RULES.find((x) => has(t, [norm(x.id).split("-")[0], norm(x.title).split(" ")[0]].filter((w) => w.length > 2)));
  if (r && r.kind !== "native") {
    const linked = specs.filter((s) => s.rules.includes(r.id));
    const gaps = r.controls.filter((c) => !c.ok);
    return {
      kind: "status",
      pct: ruleCompliance(r, specs),
      text: `${r.title}: ${ruleCompliance(r, specs)}% de cumplimiento. ${linked.length} specs dependen de esta regla${gaps.length ? `; falta cubrir ${gaps.map((g) => `${g.id} (${g.text.toLowerCase()})`).join(", ")}` : " y todos sus controles están cubiertos"}.`,
      specs: linked,
    };
  }
  const req = reqs.find((x) => norm(x.title).split(" ").some((w) => w.length > 4 && t.includes(w.slice(0, 6))) || t.includes(norm(x.id)));
  if (req) {
    const st = requirementStatus(req);
    const open = req.specs.filter((s) => s.status !== "verified");
    return {
      kind: "status",
      pct: verifiedRatio(req.specs),
      text: `${req.id} · ${req.title} está ${STATUS_LABEL[st].toLowerCase()} (${verifiedRatio(req.specs)}% verificado). ${open.length ? `Quedan ${open.length} specs abiertas.` : "Todas las specs están verificadas."}`,
      specs: req.specs,
    };
  }
  if (has(t, ["falla", "fallan", "riesgo", "bloque", "problema", "atencion"])) {
    const bad = specs.filter((s) => s.status === "failing" || s.status === "risk");
    return { kind: "status", text: `Hay ${bad.length} specs que necesitan atención antes de pasar a producción.`, specs: bad };
  }
  if (has(t, ["pendiente", "falta"])) {
    const p = specs.filter((s) => s.status === "pending" || s.status === "progress");
    return { kind: "status", text: `${p.length} specs todavía no están verificadas.`, specs: p };
  }
  return {
    kind: "status",
    pct: verifiedRatio(specs),
    text: `El workspace de Bello tiene ${reqs.length} requerimientos y ${specs.length} specs: ${verifiedRatio(specs)}% verificado, ${specs.filter((s) => s.status === "failing").length} fallando y ${specs.filter((s) => s.status === "risk").length} en riesgo.`,
    specs: specs.filter((s) => s.status !== "verified"),
  };
}

function draft(raw: string, t: string, reqs: Requirement[]): Reply {
  const topics = TOPICS.filter((tp) => has(t, tp.match));
  const subject = raw.replace(/^(quiero|necesito|queremos|necesitamos|agregar|crear|que el cliente pueda|permitir)\s+/i, "").replace(/[.?!]+$/, "");
  const title = subject.charAt(0).toUpperCase() + subject.slice(1, 60);
  const id = nextRequirementId(reqs);

  if (!topics.length) {
    return {
      kind: "text",
      text: "No encontré reglas de Bello que apliquen directamente. Contame si involucra dinero, tarjetas, alta de clientes, datos personales, autenticación o inversiones, y lo armo reforzado con la normativa cargada.",
    };
  }

  const base = topics.flatMap((tp) => tp.specs(title));
  const anyFront = topics.some((tp) => tp.impacts.some((i) => i.module === "app-mobile"));
  const specs: Spec[] = base.map((s, i) => ({
    id: `${id}/FR-00${i + 1}`,
    title: s.title,
    ears: s.ears,
    status: "pending",
    owner: "cruiz",
    rules: [...new Set([...s.rules, "SPC-EARS", "BEL-OBS-04", ...(anyFront ? ["BEL-UX-05"] : [])])],
    impacts: topics.flatMap((tp) => tp.impacts).filter((im, k, arr) => arr.findIndex((x) => x.module === im.module) === k),
    files: [],
    tests: { passed: 0, total: 0 },
    updatedAt: new Date().toISOString().slice(0, 10),
  }));

  const ruleIds = [...new Set(specs.flatMap((s) => s.rules))];
  const checks: Check[] = ruleIds.map((rid) => {
    const r = ruleById(rid)!;
    const gap = r.controls.find((c) => !c.ok);
    return { ruleId: rid, ok: !gap, note: gap ? `${gap.id} aún sin cubrir en Bello: ${gap.text}` : `Controles inyectados en ${specs.filter((s) => s.rules.includes(rid)).length} specs.` };
  });

  if (has(t, ["dolar", "usd", "divisa", "moneda extranjera"])) {
    checks.push({ ruleId: "BCRA-SNP", ok: false, note: "Opera en moneda extranjera: la normativa cambiaria no está cargada en este workspace. Pedile a Speco que la agregue." });
  }
  const num = t.match(/\d[\d.]{2,}/);
  if (num && topics.some((tp) => tp.rules.includes("BCRA-SNP"))) {
    checks.push({ ruleId: "SPC-CON", ok: false, note: `El monto ${num[0]} puede contradecir BEL-101/FR-001 (límite diario por perfil). Revisalo antes de aprobar.` });
  }

  return {
    kind: "draft",
    intro: `Armé ${id} con ${specs.length} specs en formato EARS. Apliqué ${ruleIds.length} reglas del workspace: normativa, certificaciones y convenciones del código de Bello.`,
    req: { id, title, goal: raw, requestedBy: "lfernandez", createdAt: new Date().toISOString().slice(0, 10), specs },
    checks,
  };
}

export const SUGGESTIONS = [
  "Quiero que el cliente pueda programar transferencias recurrentes",
  "Agregar congelamiento temporal de tarjeta por viaje",
  "¿Cómo está el onboarding?",
  "¿Qué specs fallan o están en riesgo?",
  "¿Cuál es el estado de PCI DSS?",
];
