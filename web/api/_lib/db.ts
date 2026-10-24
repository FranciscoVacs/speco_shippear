import { createHash } from "node:crypto";
import pg from "pg";
import { EVENT_SEED, PEOPLE, REG_CHANGES, REQUIREMENTS, type RegChange, type Requirement, type Spec, type TraceEventSeed } from "../../src/bello/data.js";

const GENESIS = "0".repeat(64);

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  return pool;
}

export type Tx = pg.PoolClient;

export async function tx<T>(fn: (c: Tx) => Promise<T>): Promise<T> {
  await ready();
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS bello_requirements (id text PRIMARY KEY, position integer NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS bello_specs (id text PRIMARY KEY, requirement_id text NOT NULL, position integer NOT NULL, status text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS bello_specs_req_idx ON bello_specs (requirement_id, position)`,
  `CREATE TABLE IF NOT EXISTS bello_events (seq integer PRIMARY KEY, at text NOT NULL, actor text NOT NULL, action text NOT NULL, target text NOT NULL, detail text NOT NULL, prev_hash text NOT NULL, hash text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bello_reg_changes (id text PRIMARY KEY, position integer NOT NULL, state text NOT NULL, data jsonb NOT NULL)`,
];

let readyPromise: Promise<void> | null = null;
function ready(): Promise<void> {
  readyPromise ??= (async () => {
    const p = getPool();
    for (const stmt of DDL) await p.query(stmt);
    const { rows } = await p.query("SELECT count(*)::int AS n FROM bello_requirements");
    if (rows[0].n === 0) await seed();
  })().catch((e) => {
    readyPromise = null;
    throw e;
  });
  return readyPromise;
}

/** Same payload the browser re-hashes in src/bello/hash.ts, so the chain verifies end to end. */
const payload = (e: TraceEventSeed, seq: number, prev: string) => JSON.stringify({ seq, prev, at: e.at, actor: e.actor, action: e.action, target: e.target, detail: e.detail });
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function appendEvents(c: Tx, events: Omit<TraceEventSeed, "at">[]) {
  if (!events.length) return;
  await c.query("LOCK TABLE bello_events IN EXCLUSIVE MODE");
  const { rows } = await c.query("SELECT seq, hash FROM bello_events ORDER BY seq DESC LIMIT 1");
  let seq: number = rows[0]?.seq ?? 0;
  let prev: string = rows[0]?.hash ?? GENESIS;
  const base = Date.now();
  for (let i = 0; i < events.length; i++) {
    const e = { ...events[i], at: new Date(base + i).toISOString() };
    seq += 1;
    const hash = sha256(payload(e, seq, prev));
    await c.query("INSERT INTO bello_events (seq, at, actor, action, target, detail, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [seq, e.at, e.actor, e.action, e.target, e.detail, prev, hash]);
    prev = hash;
  }
}

export async function insertRequirement(c: Tx, req: Requirement, position: number) {
  const { specs, ...rest } = req;
  await c.query("INSERT INTO bello_requirements (id, position, data) VALUES ($1,$2,$3)", [req.id, position, rest]);
  for (let i = 0; i < specs.length; i++) await insertSpec(c, req.id, specs[i], i);
}

export async function insertSpec(c: Tx, requirementId: string, spec: Spec, position: number) {
  await c.query("INSERT INTO bello_specs (id, requirement_id, position, status, data) VALUES ($1,$2,$3,$4,$5)", [spec.id, requirementId, position, spec.status, spec]);
}

async function seed() {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    await c.query("LOCK TABLE bello_requirements IN EXCLUSIVE MODE");
    const { rows } = await c.query("SELECT count(*)::int AS n FROM bello_requirements");
    if (rows[0].n === 0) {
      await c.query("TRUNCATE bello_specs, bello_events, bello_reg_changes");
      for (let i = 0; i < REQUIREMENTS.length; i++) await insertRequirement(c, REQUIREMENTS[i], i);
      for (let i = 0; i < REG_CHANGES.length; i++) {
        const rc = REG_CHANGES[i];
        await c.query("INSERT INTO bello_reg_changes (id, position, state, data) VALUES ($1,$2,$3,$4)", [rc.id, i, rc.state, rc]);
      }
      let prev = GENESIS;
      for (let i = 0; i < EVENT_SEED.length; i++) {
        const e = EVENT_SEED[i];
        const hash = sha256(payload(e, i + 1, prev));
        await c.query("INSERT INTO bello_events (seq, at, actor, action, target, detail, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [i + 1, e.at, e.actor, e.action, e.target, e.detail, prev, hash]);
        prev = hash;
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function resetDemo() {
  await ready();
  await getPool().query("TRUNCATE bello_requirements, bello_specs, bello_events, bello_reg_changes");
  await seed();
}

export interface StoredEvent extends TraceEventSeed {
  seq: number;
  prev: string;
  hash: string;
}

export interface BelloState {
  requirements: Requirement[];
  events: StoredEvent[];
  regChanges: RegChange[];
}

export async function loadState(c?: Tx): Promise<BelloState> {
  await ready();
  const q = c ?? getPool();
  const [reqs, specs, events, changes] = await Promise.all([
    q.query("SELECT data FROM bello_requirements ORDER BY position ASC"),
    q.query("SELECT requirement_id, status, data FROM bello_specs ORDER BY requirement_id, position ASC"),
    q.query("SELECT seq, at, actor, action, target, detail, prev_hash, hash FROM bello_events ORDER BY seq ASC"),
    q.query("SELECT state, data FROM bello_reg_changes ORDER BY position ASC"),
  ]);
  const byReq = new Map<string, Spec[]>();
  for (const r of specs.rows) {
    const list = byReq.get(r.requirement_id) ?? [];
    list.push({ ...r.data, status: r.status });
    byReq.set(r.requirement_id, list);
  }
  return {
    requirements: reqs.rows.map((r) => ({ ...r.data, specs: byReq.get(r.data.id) ?? [] })),
    events: events.rows.map((e) => ({ seq: e.seq, at: e.at, actor: e.actor, action: e.action, target: e.target, detail: e.detail, prev: e.prev_hash, hash: e.hash })),
    regChanges: changes.rows.map((r) => ({ ...r.data, state: r.state })),
  };
}

export const isPerson = (id: unknown): id is string => typeof id === "string" && PEOPLE.some((p) => p.id === id);

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const bad = (message: string, status = 400) => json({ error: message }, status);

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
