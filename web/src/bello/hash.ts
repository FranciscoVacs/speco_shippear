import { useEffect, useState } from "react";
import type { TraceEventSeed } from "./data";

export const GENESIS = "0".repeat(64);

export interface ChainedEvent extends TraceEventSeed {
  seq: number;
  prev: string;
  hash: string;
  /** recomputed hash does not match the stored one, or the link to the previous block is broken */
  broken: boolean;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const payload = (e: TraceEventSeed, seq: number, prev: string) => JSON.stringify({ seq, prev, at: e.at, actor: e.actor, action: e.action, target: e.target, detail: e.detail });

/** Builds the chain over the original events, then re-verifies it over the (possibly tampered) ones. */
export async function buildChain(events: TraceEventSeed[], tampered?: { index: number; detail: string }): Promise<ChainedEvent[]> {
  const sealed: string[] = [];
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    prev = await sha256(payload(events[i], i + 1, prev));
    sealed.push(prev);
  }
  const out: ChainedEvent[] = [];
  let link = GENESIS;
  let brokenFrom = -1;
  for (let i = 0; i < events.length; i++) {
    const e = tampered && tampered.index === i ? { ...events[i], detail: tampered.detail } : events[i];
    const recomputed = await sha256(payload(e, i + 1, link));
    if (brokenFrom < 0 && recomputed !== sealed[i]) brokenFrom = i;
    out.push({ ...e, seq: i + 1, prev: i === 0 ? GENESIS : sealed[i - 1], hash: sealed[i], broken: brokenFrom >= 0 && i >= brokenFrom });
    link = recomputed;
  }
  return out;
}

export function useChain(events: TraceEventSeed[], tampered?: { index: number; detail: string }) {
  const [chain, setChain] = useState<ChainedEvent[] | null>(null);
  const key = tampered ? `${tampered.index}:${tampered.detail}` : "";
  useEffect(() => {
    let alive = true;
    buildChain(events, tampered).then((c) => alive && setChain(c));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, key]);
  return chain;
}

export const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
