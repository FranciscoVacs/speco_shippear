import { MODULES, type Requirement, type Status } from "../../src/bello/data.js";
import { analyzeSpec, buildSpec, type SpecDraft } from "../../src/bello/analysis.js";
import { appendEvents, bad, clip, insertRequirement, insertSpec, isPerson, json, loadState, readJson, tx } from "../_lib/db.js";

const STATUSES: Status[] = ["verified", "progress", "risk", "failing", "pending"];
const moduleIds = new Set(MODULES.map((m) => m.id));

interface CreateBody {
  actor?: string;
  requirementId?: string;
  newRequirementTitle?: string;
  title?: string;
  ears?: string;
  modules?: string[];
  owner?: string;
}

/** Creates a spec, re-runs the impact analysis on the server, flags contradicted verified specs and chains every step. */
export async function POST(request: Request) {
  const body = await readJson<CreateBody>(request);
  if (!body || !isPerson(body.actor)) return bad("Datos inválidos");
  const actor = body.actor;
  const title = clip(body.title, 160);
  const ears = clip(body.ears, 1000);
  if (title.length < 4 || ears.length < 10) return bad("Completá título y requisito");
  const modules = (Array.isArray(body.modules) ? body.modules : []).filter((m) => moduleIds.has(m)).slice(0, MODULES.length);
  const owner = isPerson(body.owner) ? body.owner : "cruiz";

  try {
    const result = await tx(async (c) => {
      await c.query("LOCK TABLE bello_requirements IN EXCLUSIVE MODE");
      const current = await loadState(c);
      let req: Requirement | undefined = current.requirements.find((r) => r.id === body.requirementId);
      const events: { actor: string; action: string; target: string; detail: string }[] = [];

      if (!req) {
        const reqTitle = clip(body.newRequirementTitle, 160);
        if (!reqTitle) throw new Error("missing requirement");
        const max = Math.max(100, ...current.requirements.map((r) => Number(r.id.split("-")[1]) || 0));
        const { rows } = await c.query("SELECT coalesce(min(position), 0) AS p FROM bello_requirements");
        req = { id: `BEL-${max + 1}`, title: reqTitle, goal: reqTitle, requestedBy: actor, createdAt: new Date().toISOString().slice(0, 10), specs: [], isNew: true };
        await insertRequirement(c, req, rows[0].p - 1);
        events.push({ actor, action: "creó requerimiento", target: req.id, detail: req.title });
      }

      const draft: SpecDraft = { requirementId: req.id, title, ears, modules, owner };
      const analysis = analyzeSpec(draft, current.requirements);
      const spec = buildSpec(draft, req, analysis);
      await insertSpec(c, req.id, spec, req.specs.length);

      for (const id of analysis.toReverify) {
        await c.query("UPDATE bello_specs SET status = 'risk', updated_at = now() WHERE id = $1 AND status = 'verified'", [id]);
      }

      events.push(
        { actor, action: "creó spec", target: spec.id, detail: spec.title },
        { actor: "agent", action: "analizó impacto", target: spec.id, detail: `${analysis.summary} · riesgo ${analysis.risk}/100` },
        ...analysis.toReverify.map((id) => ({ actor: "agent", action: "marcó en riesgo", target: id, detail: `Posible contradicción con ${spec.id}` })),
      );
      await appendEvents(c, events);
      return { spec: spec.id, ...(await loadState(c)) };
    });
    return json(result, 201);
  } catch (e) {
    console.error("[bello] create spec failed", e);
    return bad("No se pudo crear la spec", 500);
  }
}

interface StatusBody {
  actor?: string;
  specId?: string;
  status?: Status;
  action?: string;
  detail?: string;
}

export async function PATCH(request: Request) {
  const body = await readJson<StatusBody>(request);
  if (!body || !isPerson(body.actor) || typeof body.specId !== "string" || !STATUSES.includes(body.status as Status)) return bad("Datos inválidos");
  const { actor, specId, status } = body as Required<StatusBody>;
  try {
    const state = await tx(async (c) => {
      const { rowCount } = await c.query(
        `UPDATE bello_specs SET status = $2, updated_at = now(),
           data = CASE WHEN $2 = 'verified' THEN jsonb_set(data, '{approvedBy}', to_jsonb($3::text)) ELSE data END
         WHERE id = $1`,
        [specId, status, actor],
      );
      if (!rowCount) throw new Error("not found");
      await appendEvents(c, [{ actor, action: clip(body.action, 60) || "cambió estado", target: specId, detail: clip(body.detail, 300) || status }]);
      return loadState(c);
    });
    return json(state);
  } catch (e) {
    console.error("[bello] update spec failed", e);
    return bad("No se pudo actualizar la spec", 500);
  }
}
