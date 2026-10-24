import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createLoader, isEmbedded, type Loader } from "./data";
import { cloudEnabled } from "./cloud/config";
import { useAuth } from "./cloud/auth";
import { useSession } from "./shell/session";
import type { Rule } from "./types";

interface DataCtx {
  loader: Loader | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  ruleById: Map<string, Rule>;
}
const Ctx = createContext<DataCtx | null>(null);

/** Creates the loader once (embedded report, local server or samples) and shares it with every page. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [loader, setLoader] = useState<Loader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // cloud: the features are the signed-in company's own, so there is no loader until a person and a company are known (and a new one when they change)
  const cloud = cloudEnabled() && !isEmbedded();
  const auth = useAuth();
  const session = useSession();
  const org = cloud && auth.status === "in" && session.signedIn ? session.tenantId : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (cloud && !org) {
      setLoader(null);
      return () => {
        cancelled = true;
      };
    }
    if (cloud) setLoader(null);
    createLoader(org ?? undefined)
      .then((l) => !cancelled && setLoader(l))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tick, cloud, org]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  const ruleById = useMemo(() => new Map<string, Rule>((loader?.rules?.rules ?? []).map((r) => [r.id, r])), [loader]);
  const value = useMemo(() => ({ loader, loading, error, retry, ruleById }), [loader, loading, error, retry, ruleById]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("DataProvider missing");
  return c;
}
