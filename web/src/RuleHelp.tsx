import { useEffect, useState, type ReactNode } from "react";
import type { Rule } from "./types";

/** Rules live on /rules/:id; the guide sections on /docs#guia-<section>. */
export const guideHref = (token?: string) => (!token ? "/docs" : /^[A-Za-z]{3}\d{3}$/.test(token) ? `/rules/${token.toUpperCase()}` : `/docs#guia-${token}`);

/** Body of a catalog entry: used inline in a finding and inside the glossary. */
export function RuleBody({ rule }: { rule: Rule }) {
  return (
    <div className="rule-body">
      {rule.severity && (
        <p>
          <span className="rb-label">Severidad</span> {rule.severity}
        </p>
      )}
      {rule.what && (
        <p>
          <span className="rb-label">Qué detecta</span> {rule.what}
        </p>
      )}
      {rule.why && (
        <p>
          <span className="rb-label">Por qué importa</span> {rule.why}
        </p>
      )}
      {rule.fix && (
        <p>
          <span className="rb-label">Cómo arreglarlo</span> {rule.fix}
        </p>
      )}
      {(rule.bad || rule.good) && (
        <div className="rb-examples">
          {rule.bad && (
            <div className="rb-ex rb-bad">
              <span className="rb-label">Ejemplo que la dispara</span>
              <pre>{rule.bad}</pre>
            </div>
          )}
          {rule.good && (
            <div className="rb-ex rb-good">
              <span className="rb-label">Ejemplo correcto</span>
              <pre>{rule.good}</pre>
            </div>
          )}
        </div>
      )}
      {rule.caveat && (
        <p className="rb-caveat">
          <span className="rb-label">Ojo</span> {rule.caveat}
        </p>
      )}
    </div>
  );
}

/** Hover/focus tooltip that stays out of the accessible name: the text is linked with aria-describedby.
 *  Esc dismisses it (hover or focus), and it stays open while the pointer is over it (WCAG 1.4.13). */
export function Tip({ id, text, children, className = "" }: { id: string; text: string; children: ReactNode; className?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
  const off = () => {
    setActive(false);
    setDismissed(false);
  };
  return (
    <div
      className={"tipwrap " + className}
      data-dismissed={dismissed || undefined}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={(e) => {
        if (!e.currentTarget.contains(document.activeElement)) off();
      }}
      onFocus={() => setActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) off();
      }}
    >
      {children}
      <span role="tooltip" id={id} className="tip">
        {text}
      </span>
    </div>
  );
}
