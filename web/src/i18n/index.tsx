import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import es from "./es";
import en from "./en";
import { storage } from "../shell/storage";

export type Lang = "es" | "en";
export type Key = keyof typeof es;
type Vars = Record<string, string | number>;
export type TFn = (key: Key, vars?: Vars) => string;

const DICTS: Record<Lang, Record<Key, string>> = { es, en };
export const LANG_KEY = "sr-lang";

/** First visit: English if the browser says so, Spanish otherwise. The choice is persisted. */
export function detectLang(): Lang {
  const saved = storage.get(LANG_KEY);
  if (saved === "es" || saved === "en") return saved;
  const nav = typeof navigator !== "undefined" ? (navigator.language || "") : "";
  return nav.toLowerCase().startsWith("en") ? "en" : "es";
}

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const raw = DICTS[lang][key] ?? es[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.set(LANG_KEY, l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}
export const useT = (): TFn => useCtx().t;
export const useLang = () => {
  const { lang, setLang } = useCtx();
  return { lang, setLang };
};
