import { bad, json, loadState } from "../_lib/db.js";

export async function GET() {
  try {
    return json(await loadState());
  } catch (e) {
    console.error("[bello] state failed", e);
    return bad("No se pudo leer la base de datos", 500);
  }
}
