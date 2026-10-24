import { appendEvents, bad, isPerson, json, loadState, readJson, tx } from "../_lib/db.js";

/** Analyses a regulatory change: every verified spec reinforced by the changed rule goes back to "en riesgo". */
export async function POST(request: Request) {
  const body = await readJson<{ id?: string; actor?: string }>(request);
  if (!body || typeof body.id !== "string" || !isPerson(body.actor)) return bad("Datos inválidos");
  const actor = body.actor;
  try {
    const state = await tx(async (c) => {
      const { rows } = await c.query("SELECT state, data FROM bello_reg_changes WHERE id = $1 FOR UPDATE", [body.id]);
      if (!rows.length) throw new Error("not found");
      if (rows[0].state === "analizado") return loadState(c);
      const change = rows[0].data as { id: string; ruleId: string; after: string };
      const affected = await c.query("SELECT id, status FROM bello_specs WHERE data->'rules' ? $1", [change.ruleId]);
      const toFlag = affected.rows.filter((r) => r.status === "verified").map((r) => r.id as string);
      if (toFlag.length) await c.query("UPDATE bello_specs SET status = 'risk', updated_at = now() WHERE id = ANY($1)", [toFlag]);
      await c.query("UPDATE bello_reg_changes SET state = 'analizado' WHERE id = $1", [change.id]);
      await appendEvents(c, [
        { actor: "agent", action: "detectó cambio normativo", target: change.ruleId, detail: `${change.id} · ${change.after}` },
        { actor, action: "analizó impacto", target: change.id, detail: `${affected.rows.length} specs alcanzadas · ${toFlag.length} a re-verificar` },
        ...toFlag.map((id) => ({ actor: "agent", action: "marcó en riesgo", target: id, detail: `Re-verificar por ${change.id}` })),
      ]);
      return loadState(c);
    });
    return json(state);
  } catch (e) {
    console.error("[bello] reg change failed", e);
    return bad("No se pudo analizar el cambio", 500);
  }
}
