// Loads every feature's report once so the pages for the person who approves (the sidebar badge, /decisions) can show
// verdicts without opening each review. Cached per loader; failures of single features are tolerated.
import { useEffect, useState } from "react";
import { useData } from "../DataContext";
import type { Loader } from "../data";
import type { FeatureInfo, Finding, Report } from "../types";

export interface FeatureDecision {
  info: FeatureInfo;
  report: Report | null;
}

const cache = new WeakMap<Loader, Promise<FeatureDecision[]>>();

export function loadAll(loader: Loader): Promise<FeatureDecision[]> {
  let p = cache.get(loader);
  if (!p) {
    p = Promise.all(
      loader.features.map(async (info) => {
        try {
          return { info, report: (await loader.load(info.id)).report };
        } catch {
          return { info, report: null };
        }
      }),
    );
    cache.set(loader, p);
  }
  return p;
}

export function useDecisions(): { items: FeatureDecision[]; loading: boolean } {
  const { loader } = useData();
  const [items, setItems] = useState<FeatureDecision[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!loader || loader.issue) {
      setItems([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    loadAll(loader).then((r) => {
      if (live) {
        setItems(r);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [loader]);
  return { items, loading };
}

/** Findings only the approver can resolve (suggestions never ask for a decision). */
export const mine = (r: Report | null): Finding[] => (r ? r.findings.filter((f) => f.owner === "decision" && f.severity !== "suggestion") : []);
export const URGENCY = { needs_decision: 0, blocked: 1, needs_work: 2, ready: 3 } as const;
