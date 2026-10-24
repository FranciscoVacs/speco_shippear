import { bad, json, loadState, resetDemo } from "../_lib/db.js";

export async function POST() {
  try {
    await resetDemo();
    return json(await loadState());
  } catch (e) {
    console.error("[bello] reset failed", e);
    return bad("No se pudo restaurar la demo", 500);
  }
}
