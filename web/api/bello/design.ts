import { generateImage } from "ai";
import type { DesignVersion, Spec } from "../../src/bello/data.js";
import { designPrompt } from "../../src/bello/designStyle.js";
import { appendEvents, bad, clip, isPerson, json, loadState, query, readJson, tx } from "../_lib/db.js";

const MODEL = "openai/gpt-image-1.5";

interface Body {
  actor?: string;
  specId?: string;
  note?: string;
}

/** Generates a new frontend design for a spec following the Belo visual pattern, versions the previous one and chains the event. */
export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !isPerson(body.actor) || typeof body.specId !== "string") return bad("Datos inválidos");
  const { actor, specId } = body as Required<Body>;
  const note = clip(body.note, 400);

  const found = await query<{ data: Spec }>("SELECT data FROM bello_specs WHERE id = $1", [specId]);
  const spec = found[0]?.data;
  if (!spec) return bad("Spec no encontrada", 404);

  let bytes: Uint8Array;
  let mime: string;
  try {
    const { image } = await generateImage({ model: MODEL, prompt: designPrompt(spec, note), size: "1024x1536" });
    bytes = image.uint8Array;
    mime = image.mediaType || "image/png";
  } catch (e) {
    console.error("[bello] design generation failed", e);
    const billing = /credit card/i.test((e as Error).message ?? "");
    return bad(
      billing
        ? "AI Gateway necesita una tarjeta registrada en el equipo de Vercel para generar imágenes (incluye créditos gratis)."
        : "No se pudo generar el diseño. Probá de nuevo en unos segundos.",
      502,
    );
  }

  try {
    const state = await tx(async (c) => {
      const { rows } = await c.query("INSERT INTO bello_designs (spec_id, mime, data) VALUES ($1,$2,$3) RETURNING id", [specId, mime, Buffer.from(bytes)]);
      const src = `/api/bello/design-image?id=${rows[0].id}`;
      const cur = await c.query("SELECT data FROM bello_specs WHERE id = $1 FOR UPDATE", [specId]);
      const s: Spec = cur.rows[0].data;
      const history: DesignVersion[] = [...(s.designHistory ?? [])];
      if (s.design) {
        history.push({ version: `v${history.length + 1}`, src: s.design, date: s.designMeta?.date ?? s.updatedAt, by: s.designMeta?.by ?? s.owner, note: s.designMeta?.note ?? "Versión anterior." });
      }
      const today = new Date().toISOString().slice(0, 10);
      const next: Spec = { ...s, design: src, designHistory: history, designMeta: { by: actor, date: today, note: note ? `Generado con IA: ${note}` : "Generado con IA desde la spec.", generated: true } };
      await c.query("UPDATE bello_specs SET data = $2, updated_at = now() WHERE id = $1", [specId, next]);
      await appendEvents(c, [{ actor, action: "generó diseño", target: specId, detail: `v${history.length + 1} · patrón visual Belo${note ? ` · ${note.slice(0, 80)}` : ""}` }]);
      return loadState(c);
    });
    return json(state, 201);
  } catch (e) {
    console.error("[bello] saving design failed", e);
    return bad("No se pudo guardar el diseño", 500);
  }
}
