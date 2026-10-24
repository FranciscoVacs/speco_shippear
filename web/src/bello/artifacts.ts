import { moduleById, rule as ruleById, type Requirement, type Spec } from "./data";

export interface SpecTask {
  id: string;
  text: string;
  path?: string;
  ref?: string;
  done: boolean;
}

export interface TaskPhase {
  title: string;
  tasks: SpecTask[];
}

export interface SpecDoc {
  story: string;
  ears: string;
  criteria: { id: string; text: string; source: string }[];
  outcomes: string[];
}

export interface PlanDoc {
  summary: string;
  context: { label: string; value: string }[];
  gates: { id: string; title: string; ok: boolean; note: string }[];
  structure: string[];
  risks: string[];
}

const STACK: Record<string, string> = {
  backend: "TypeScript 5 · Node 20",
  frontend: "TypeScript 5 · React / React Native",
  data: "SQL · dbt",
};

const fileFor = (spec: Spec, moduleId: string) => {
  const m = moduleById(moduleId);
  const roots = [moduleId, m?.repo.split("/")[1]].filter(Boolean);
  return spec.files.find((f) => roots.includes(f.split("/")[0]));
};

export function buildSpecDoc(spec: Spec, req?: Requirement): SpecDoc {
  const criteria = spec.rules.flatMap((id) => {
    const r = ruleById(id);
    if (!r) return [];
    return r.controls.slice(0, 2).map((c) => ({ id: `${r.id}·${c.id}`, text: c.text, source: r.title }));
  });
  const outcomes = [
    spec.tests.total ? `${spec.tests.total} tests de aceptación en verde antes de aprobar.` : "Definir tests de aceptación antes de desarrollar.",
    ...spec.impacts.filter((i) => i.level === "alto").map((i) => `${moduleById(i.module)?.name ?? i.module}: ${i.note}`),
    "Evidencia trazable en el ledger con hash encadenado.",
  ];
  return {
    story: req ? `Como cliente de Bello, quiero ${req.goal.charAt(0).toLowerCase()}${req.goal.slice(1)}` : spec.title,
    ears: spec.ears,
    criteria,
    outcomes,
  };
}

export function buildPlan(spec: Spec): PlanDoc {
  const mods = spec.impacts.map((i) => moduleById(i.module)).filter((m) => m != null);
  const kinds = [...new Set(mods.map((m) => m.kind))];
  return {
    summary: `${spec.title}: se implementa en ${mods.map((m) => m.name).join(", ")} y se verifica contra ${spec.rules.length} reglas aplicables.`,
    context: [
      { label: "Lenguaje", value: kinds.map((k) => STACK[k]).join(" + ") },
      { label: "Repositorios", value: mods.map((m) => m.repo).join(", ") },
      { label: "Testing", value: "Vitest + pruebas de contrato entre servicios" },
      { label: "Tipo de proyecto", value: kinds.includes("frontend") ? "Servicio + interfaz de cliente" : "Servicio backend" },
    ],
    gates: spec.rules.flatMap((id) => {
      const r = ruleById(id);
      if (!r) return [];
      const ok = r.controls.every((c) => c.ok);
      return [{ id: r.id, title: r.title, ok, note: ok ? `${r.authority} · ${r.version}` : "Control pendiente de evidencia" }];
    }),
    structure: spec.files.length ? spec.files : mods.map((m) => `${m.repo.split("/")[1]}/src/…`),
    risks: [
      ...spec.impacts.filter((i) => i.level !== "bajo").map((i) => `Impacto ${i.level} en ${moduleById(i.module)?.name ?? i.module}: ${i.note}`),
      ...(spec.analysis?.related.filter((r) => r.relation === "contradicción").map((r) => `Contradicción con ${r.id}: ${r.note}`) ?? []),
    ],
  };
}

export function buildTasks(spec: Spec): TaskPhase[] {
  const draft: { title: string; tasks: Omit<SpecTask, "id" | "done">[] }[] = [
    {
      title: "Fase 1 · Preparación",
      tasks: [
        { text: "Registrar la spec y sus reglas en el ledger", ref: spec.id },
        { text: "Crear rama de trabajo y fixtures de prueba" },
      ],
    },
    {
      title: "Fase 2 · Implementación",
      tasks: spec.impacts.map((i) => ({ text: i.note, path: fileFor(spec, i.module) ?? moduleById(i.module)?.repo, ref: i.module })),
    },
    {
      title: "Fase 3 · Verificación",
      tasks: spec.rules.map((id) => ({ text: `Test de cumplimiento: ${ruleById(id)?.title ?? id}`, ref: id })),
    },
    {
      title: "Fase 4 · Aprobación",
      tasks: [{ text: "Adjuntar evidencia y pedir aprobación a Compliance", ref: "msosa" }],
    },
  ];

  const total = draft.reduce((n, p) => n + p.tasks.length, 0);
  const ratio = spec.status === "verified" ? 1 : spec.tests.total ? spec.tests.passed / spec.tests.total : 0;
  const doneCount = spec.status === "pending" ? 0 : Math.max(spec.status === "verified" ? total : 1, Math.floor(total * ratio) - 1);

  let n = 0;
  return draft.map((p) => ({
    title: p.title,
    tasks: p.tasks.map((t) => {
      n += 1;
      return { ...t, id: `T${String(n).padStart(3, "0")}`, done: n <= doneCount };
    }),
  }));
}
