import { MODULES, RULES, type Requirement, type Spec, type Status } from "../../src/bello/data.js";
import { appendEvents, bad, clip, insertRequirement, isPerson, json, loadState, readJson, tx } from "../_lib/db.js";

const STATUSES: Status[] = ["verified", "progress", "risk", "failing", "pending"];
const LEVELS = ["alto", "medio", "bajo"] as const;
const ruleIds = new Set(RULES.map((r) => r.id));
const moduleIds = new Set(MODULES.map((m) => m.id));

/** Accepts the requirement the assistant drafted, keeping only known fields, rules and modules. */
function sanitize(raw: Requirement, id: string, actor: string): Requirement {
  const specs: Spec[] = (Array.isArray(raw.specs) ? raw.specs : []).slice(0, 12).map((s, i) => ({
    id: `${id}/FR-${String(i + 1).padStart(3, "0")}`,
    title: clip(s.title, 160) || `Spec ${i + 1}`,
    ears: clip(s.ears, 1000),
    status: STATUSES.includes(s.status) ? s.status : "pending",
    owner: isPerson(s.owner) ? s.owner : "cruiz",
    rules: (Array.isArray(s.rules) ? s.rules : []).filter((r) => ruleIds.has(r)),
    impacts: (Array.isArray(s.impacts) ? s.impacts : [])
      .filter((im) => moduleIds.has(im.module))
      .map((im) => ({ module: im.module, level: LEVELS.includes(im.level) ? im.level : "medio", note: clip(im.note, 200) })),
    files: [],
    tests: { passed: 0, total: 0 },
    updatedAt: new Date().toISOString().slice(0, 10),
  }));
  return {
    id,
    title: clip(raw.title, 160) || "Nuevo requerimiento",
    goal: clip(raw.goal, 1000),
    requestedBy: actor,
    createdAt: new Date().toISOString().slice(0, 10),
    specs,
    isNew: true,
  };
}

export async function POST(request: Request) {
  const body = await readJson<{ requirement?: Requirement; actor?: string }>(request);
  if (!body?.requirement || !isPerson(body.actor)) return bad("Datos inválidos");
  const actor = body.actor;
  try {
    const state = await tx(async (c) => {
      await c.query("LOCK TABLE bello_requirements IN EXCLUSIVE MODE");
      const { rows } = await c.query("SELECT id, position FROM bello_requirements");
      const max = Math.max(100, ...rows.map((r) => Number(String(r.id).split("-")[1]) || 0));
      const minPos = Math.min(0, ...rows.map((r) => r.position));
      const req = sanitize(body.requirement!, `BEL-${max + 1}`, actor);
      if (!req.specs.length) throw new Error("empty");
      await insertRequirement(c, req, minPos - 1);
      await appendEvents(c, [
        { actor, action: "creó requerimiento", target: req.id, detail: req.title },
        { actor: "agent", action: "redactó specs EARS", target: req.id, detail: `${req.specs.length} specs · ${new Set(req.specs.flatMap((s) => s.rules)).size} reglas aplicadas` },
      ]);
      return loadState(c);
    });
    return json(state, 201);
  } catch (e) {
    console.error("[bello] create requirement failed", e);
    return bad("No se pudo crear el requerimiento", 500);
  }
}
