// Bello workspace demo: a Speco instance tailored for a fintech. All content is sample data, labelled as such in the UI.

export type Status = "verified" | "progress" | "risk" | "failing" | "pending";
export type RuleKind = "certification" | "regulation" | "native" | "bello";
export type Level = "alto" | "medio" | "bajo";

export const STATUS_LABEL: Record<Status, string> = {
  verified: "Verificada",
  progress: "En desarrollo",
  risk: "En riesgo",
  failing: "Falla verificación",
  pending: "Pendiente",
};

export const STATUS_ORDER: Status[] = ["verified", "progress", "risk", "failing", "pending"];

export const KIND_LABEL: Record<RuleKind, string> = {
  certification: "Certificación",
  regulation: "Regulación externa",
  native: "Regla nativa Speco",
  bello: "Regla propia Bello",
};

export const KIND_HINT: Record<RuleKind, string> = {
  certification: "Estándares que Bello certifica o mantiene. Cargados por Speco al configurar el workspace.",
  regulation: "Normativa del regulador y leyes que alcanzan a la entidad. Se actualizan cuando cambia el texto oficial.",
  native: "Reglas del motor de Speco: cobertura, calidad EARS y contradicciones. Aplican a toda spec.",
  bello: "Reglas extraídas del código y la arquitectura de Bello: cómo está construido hoy su sistema.",
};

export interface Person {
  id: string;
  name: string;
  role: string;
  org: "Bello" | "Speco";
  bot?: boolean;
}

export const PEOPLE: Person[] = [
  { id: "lfernandez", name: "Lucía Fernández", role: "Product Owner", org: "Bello" },
  { id: "msosa", name: "Martín Sosa", role: "Compliance Officer", org: "Bello" },
  { id: "cruiz", name: "Carla Ruiz", role: "Tech Lead", org: "Bello" },
  { id: "dpaz", name: "Diego Paz", role: "QA Lead", org: "Bello" },
  { id: "agomez", name: "Ana Gómez", role: "Consultora regulatoria", org: "Speco" },
  { id: "agent", name: "Agente Speco", role: "Asistente", org: "Speco", bot: true },
];

export const person = (id: string): Person => PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];

export interface Rule {
  id: string;
  kind: RuleKind;
  title: string;
  authority: string;
  version: string;
  summary: string;
  controls: { id: string; text: string; ok: boolean }[];
  /** for Bello rules: where in the code the rule was extracted from */
  source?: { repo: string; path: string; occurrences: number };
  loadedBy: string;
  loadedAt: string;
}

