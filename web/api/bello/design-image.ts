import { query } from "../_lib/db.js";

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const rows = await query<{ mime: string; data: Buffer }>("SELECT mime, data FROM bello_designs WHERE id = $1", [id]);
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].data), {
    headers: { "Content-Type": rows[0].mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
