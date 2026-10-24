// Goal -> feature traceability per repository (backend `product.py`). The product layer is opt-in: repositories without a
// product/ folder simply have no entry, and the UI shows nothing for them.
import { useEffect, useState } from "react";
import { useData } from "../DataContext";

export interface ProductGoal {
  id: string;
  text: string;
  features: string[];
  covered: boolean;
}
export interface ProductReport {
  goals: ProductGoal[];
  decisions: { id: string; title: string; status: string; date: string }[];
  features_without_goal: string[];
  findings: { rule: string; ids: string[]; message: string }[];
}
export interface ProductEntry {
  repo: string;
  report: ProductReport;
}

export function useProduct(): ProductEntry[] {
  const { loader } = useData();
  const [entries, setEntries] = useState<ProductEntry[]>([]);
  useEffect(() => {
    if (!loader || loader.issue || loader.mode === "embedded" || loader.mode === "cloud") {      // the cloud has no product layer API yet: never show the sample one as theirs
      setEntries([]);
      return;
    }
    let live = true;
    const url = loader.mode === "server" ? "/api/product" : "/samples/product.json";
    fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : []))
      .then((j: unknown) => live && setEntries(Array.isArray(j) ? (j as ProductEntry[]).filter((e) => e?.report?.goals) : []))
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [loader]);
  return entries;
}
