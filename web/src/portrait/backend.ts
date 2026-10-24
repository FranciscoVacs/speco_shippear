// One interface for the portrait screen, two backends: the demo (the browser, seeded) and the service (spec 015).
// The mode is fixed at build time, so the hooks inside either backend are always called in the same order.
import { useEffect } from "react";
import { cloudEnabled } from "../cloud/config";
import { currentTenant, useSession } from "../shell/session";
import * as demo from "./demo";
import { cloudPortrait } from "./cloud";
import type { Action, Baseline, PortraitState } from "./model";

export type Failure = demo.Failure | "forbidden" | "network";

export interface PortraitView {
  state: PortraitState | null;
  loading: boolean;
  error: string | null;
  /** the person's role may record decisions (the service enforces it anyway) */
  canDecide: boolean;
  /** only owners and admins change the permission to analyze code */
  canConsent: boolean;
  /** only for display: the service says who decided, the demo has a name */
  retry: () => void;
}

export interface PortraitBackend {
  useView(): PortraitView;
  decide(id: string, action: Action, opts: { statement?: string; note?: string }, lang: "es" | "en"): Promise<Failure | null>;
  freeze(name: string): Promise<Baseline | null>;
  acknowledge(id: string, note: string): Promise<Failure | null>;
  setConsent(repo: { id?: string; name: string }, on: boolean): Promise<Failure | null>;
}

const demoBackend: PortraitBackend = {
  useView() {
    return { state: demo.usePortrait(), loading: false, error: null, canDecide: true, canConsent: true, retry: () => {} };
  },
  async decide(id, action, opts, lang) {
    return demo.decide(id, action, opts, lang);
  },
  freeze: (name) => demo.freeze(name),
  async acknowledge(id, note) {
    return demo.acknowledge(id, note);
  },
  async setConsent(repo, on) {
    demo.setConsent(repo.name, on);
    return null;
  },
};

const cloudBackend: PortraitBackend = {
  useView() {
    const tenant = currentTenant(useSession());
    const orgId = tenant?.id ?? null;
    const view = cloudPortrait.useStore();
    useEffect(() => {
      if (orgId) void cloudPortrait.load(orgId);
    }, [orgId]);
    return { ...view, retry: () => orgId && void cloudPortrait.load(orgId) };
  },
  decide: (id, action, opts) => cloudPortrait.decide(id, action, opts),
  freeze: (name) => cloudPortrait.freeze(name),
  acknowledge: (id, note) => cloudPortrait.acknowledge(id, note),
  setConsent: (repo, on) => cloudPortrait.setConsent(repo, on),
};

export const portraitBackend: PortraitBackend = cloudEnabled() ? cloudBackend : demoBackend;
export const usePortraitBackend = (): PortraitBackend => portraitBackend;
