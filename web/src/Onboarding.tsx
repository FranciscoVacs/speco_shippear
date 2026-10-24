import { useEffect, useRef, useState } from "react";
import { guideHref } from "./RuleHelp";

export const ONBOARD_KEY = "sr-onboarded";

export function wasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return false; // storage unavailable: just show it every time
  }
}

function saveOnboarded(done: boolean) {
  try {
    if (done) localStorage.setItem(ONBOARD_KEY, "1");
    else localStorage.removeItem(ONBOARD_KEY);
  } catch {
    /* ignore */
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface Props {
  onClose: () => void;
  /** where focus goes when the dialog closes if the opener is gone */
  fallbackFocus?: () => HTMLElement | null;
  onOpenGuide: () => void;
}

const STEPS = ["El cuello de botella", "El slop", "Tres garantías", "Tu primer minuto"] as const;

export function Onboarding({ onClose, fallbackFocus, onOpenGuide }: Props) {
  const [step, setStep] = useState(0);
  const [never, setNever] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const neverRef = useRef(never);
  neverRef.current = never;

  // Checked by default: closing the dialog (any way) records that it was seen; unchecking makes it appear again next time.
  const close = () => {
    saveOnboarded(neverRef.current);
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      const target = openerRef.current && document.contains(openerRef.current) ? openerRef.current : fallbackFocus?.();
      target?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === headingRef.current || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const last = step === STEPS.length - 1;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        aria-describedby="onb-step-label"
        onKeyDown={onKeyDown}
      >
        <div className="modal-top">
          <p id="onb-step-label" className="onb-step-label">
            Paso {step + 1} de {STEPS.length}
          </p>
          <button className="link onb-skip" onClick={close}>
            Saltar introducción
          </button>
        </div>
        <ol className="onb-dots" aria-label="Pasos de la introducción">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{`${i + 1}. ${s}${i === step ? " (actual)" : ""}`}</span>
            </li>
          ))}
        </ol>
        <div className="modal-body">
          <h2 id="onb-title" tabIndex={-1} ref={headingRef}>
            {step === 0 && "Construir ya no es lo difícil"}
            {step === 1 && "El riesgo ahora es el slop"}
            {step === 2 && "Lo que Speco te garantiza"}
            {step === 3 && "Tu primer minuto"}
          </h2>
          {step === 0 && <StepWhat />}
          {step === 1 && <StepHow />}
          {step === 2 && <StepRead />}
          {step === 3 && <StepFirst onOpenGuide={() => { close(); onOpenGuide(); }} />}
        </div>
        <div className="modal-foot">
          <label className="never">
            <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> No volver a mostrar
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              Atrás
            </button>
            {last ? (
              <button className="btn primary" onClick={close}>
                Empezar
              </button>
            ) : (
              <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
                Siguiente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepWhat() {
  return (
    <>
      <p className="lead">
        <strong>Con agentes escribiendo el código, implementar dejó de ser lo caro. Lo caro es decidir qué construir y mantenerlo coherente.</strong>
      </p>
      <p>
        El cuello de botella se movió del <em>cómo</em> al <em>qué</em>. Cuando construir es rápido, el riesgo es construir rápido algo que nadie decidió.
      </p>
      <p className="muted">
        Speco es la capa donde esa decisión vive, se revisa y se verifica: el Cursor para el negocio. Hecha para gerencia y producto, no para quien programa.
      </p>
    </>
  );
}

function StepHow() {
  const items: [string, string][] = [
    ["Una regla cambia sola", "una regla de negocio implícita en el código cambia de un día para otro y nadie lo decidió."],
    ["Se aprueba código, no intención", "el cambio se revisa línea por línea y nadie ve qué cambió en el negocio."],
    ["La intención no tiene casa", "vive en chats, tickets y cabezas, así que no hay dónde verificarla."],
  ];
  return (
    <>
      <p>
        <strong>Slop</strong> es lo que entra al producto sin que nadie lo haya decidido. Aparece de tres formas:
      </p>
      <ol className="flow" aria-label="Las tres formas del slop">
        {items.map(([t, d], i) => (
          <li key={t}>
            <span className="flow-n" aria-hidden="true">
              {i + 1}
            </span>
            <strong>{t}</strong>
            <span>{d}</span>
          </li>
        ))}
      </ol>
      <p className="muted">Si el código es una herramienta más, el valor está en la capa por encima: la spec.</p>
    </>
  );
}

function StepRead() {
  return (
    <>
      <ul className="onb-problems">
        <li>
          <strong>Lo decidido no se pisa en silencio.</strong> Detecta contradicciones entre requisitos y contra lo que ya decidieron.
        </li>
        <li>
          <strong>Los cambios se revisan como intención.</strong> Ves qué espera tu decisión («Tu turno»), no qué líneas cambiaron.
        </li>
        <li>
          <strong>La spec es el lugar de la intención.</strong> Se verifica antes de construir y cada aprobación queda registrada.
        </li>
      </ul>
      <p className="callout">
        <strong>Hoy:</strong> revisamos la spec antes de que se escriba código. Todavía no detectamos reglas que viven <em>solo</em> en el código.
      </p>
    </>
  );
}

function StepFirst({ onOpenGuide }: { onOpenGuide: () => void }) {
  return (
    <>
      <ol className="onb-first">
        <li>
          <strong>Mirá «Decisiones».</strong> «Tu turno» muestra solo lo que espera tu decisión.
        </li>
        <li>
          <strong>Abrí una feature.</strong> El resumen dice si está lista para construir y qué se arriesga si no.
        </li>
        <li>
          <strong>Preguntale al agente</strong> en lenguaje de negocio, por ejemplo «¿qué espera mi decisión?».
        </li>
        <li>
          <strong>Aprobá o devolvé.</strong> Queda registrado quién decidió qué y cuándo.
        </li>
      </ol>
      <p>
        Siempre podés volver acá con el botón <strong>Ayuda</strong> de la barra superior. El detalle técnico (reglas, EARS) está un clic más abajo.{" "}
        <a
          href={guideHref()}
          onClick={(e) => {
            e.preventDefault();
            onOpenGuide();
          }}
        >
          Abrir la guía completa
        </a>
      </p>
    </>
  );
}
