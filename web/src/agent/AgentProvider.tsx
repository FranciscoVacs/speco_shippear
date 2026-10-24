// Mounted once, above the router: keeps the conversation alive across routes and panel collapses (FR-005, FR-007),
// feeds the store with the language and the data loader, detects the engine, listens to "Preguntar al asistente" and
// mounts the heavy runtime host only after the first interaction (or when the browser is idle).
import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { useData } from "../DataContext";
import { useLang } from "../i18n";
import { ASK_EVENT, type AskDetail } from "../pages/askEvent";
import { agent, detectEngine, env, loadRuntime, prefetchWhenIdle, setLoader, useAgent } from "./store";

const Host = lazy(() => loadRuntime().then((m) => ({ default: m.AgentRuntimeHost })));

export function AgentProvider({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  const { loader } = useData();
  const wanted = useAgent((s) => s.runtimeWanted);

  env.lang = lang;
  useEffect(() => {
    setLoader(loader);
  }, [loader]);

  useEffect(() => {
    void detectEngine();
    return prefetchWhenIdle();
  }, []);

  // "Preguntar al asistente" fires before the panel exists when it was collapsed: listen here, not in the panel
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<AskDetail>).detail;
      if (d && typeof d.text === "string") agent.ask(d);
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);

  return (
    <>
      {children}
      {wanted && (
        <Suspense fallback={null}>
          <Host />
        </Suspense>
      )}
    </>
  );
}
