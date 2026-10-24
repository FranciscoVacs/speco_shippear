// Bello workspace demo: a Speco instance tailored for a fintech. All content is sample data, labelled as such in the UI.

import type { SpecAnalysis } from "./analysis.js";

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
    title: "PCI DSS v4.0.1",
    authority: "PCI Security Standards Council",
    version: "v4.0.1 (jun. 2024)",
    summary: "Estándar de seguridad de datos de la industria de tarjetas: protección del PAN almacenado y en tránsito, autenticación y registro de eventos.",
    controls: [
      { id: "3.4.1", text: "El PAN se enmascara al mostrarse; como máximo BIN y últimos 4 dígitos.", ok: true },
      { id: "3.5.1", text: "El PAN almacenado es ilegible (tokenización, hash o cifrado fuerte).", ok: true },
      { id: "8.4.2", text: "MFA para todo acceso al entorno de datos de tarjetahabientes (CDE).", ok: true },
      { id: "10.2.1", text: "Registros de auditoría habilitados para todo acceso a datos de tarjetahabientes.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-04",
  },
  {
    id: "ISO-27001",
    kind: "certification",
    title: "ISO/IEC 27001:2022",
    authority: "ISO / IEC",
    version: "2022 · Anexo A",
    summary: "Sistema de gestión de seguridad de la información. Se mapean los controles del Anexo A que aplican al desarrollo de software de Bello.",
    controls: [
      { id: "A.5.15", text: "Control de acceso: reglas de acceso según necesidad y mínimo privilegio.", ok: true },
      { id: "A.8.16", text: "Actividades de monitoreo: detección de comportamiento anómalo.", ok: true },
      { id: "A.8.24", text: "Uso de criptografía y gestión de claves.", ok: true },
      { id: "A.8.28", text: "Codificación segura en todo el ciclo de desarrollo.", ok: true },
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
    version: "Texto ordenado · Requisitos mínimos de TI y SI",
    summary: "Requisitos mínimos para la gestión y control de los riesgos de tecnología y seguridad de la información de las entidades financieras.",
    controls: [
      { id: "Sec. 5", text: "Gestión de seguridad de la información: autenticación reforzada en canales electrónicos.", ok: true },
      { id: "Sec. 8", text: "Gestión de ciberincidentes: registro, respuesta y reporte.", ok: true },
      { id: "Sec. 9", text: "Desarrollo, adquisición y mantenimiento de software con requisitos de seguridad.", ok: true },
      { id: "Sec. 10", text: "Gestión de la relación con terceras partes (proveedores tecnológicos).", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-06",
  },
  {
    id: "BCRA-SNP",
    kind: "regulation",
    title: "BCRA · SNP Transferencias",
    authority: "Banco Central de la República Argentina",
    version: "Texto ordenado «Sistema Nacional de Pagos – Transferencias – Normas complementarias»",
    summary: "Transferencias inmediatas (push, pull, PCT), seguridad de canales remotos, gestión de fraude, límites mínimos y gratuidad expresada en UVA.",
    controls: [
      { id: "LIM", text: "Límites mínimos de operación y límites configurables por cliente.", ok: true },
      { id: "SEG", text: "Seguridad en canales remotos y gestión de fraude.", ok: true },
      { id: "CMP", text: "Comprobante con identificación única de la operación.", ok: true },
      { id: "GRA", text: "Condiciones de gratuidad según montos expresados en UVA.", ok: true },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-06",
  },
  {
    id: "UIF-14",
    kind: "regulation",
    title: "UIF Res. 14/2023",
    authority: "Unidad de Información Financiera",
    version: "Vigente desde 01/04/2023 · derogó Res. 30/2017",
    summary: "Prevención de lavado de activos y financiación del terrorismo con enfoque basado en riesgo para entidades financieras: debida diligencia, monitoreo y reporte.",
    controls: [
      { id: "DDC", text: "Debida diligencia del cliente al alta, según matriz de riesgo.", ok: true },
      { id: "MON", text: "Monitoreo transaccional con alertas por perfil del cliente.", ok: true },
      { id: "ROS", text: "Reporte de operaciones sospechosas a la UIF.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-07",
  },
  {
    id: "UIF-PEP",
    kind: "regulation",
    title: "UIF Res. 35/2023 · PEP",
    authority: "Unidad de Información Financiera",
    version: "Complementada por Res. 192/2024",
    summary: "Personas Expuestas Políticamente: la condición persiste durante el cargo y hasta 2 años después del cese; exige debida diligencia reforzada.",
    controls: [
      { id: "DJ", text: "Declaración jurada PEP al alta del cliente.", ok: true },
      { id: "DDR", text: "Debida diligencia reforzada y monitoreo continuo para PEP.", ok: true },
      { id: "OC", text: "Aprobación del oficial de cumplimiento para dar de alta un PEP.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-07",
  },
  {
    id: "LEY-25326",
    kind: "regulation",
    title: "Ley 25.326 · Datos personales",
    authority: "Agencia de Acceso a la Información Pública (AAIP)",
    version: "Ley de Protección de los Datos Personales",
    summary: "Consentimiento libre, expreso e informado; finalidad; derechos de acceso, rectificación y supresión de datos personales.",
    controls: [
      { id: "Art. 5", text: "Consentimiento libre, expreso e informado, registrado.", ok: true },
      { id: "Art. 14", text: "Derecho de acceso: respuesta dentro de 10 días corridos.", ok: true },
      { id: "Art. 16", text: "Rectificación o supresión dentro de 5 días hábiles.", ok: true },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-07",
  },
  {
    id: "BCRA-PUSF",
    kind: "regulation",
    title: "BCRA · Protección de usuarios",
    authority: "Banco Central de la República Argentina",
    version: "Texto ordenado «Protección de los usuarios de servicios financieros»",
    summary: "Información clara sobre tasas, costos y comisiones; comprobantes de las operaciones y canales de atención de reclamos.",
    controls: [
      { id: "INF", text: "Tasas (TNA/TEA) y costos visibles antes de contratar.", ok: true },
      { id: "CMP", text: "Comprobante de cada operación disponible para el usuario.", ok: true },
      { id: "REC", text: "Canal de reclamos accesible desde la app.", ok: false },
    ],
    loadedBy: "agomez",
    loadedAt: "2026-08-08",
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
  /** earlier versions of the frontend design, oldest first; `design` is always the current one */
  designHistory?: DesignVersion[];
  /** who produced the current design and how; set when the design is generated from the spec */
  designMeta?: { by: string; date: string; note: string; generated?: boolean };
  files: string[];
  tests: { passed: number; total: number };
  updatedAt: string;
  /** impact analysis computed when the spec was created from the app */
  analysis?: SpecAnalysis;
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
        designHistory: [{ version: "v1", src: "/bello/design-transfer-v1.png", date: "2026-08-15", by: "lfernandez", note: "Primer boceto sin barra de límite." }],
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
        rules: ["UIF-14", "BCRA-7724", "SPC-EARS"],
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
        design: "/bello/design-receipt.png",
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
        rules: ["UIF-14", "LEY-25326", "BEL-UX-05"],
        impacts: [
          { module: "onboarding-svc", level: "alto", note: "Integración con validador biométrico." },
          { module: "app-mobile", level: "alto", note: "Flujo de cámara y guía." },
        ],
        design: "/bello/design-kyc.png",
        designHistory: [{ version: "v1", src: "/bello/design-kyc-v1.png", date: "2026-08-22", by: "lfernandez", note: "Sin guía de prueba de vida: no cumplía UIF DDC." }],
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
        rules: ["UIF-14", "SPC-COV", "SPC-EARS"],
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
        designHistory: [{ version: "v1", src: "/bello/design-card-v1.png", date: "2026-09-04", by: "cruiz", note: "Mostraba «Ver datos» sin MFA previo (PCI 8.4)." }],
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
        design: "/bello/design-freeze.png",
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
  { at: "2026-08-07T09:05:00Z", actor: "agomez", action: "cargó regulación", target: "UIF-14", detail: "Res. UIF 14/2023 · DDC, monitoreo y ROS" },
  { at: "2026-08-07T09:20:00Z", actor: "agomez", action: "cargó regulación", target: "UIF-PEP", detail: "Res. UIF 35/2023 y 192/2024" },
  { at: "2026-08-08T10:00:00Z", actor: "agomez", action: "cargó regulación", target: "BCRA-PUSF", detail: "Protección de usuarios de servicios financieros" },
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

export interface DesignVersion {
  version: string;
  src: string;
  date: string;
  by: string;
  note: string;
}

export interface RegChange {
  id: string;
  ruleId: string;
  title: string;
  publishedAt: string;
  summary: string;
  before: string;
  after: string;
  /** "nuevo": detected, not analysed yet · "analizado": affected specs were flagged for re-verification */
  state: "nuevo" | "analizado";
}

/** Sample alerts from the regulatory watch Speco runs for Bello. Texts are illustrative, not official. */
export const REG_CHANGES: RegChange[] = [
  {
    id: "CHG-2026-14",
    ruleId: "BCRA-SNP",
    title: "Simulación: nuevo tope para transferencias sin validación adicional",
    publishedAt: "2026-10-22",
    summary: "El regulador baja el monto a partir del cual se exige validación reforzada y pide mostrar el límite disponible antes de confirmar.",
    before: "Validación reforzada desde ARS 100.000",
    after: "Validación reforzada desde ARS 50.000 y límite visible antes de confirmar",
    state: "nuevo",
  },
  {
    id: "CHG-2024-192",
    ruleId: "UIF-PEP",
    title: "Res. UIF 192/2024 precisa el alcance de PEP",
    publishedAt: "2024-12-02",
    summary: "Complementa la Res. 35/2023: precisa quiénes revisten la condición de PEP. Las specs de onboarding deben revalidar la declaración jurada.",
    before: "Alcance PEP según Res. 35/2023",
    after: "Alcance PEP precisado por Res. 192/2024",
    state: "nuevo",
  },
  {
    id: "CHG-2025-PCI",
    ruleId: "PCI-DSS",
    title: "Requisitos «future-dated» de PCI DSS 4.0 pasan a obligatorios",
    publishedAt: "2025-03-31",
    summary: "Los requisitos que eran best practice hasta el 31/03/2025 pasan a ser exigibles en la evaluación (p. ej. MFA para todo acceso al CDE).",
    before: "8.4.2 (MFA en todo acceso al CDE) recomendado",
    after: "8.4.2 obligatorio en la evaluación anual",
    state: "analizado",
  },
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
