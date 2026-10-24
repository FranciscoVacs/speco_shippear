// Spec 020 and 021 from the browser: the credits of a company, the person's referrals and their notices (all read from the service).
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

export interface CreditsInfo {
  plan: string;
  free_plan: boolean;
  metered: boolean;
  billing?: boolean;
  balance: number;
  granted: number;
  level: "ok" | "near" | "full";
  next_renewal: string;
  grants: { source: "welcome" | "monthly" | "referral"; left: number; expires_at: string }[];
  recent: { kind: "portrait" | "turn"; credits: number; status: string; at: string }[];
}
export interface ReferralInfo {
  code: string;
  signed_up: number;
  activated: number;
  credits_earned: number;
  held: number;
  reward: number;
  monthly_cap: number;
  cap_left: number;
}
export interface Notice {
  id: string;
  org_id: string | null;
  kind: string;
  body: Record<string, unknown>;
  created_at: string;
}

export interface Loaded<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** GET `path` once (and again on reload). A null path loads nothing. */
export function useApi<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: path !== null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e) => live && setState({ data: null, error: e instanceof ApiError ? e : new ApiError(0, String(e)), loading: false }),
    );
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