export const RULES: Rule[] = [
  {
    id: "PCI-DSS",
    kind: "certification",
    title: "PCI DSS 4.0",
    authority: "PCI Security Standards Council",
    version: "v4.0.1",
    summary: "Protección de datos de tarjetas: almacenamiento, transmisión, acceso y registro de eventos sobre el PAN.",
    controls: [
      { id: "3.4", text: "El PAN se muestra enmascarado; sólo los últimos 4 dígitos.", ok: true },
      { id: "3.5", text: "El PAN almacenado está cifrado o tokenizado.", ok: true },
      { id: "8.4", text: "MFA para todo acceso al entorno de datos de tarjeta.", ok: true },
      { id: "10.2", text: "Registro de auditoría de toda acción sobre datos de tarjeta.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-04",
  },
  {
    id: "ISO-27001",
    kind: "certification",
    title: "ISO/IEC 27001:2022",
    authority: "ISO / IEC",
    version: "2022",
    summary: "Sistema de gestión de seguridad de la información: control de accesos, criptografía y monitoreo.",
    controls: [
      { id: "A.5.15", text: "Control de acceso basado en roles y mínimo privilegio.", ok: true },
      { id: "A.8.16", text: "Monitoreo de actividades anómalas.", ok: true },
      { id: "A.8.24", text: "Uso de criptografía con gestión de claves.", ok: true },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-04",
  },
  {
    id: "SOC2",
    kind: "certification",
    title: "SOC 2 Tipo II",
    authority: "AICPA",
    version: "TSC 2017 (rev. 2022)",
    summary: "Controles de seguridad, disponibilidad y gestión de cambios evaluados en un período.",
    controls: [
      { id: "CC6.1", text: "Accesos lógicos restringidos y revisados.", ok: true },
      { id: "CC7.2", text: "Detección y respuesta a incidentes.", ok: true },
      { id: "CC8.1", text: "Todo cambio a producción está autorizado y trazado.", ok: true },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-05",
  },
  {
    id: "BCRA-7724",
    kind: "regulation",
    title: "BCRA Com. «A» 7724",
    authority: "Banco Central de la República Argentina",
    version: "Texto vigente",
    summary: "Requisitos mínimos de gestión de riesgos de tecnología y seguridad de la información: autenticación, gestión de incidentes, terceros.",
    controls: [
      { id: "AUT", text: "Autenticación reforzada (2 factores) para operaciones monetarias.", ok: true },
      { id: "INC", text: "Registro y reporte de incidentes de seguridad.", ok: true },
      { id: "TER", text: "Gestión de proveedores de servicios tecnológicos.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-06",
  },
  {
    id: "BCRA-SNP",
    kind: "regulation",
    title: "BCRA · Transferencias inmediatas",
    authority: "Banco Central de la República Argentina",
    version: "Sistema Nacional de Pagos",
    summary: "Transferencias inmediatas 24x7, límites por perfil, comprobante y acreditación en línea.",
    controls: [
      { id: "LIM", text: "Límites configurables por perfil de cliente.", ok: true },
      { id: "CMP", text: "Comprobante con identificación única de la operación.", ok: true },
      { id: "ACR", text: "Acreditación inmediata al destinatario.", ok: true },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-06",
  },
  {
    id: "UIF-30",
    kind: "regulation",
    title: "UIF Res. 30/2017",
    authority: "Unidad de Información Financiera",
    version: "Texto vigente",
    summary: "Prevención de lavado de activos: debida diligencia del cliente, PEP, monitoreo y reporte de operaciones sospechosas.",
    controls: [
      { id: "DDC", text: "Identificación y validación del cliente al alta.", ok: true },
      { id: "PEP", text: "Control contra listas PEP y sanciones.", ok: true },
      { id: "ROS", text: "Reporte de operaciones sospechosas.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-07",
  },
  {
    id: "LEY-25326",
    kind: "regulation",
    title: "Ley 25.326 · Datos personales",
    authority: "Agencia de Acceso a la Información Pública",
    version: "Texto vigente",
    summary: "Consentimiento informado, finalidad, derechos de acceso, rectificación y supresión de datos personales.",
    controls: [
      { id: "CON", text: "Consentimiento expreso y registrado.", ok: true },
      { id: "ARS", text: "Acceso, rectificación y supresión en 10 días hábiles.", ok: true },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-07",
  },
  {
    id: "SPC-COV",
    kind: "native",
    title: "Cobertura (COV001-COV006)",
    authority: "Motor Speco",
    version: "1.8",
    summary: "Todo requisito tiene plan y tareas; ninguna tarea queda sin requisito (scope colado).",
    controls: [
      { id: "COV001", text: "Requisito con correlato en el plan.", ok: true },
      { id: "COV002", text: "Paso del plan que responde a un requisito.", ok: true },
    ],
    loadedBy: "agent",
    loadedAt: "2026-08-01",
  },
  {
    id: "SPC-EARS",
    kind: "native",
    title: "Calidad EARS (QUA001-QUA008)",
    authority: "Motor Speco",
    version: "1.8",
    summary: "Requisitos testeables, sin ambigüedad, con umbral medible y criterio de aceptación.",
    controls: [
      { id: "QUA001", text: "Forma EARS: When <trigger>, the system MUST <response>.", ok: true },
      { id: "QUA005", text: "Cada requisito tiene criterio de aceptación.", ok: false },
    ],
    loadedBy: "agent",
    loadedAt: "2026-08-01",
  },
  {
    id: "SPC-CON",
    kind: "native",
    title: "Contradicciones (CON001-CON002)",
    authority: "Motor Speco",
    version: "1.8",
    summary: "Detecta requisitos que fijan valores distintos para lo mismo, entre specs y contra decisiones ya tomadas.",
    controls: [{ id: "CON001", text: "Sin valores contradictorios entre requisitos.", ok: true }],
    loadedBy: "agent",
    loadedAt: "2026-08-01",
  },
  {
    id: "BEL-ARCH-01",
    kind: "bello",
    title: "Todo movimiento pasa por core-ledger",
    authority: "Arquitectura Bello",
    version: "main@4f2a91c",
    summary: "Ningún servicio escribe saldos directamente: todo débito o crédito es un asiento en core-ledger con clave de idempotencia.",
    controls: [
      { id: "IDEMP", text: "Toda operación monetaria lleva idempotency-key.", ok: true },
      { id: "DOBLE", text: "Asiento de partida doble balanceado.", ok: true },
    ],
    source: { repo: "bello/core-ledger", path: "src/ledger/post_entry.ts", occurrences: 38 },
    loadedBy: "cruiz",
    loadedAt: "2026-08-10",
  },
  {
    id: "BEL-MNY-02",
    kind: "bello",
    title: "Montos en centavos (int64)",
    authority: "Convención de código Bello",
    version: "main@4f2a91c",
    summary: "Los importes se representan como enteros en centavos con moneda ISO 4217; nunca como float.",
    controls: [{ id: "INT", text: "Sin tipos float en importes.", ok: true }],
    source: { repo: "bello/payments-api", path: "src/money/Money.ts", occurrences: 112 },
    loadedBy: "cruiz",
    loadedAt: "2026-08-10",
  },
  {
    id: "BEL-SEC-03",
    kind: "bello",
    title: "Datos sensibles nunca en logs",
    authority: "Seguridad Bello",
    version: "main@4f2a91c",
    summary: "PAN, CVV, DNI y tokens se redactan en el logger central; un lint bloquea el PR si aparecen.",
    controls: [
      { id: "REDACT", text: "Logger con redacción de campos sensibles.", ok: true },
      { id: "LINT", text: "Regla de lint no-sensitive-log activa en CI.", ok: false },
    ],
    source: { repo: "bello/platform", path: "packages/logger/redact.ts", occurrences: 21 },
    loadedBy: "cruiz",
    loadedAt: "2026-08-11",
  },
  {
    id: "BEL-OBS-04",
    kind: "bello",
    title: "Evento de auditoría por operación sensible",
    authority: "Plataforma Bello",
    version: "main@4f2a91c",
    summary: "Toda operación sensible publica audit.event con actor, recurso y resultado en el bus de eventos.",
    controls: [{ id: "AUDIT", text: "audit.event emitido y persistido 7 años.", ok: true }],
    source: { repo: "bello/platform", path: "packages/audit/emit.ts", occurrences: 54 },
    loadedBy: "cruiz",
    loadedAt: "2026-08-11",
  },
  {
    id: "BEL-UX-05",
    kind: "bello",
    title: "Accesibilidad WCAG 2.2 AA",
    authority: "Design System Bello",
    version: "ds@3.2",
    summary: "Toda pantalla nueva usa componentes del design system y pasa contraste AA y navegación por teclado/lector.",
    controls: [{ id: "AA", text: "Contraste y foco visibles en todos los componentes.", ok: true }],
    source: { repo: "bello/design-system", path: "src/tokens.ts", occurrences: 9 },
    loadedBy: "lfernandez",
    loadedAt: "2026-08-12",
  },
];

export const rule = (id: string): Rule | undefined => RULES.find((r) => r.id === id);

export interface Module {
  id: string;
  name: string;
  repo: string;
  kind: "backend" | "frontend" | "data";
}

export const MODULES: Module[] = [
  { id: "core-ledger", name: "core-ledger", repo: "bello/core-ledger", kind: "backend" },
  { id: "payments-api", name: "payments-api", repo: "bello/payments-api", kind: "backend" },
  { id: "risk-engine", name: "risk-engine", repo: "bello/risk-engine", kind: "backend" },
  { id: "onboarding-svc", name: "onboarding-svc", repo: "bello/onboarding", kind: "backend" },
  { id: "cards-svc", name: "cards-svc", repo: "bello/cards", kind: "backend" },
  { id: "app-mobile", name: "app-mobile", repo: "bello/app", kind: "frontend" },
  { id: "web-banking", name: "web-banking", repo: "bello/web", kind: "frontend" },
  { id: "reporting", name: "reporting-bcra", repo: "bello/reporting", kind: "data" },
];

export const moduleById = (id: string): Module | undefined => MODULES.find((m) => m.id === id);

export interface Spec {
  id: string;
  title: string;
  ears: string;
  status: Status;
  owner: string;
  approvedBy?: string;
  rules: string[];
  impacts: { module: string; level: Level; note: string }[];
  design?: string;
  files: string[];
  tests: { passed: number; total: number };
  updatedAt: string;
}

export interface Requirement {
  id: string;
  title: string;
  goal: string;
  requestedBy: string;
  createdAt: string;
  specs: Spec[];
  isNew?: boolean;
}

export const REQUIREMENTS: Requirement[] = [
  {
    id: "BEL-101",
    title: "Transferencias inmediatas",
    goal: "Que el cliente transfiera 24x7 con límites por perfil y confirmación segura.",
    requestedBy: "lfernandez",
    createdAt: "2026-08-14",
    specs: [
      {
        id: "BEL-101/FR-001",
        title: "Límite diario por perfil",
        ears: "When a client submits a transfer, the system MUST reject it if the amount exceeds the remaining daily limit of the client's profile.",
        status: "verified",
        owner: "cruiz",
        approvedBy: "msosa",
        rules: ["BCRA-SNP", "BEL-ARCH-01", "BEL-MNY-02", "SPC-EARS"],
        impacts: [
          { module: "payments-api", level: "alto", note: "Nuevo validador de límites antes del asiento." },
          { module: "core-ledger", level: "medio", note: "Consulta de acumulado diario por cliente." },
          { module: "app-mobile", level: "bajo", note: "Barra de límite disponible." },
        ],
        design: "/bello/design-transfer.png",
        files: ["payments-api/src/limits/dailyLimit.ts", "core-ledger/src/queries/dailyTotal.ts"],
        tests: { passed: 24, total: 24 },
        updatedAt: "2026-10-18",
      },
      {
        id: "BEL-101/FR-002",
        title: "Confirmación con segundo factor",
        ears: "When a transfer exceeds ARS 100.000, the system MUST require a one-time code delivered by SMS or push before posting.",
        status: "verified",
        owner: "cruiz",
        approvedBy: "msosa",
        rules: ["BCRA-7724", "PCI-DSS", "ISO-27001", "BEL-OBS-04"],
        impacts: [
          { module: "payments-api", level: "medio", note: "Paso de desafío OTP." },
          { module: "app-mobile", level: "alto", note: "Pantalla de código y reenvío." },
        ],
        design: "/bello/design-2fa.png",
        files: ["payments-api/src/auth/otpChallenge.ts", "app/src/screens/ConfirmOtp.tsx"],
        tests: { passed: 18, total: 18 },
        updatedAt: "2026-10-19",
      },
      {
        id: "BEL-101/FR-003",
        title: "Detección de fraude en tiempo real",
        ears: "When the risk score of a transfer is above 80, the system MUST hold it for manual review within 200 ms.",
        status: "risk",
        owner: "cruiz",
        rules: ["UIF-30", "BCRA-7724", "SPC-EARS"],
        impacts: [
          { module: "risk-engine", level: "alto", note: "Modelo de scoring y cola de revisión." },
          { module: "payments-api", level: "medio", note: "Estado 'retenida' en la operación." },
        ],
        files: ["risk-engine/src/score.ts"],
        tests: { passed: 9, total: 14 },
        updatedAt: "2026-10-21",
      },
      {
        id: "BEL-101/FR-004",
        title: "Comprobante con ID único",
        ears: "When a transfer is credited, the system MUST issue a receipt with a unique operation id within 2 seconds.",
        status: "progress",
        owner: "dpaz",
        rules: ["BCRA-SNP", "BEL-OBS-04"],
        impacts: [
          { module: "payments-api", level: "bajo", note: "Generación de comprobante PDF." },
          { module: "web-banking", level: "bajo", note: "Descarga desde el historial." },
        ],
        files: ["payments-api/src/receipts/issue.ts"],
        tests: { passed: 4, total: 10 },
        updatedAt: "2026-10-22",
      },
    ],
  },
  {
    id: "BEL-102",
    title: "Onboarding digital con KYC",
    goal: "Abrir una cuenta en menos de 5 minutos cumpliendo debida diligencia.",
    requestedBy: "lfernandez",
    createdAt: "2026-08-20",
    specs: [
      {
        id: "BEL-102/FR-001",
        title: "Validación de identidad y prueba de vida",
        ears: "When a prospect uploads their ID and selfie, the system MUST validate identity and liveness before creating the account.",
        status: "verified",
        owner: "cruiz",
        approvedBy: "msosa",
        rules: ["UIF-30", "LEY-25326", "BEL-UX-05"],
        impacts: [
          { module: "onboarding-svc", level: "alto", note: "Integración con validador biométrico." },
          { module: "app-mobile", level: "alto", note: "Flujo de cámara y guía." },
        ],
        design: "/bello/design-kyc.png",
        files: ["onboarding/src/kyc/verify.ts", "app/src/screens/Liveness.tsx"],
        tests: { passed: 31, total: 31 },
        updatedAt: "2026-10-10",
      },
      {
        id: "BEL-102/FR-002",
        title: "Control PEP y listas de sanciones",
        ears: "When identity is validated, the system MUST screen the prospect against PEP and sanctions lists and block the account on a match.",
        status: "failing",
        owner: "dpaz",
        rules: ["UIF-30", "SPC-COV", "SPC-EARS"],
        impacts: [
          { module: "onboarding-svc", level: "medio", note: "Llamada a proveedor de listas." },
          { module: "risk-engine", level: "medio", note: "Alerta a compliance." },
          { module: "reporting", level: "bajo", note: "Registro para ROS." },
        ],
        files: ["onboarding/src/kyc/pepScreening.ts"],
        tests: { passed: 6, total: 11 },
        updatedAt: "2026-10-23",
      },
      {
        id: "BEL-102/FR-003",
        title: "Consentimiento de datos personales",
        ears: "When a prospect accepts terms, the system MUST store a versioned, timestamped consent record linked to the account.",
        status: "verified",
        owner: "lfernandez",
        approvedBy: "msosa",
        rules: ["LEY-25326", "BEL-OBS-04"],
        impacts: [{ module: "onboarding-svc", level: "bajo", note: "Tabla de consentimientos versionada." }],
        files: ["onboarding/src/consent/record.ts"],
        tests: { passed: 8, total: 8 },
        updatedAt: "2026-09-28",
      },
    ],
  },
  {
    id: "BEL-103",
    title: "Tarjeta virtual",
    goal: "Emitir una tarjeta de débito virtual al instante y darle control al cliente.",
    requestedBy: "lfernandez",
    createdAt: "2026-09-02",
    specs: [
      {
        id: "BEL-103/FR-001",
        title: "PAN enmascarado y tokenizado",
        ears: "When the card is displayed, the system MUST show only the last 4 digits and MUST never store the PAN outside the vault.",
        status: "verified",
        owner: "cruiz",
        approvedBy: "msosa",
        rules: ["PCI-DSS", "BEL-SEC-03", "ISO-27001"],
        impacts: [
          { module: "cards-svc", level: "alto", note: "Vault de tokenización." },
          { module: "app-mobile", level: "medio", note: "Componente de tarjeta enmascarada." },
        ],
        design: "/bello/design-card.png",
        files: ["cards/src/vault/tokenize.ts", "app/src/components/CardView.tsx"],
        tests: { passed: 22, total: 22 },
        updatedAt: "2026-10-05",
      },
      {
        id: "BEL-103/FR-002",
        title: "Congelar y descongelar tarjeta",
        ears: "When the client toggles freeze, the system MUST decline new authorizations within 5 seconds and log an audit event.",
        status: "progress",
        owner: "cruiz",
        rules: ["PCI-DSS", "BEL-OBS-04", "SPC-EARS"],
        impacts: [
          { module: "cards-svc", level: "medio", note: "Estado congelada en el autorizador." },
          { module: "app-mobile", level: "bajo", note: "Toggle con confirmación." },
        ],
        design: "/bello/design-card.png",
        files: ["cards/src/authorizer/freeze.ts"],
        tests: { passed: 7, total: 12 },
        updatedAt: "2026-10-22",
      },
      {
        id: "BEL-103/FR-003",
        title: "Registro de auditoría sobre datos de tarjeta",
        ears: "When any actor reads or changes card data, the system MUST record who, what and when in an immutable log.",
        status: "pending",
        owner: "dpaz",
        rules: ["PCI-DSS", "SOC2", "BEL-OBS-04"],
        impacts: [
          { module: "cards-svc", level: "medio", note: "Hooks de auditoría." },
          { module: "reporting", level: "bajo", note: "Retención 1 año online." },
        ],
        files: [],
        tests: { passed: 0, total: 0 },
        updatedAt: "2026-10-23",
      },
    ],
  },
  {
    id: "BEL-104",
    title: "Cuenta remunerada",
    goal: "Pagar intereses diarios sobre el saldo y reportarlo al regulador.",
    requestedBy: "msosa",
    createdAt: "2026-09-15",
    specs: [
      {
        id: "BEL-104/FR-001",
        title: "Devengamiento diario de intereses",
        ears: "When the daily close runs, the system MUST accrue interest on the end-of-day balance using the current TNA, rounded to the cent.",
        status: "verified",
        owner: "cruiz",
        approvedBy: "msosa",
        rules: ["BEL-ARCH-01", "BEL-MNY-02", "SPC-CON"],
        impacts: [
          { module: "core-ledger", level: "alto", note: "Job de cierre diario." },
          { module: "app-mobile", level: "bajo", note: "Gráfico de ganancia diaria." },
        ],
        design: "/bello/design-savings.png",
        files: ["core-ledger/src/jobs/accrueInterest.ts"],
        tests: { passed: 16, total: 16 },
        updatedAt: "2026-10-12",
      },
      {
        id: "BEL-104/FR-002",
        title: "Régimen informativo al BCRA",
        ears: "When the month closes, the system MUST generate the regulatory report of remunerated balances by the 10th business day.",
        status: "pending",
        owner: "msosa",
        rules: ["BCRA-7724", "SPC-COV"],
        impacts: [{ module: "reporting", level: "alto", note: "Nuevo extracto mensual." }],
        files: [],
        tests: { passed: 0, total: 0 },
        updatedAt: "2026-10-20",
      },
    ],
  },
];

export interface TraceEventSeed {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export const EVENT_SEED: TraceEventSeed[] = [
  { at: "2026-08-04T10:12:00Z", actor: "agomez", action: "cargó certificación", target: "PCI-DSS", detail: "PCI DSS 4.0.1 · 4 controles mapeados" },
  { at: "2026-08-06T14:40:00Z", actor: "agomez", action: "cargó regulación", target: "BCRA-7724", detail: "Texto vigente · 3 controles" },
  { at: "2026-08-07T09:05:00Z", actor: "agomez", action: "cargó regulación", target: "UIF-30", detail: "Debida diligencia, PEP y ROS" },
  { at: "2026-08-10T16:22:00Z", actor: "cruiz", action: "extrajo reglas del código", target: "BEL-ARCH-01", detail: "bello/core-ledger · 38 ocurrencias" },
  { at: "2026-08-14T11:00:00Z", actor: "lfernandez", action: "creó requerimiento", target: "BEL-101", detail: "Transferencias inmediatas" },
  { at: "2026-08-14T11:03:00Z", actor: "agent", action: "redactó specs EARS", target: "BEL-101", detail: "4 specs · 6 reglas aplicadas" },
  { at: "2026-08-16T15:30:00Z", actor: "msosa", action: "aprobó spec", target: "BEL-101/FR-001", detail: "Cumple BCRA-SNP LIM" },
  { at: "2026-08-20T10:10:00Z", actor: "lfernandez", action: "creó requerimiento", target: "BEL-102", detail: "Onboarding digital con KYC" },
  { at: "2026-09-02T12:45:00Z", actor: "lfernandez", action: "creó requerimiento", target: "BEL-103", detail: "Tarjeta virtual" },
  { at: "2026-10-05T17:20:00Z", actor: "dpaz", action: "verificó tests", target: "BEL-103/FR-001", detail: "22/22 en CI · commit 9c1e7d2" },
  { at: "2026-10-18T13:02:00Z", actor: "dpaz", action: "verificó tests", target: "BEL-101/FR-001", detail: "24/24 en CI · commit a71b04f" },
  { at: "2026-10-21T09:48:00Z", actor: "agent", action: "marcó en riesgo", target: "BEL-101/FR-003", detail: "Latencia p95 340 ms > 200 ms" },
  { at: "2026-10-23T08:15:00Z", actor: "agent", action: "detectó falla", target: "BEL-102/FR-002", detail: "5 tests fallan tras cambio de proveedor" },
  { at: "2026-10-23T18:30:00Z", actor: "msosa", action: "solicitó revisión", target: "BEL-103/FR-003", detail: "Requisito PCI 10.2 sin cubrir" },
];

/** weekly % of specs verified (static history for the trend chart) */
export const VERIFICATION_TREND = [
  { week: "S35", value: 12 },
  { week: "S36", value: 18 },
  { week: "S37", value: 25 },
  { week: "S38", value: 31 },
  { week: "S39", value: 38 },
  { week: "S40", value: 44 },
  { week: "S41", value: 49 },
  { week: "S42", value: 50 },
];
