import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CodeBlock } from "./CodeBlock";
import { guideHref } from "./RuleHelp";
import { useT } from "./i18n";
import { SEV_ICON } from "./util";

const SECTIONS = [
  { id: "que-es", title: "Qué es" },
  { id: "cuando", title: "Cuándo usarla" },
  { id: "como-funciona", title: "Cómo funciona" },
  { id: "primeros-pasos", title: "Tus primeros 5 minutos" },
  { id: "leer-reporte", title: "Cómo leer el reporte" },
  { id: "ears", title: "EARS en dos minutos" },
  { id: "confiable", title: "Qué tan confiable es" },
  { id: "asistente", title: "El asistente" },
  { id: "faq", title: "Preguntas frecuentes" },
  { id: "reglas", title: "Glosario de reglas" },
] as const;

const QUICKSTART = `uvx --from git+https://github.com/agustindelmonti/speco.ia specreview demo   # un ejemplo con defectos plantados, sin repo propio
pip install git+https://github.com/agustindelmonti/speco.ia            # o uv tool install: el comando specreview
specreview <tu-repo>                       # tu repo: busca specs/*/spec.md
specreview <tu-repo> --serve               # abre la interfaz web en http://127.0.0.1:8765
specreview --explain COV001                # qué significa cualquier regla`;

interface Props {
  /** token after "guia-" in the URL hash: a section id; null = top. */
  anchor: string | null;
  /** changes on every navigation, so the same anchor can be requested twice */
  anchorTick: string | number;
}

export function Guide({ anchor, anchorTick }: Props) {
  const t = useT();

  // Deep link (#guia-<section>): scroll to the section and move focus to it (keyboard users land there).
  useEffect(() => {
    if (!anchor) {
      window.scrollTo({ top: 0 });
      return;
    }
    const tm = window.setTimeout(() => {
      const el = document.getElementById("guia-" + anchor);
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      if (!document.querySelector("[aria-modal=true]")) el.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(tm);
  }, [anchor, anchorTick]);

  const [tocOpen, setTocOpen] = useState(false);
  const toc = (
    <ol className="toc-list">
      {SECTIONS.map((s) => (
        <li key={s.id}>
          <Link to={guideHref(s.id)} onClick={() => setTocOpen(false)}>
            {s.title}
          </Link>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="guide" id="guia">
      <nav className="toc" aria-label="En esta página">
        <div className="toc-desktop">
          <p className="toc-title">En esta página</p>
          {toc}
        </div>
        <details className="toc-mobile" open={tocOpen} onToggle={(e) => setTocOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>En esta página</summary>
          {toc}
        </details>
      </nav>
      <article className="guide-body">
        <header className="guide-head">
          <h1>Guía del producto</h1>
          <p className="lead">
            <strong>Con agentes escribiendo el código, lo caro es decidir qué construir y mantenerlo coherente. Speco es la capa donde esa decisión vive, se revisa y se verifica.</strong>
          </p>
          <p className="guide-dev-link">
            <Link to="/docs/developers">{t("dev.banner")} →</Link>
          </p>
          <p className="guide-dev-link">
            <Link to="/docs/product">{t("pm.banner")} →</Link>
          </p>
        </header>

        <Section id="que-es" title="Qué es">
          <p>
            El cuello de botella del software se movió: ya no es el <em>cómo</em> (implementar) sino el <em>qué</em>. Con agentes escribiendo el código, construir es barato; lo
            caro y lo riesgoso es decidir qué construir y que lo decidido siga siendo cierto con el tiempo. Speco es esa capa por encima del código, pensada para gerencia y
            producto: <strong>el Cursor para el negocio</strong>.
          </p>
          <p>
            El problema se llama <strong>slop</strong>: lo que entra al producto sin que nadie lo haya decidido. Aparece de tres formas, y Speco apunta a cada una:
          </p>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th scope="col">Slop</th>
                  <th scope="col">Qué pasa</th>
                  <th scope="col">Qué garantiza Speco</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Una regla cambia sola</th>
                  <td>Una regla de negocio implícita en el código cambia de un día para otro sin que nadie lo haya decidido</td>
                  <td>Lo decidido no se pisa en silencio: contradicciones entre requisitos y contra tus decisiones previas</td>
                </tr>
                <tr>
                  <th scope="row">Se aprueba código, no intención</th>
                  <td>El cambio se revisa línea por línea y nadie ve qué cambió en el negocio</td>
                  <td>Los cambios se revisan como intención: veredicto por feature y «Tu turno»</td>
                </tr>
                <tr>
                  <th scope="row">La intención no tiene casa</th>
                  <td>Vive en chats, tickets y cabezas, así que no hay dónde verificarla</td>
                  <td>La spec es el lugar de la intención: se verifica antes de construir y cada aprobación queda registrada</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Alcance de hoy:</strong> Speco revisa la spec (<code>spec.md</code>, <code>plan.md</code>, <code>tasks.md</code> de GitHub Spec Kit) antes de que se escriba una
            línea de código. Todavía no detecta reglas que viven <em>solo</em> en el código. Debajo del capó, la revisión funciona como un code review pero para la spec, que a
            diferencia del código <strong>no tiene compilador</strong>: si un requisito está mal escrito, nada avisa.
          </p>
        </Section>

        <Section id="cuando" title="Cuándo usarla">
          <p>
            Después de <code>/speckit.tasks</code> y <strong>antes de <code>/speckit.implement</code></strong>. Corregir una línea de la spec cuesta minutos; corregir lo que el
            agente construyó a partir de esa línea cuesta mucho más.
          </p>
        </Section>

        <Section id="como-funciona" title="Cómo funciona">
          <ol className="steps">
            <li>
              <strong>Lee</strong> <code>spec.md</code>, <code>plan.md</code>, <code>tasks.md</code> (y <code>data-model.md</code>) de la carpeta de la feature y los convierte en
              datos: requisitos (<code>FR-###</code>), criterios de éxito (<code>SC-###</code>), user stories con sus escenarios, pasos del plan y tasks.
            </li>
            <li>
              <strong>Cruza</strong> requisitos contra plan y tasks en las dos direcciones: ¿qué requisito no tiene quién lo implemente? ¿qué task no responde a ningún requisito?
            </li>
            <li>
              <strong>Evalúa la calidad</strong> de cada requisito: ¿es ambiguo? ¿se puede testear? ¿tiene criterio de aceptación? ¿contradice a otro? Usa <strong>EARS</strong> como
              vara (ver más abajo).
            </li>
            <li>
              <strong>Reporta</strong> un hallazgo por línea, con <strong>severidad</strong>, <strong>dónde está</strong> (archivo y línea) y <strong>una explicación corta</strong>.
            </li>
          </ol>
          <p>
            Todo esto se hace con reglas y comparación de texto: <strong>es determinista, corre sin internet y no envía tu spec a ningún lado</strong>. Opcionalmente un modelo de
            lenguaje (<code>--llm</code>) confirma los casos dudosos y habilita el asistente conversacional.
          </p>
        </Section>

        <Section id="primeros-pasos" title="Tus primeros 5 minutos">
          <CodeBlock code={QUICKSTART} lang="bash" caption="terminal" />
          <p className="callout" role="note">
            <strong>¿Programás o dirigís un agente que programa?</strong> <Link to="/docs/developers">{t("dev.title")}</Link>: la CLI, el MCP en tu agente (Claude Code, Cursor, VS Code…),
            CI y casos de uso con ejemplos.
          </p>
          <p>
            <code>&lt;tu-repo&gt;</code> puede ser la raíz del repositorio o la carpeta de una feature (<code>specs/003-mi-feature</code>). Para revisar todas las features de una
            vez: <code>specreview &lt;tu-repo&gt; --all</code>.
          </p>
        </Section>

        <Section id="leer-reporte" title="Cómo leer el reporte">
          <p>
            Cada línea tiene la forma: <strong>severidad · dónde · ubicación · regla · qué pasa</strong>.
          </p>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th scope="col">Severidad</th>
                  <th scope="col">Significa</th>
                  <th scope="col">Qué hacer</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <span className="badge b-blocker">
                      <span aria-hidden="true">{SEV_ICON.blocker}</span> Bloqueante
                    </span>
                  </th>
                  <td>No conviene implementar así: hay una contradicción, una pregunta sin responder o un requisito que seguro nadie implementa</td>
                  <td>
                    Resolver antes de <code>/speckit.implement</code>
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <span className="badge b-warning">
                      <span aria-hidden="true">{SEV_ICON.warning}</span> Advertencia
                    </span>
                  </th>
                  <td>Probable defecto: ambiguo, sin criterio de aceptación, posible scope colado</td>
                  <td>Revisar; la mayoría merece arreglo</td>
                </tr>
                <tr>
                  <th scope="row">
                    <span className="badge b-suggestion">
                      <span aria-hidden="true">{SEV_ICON.suggestion}</span> Sugerencia
                    </span>
                  </th>
                  <td>Mejora de estilo o duda que no se pudo confirmar</td>
                  <td>Mirar si hay tiempo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Flujo recomendado:</strong> arreglá los bloqueantes, después las advertencias, y volvé a correr. En la interfaz, tocá un hallazgo para ver la línea exacta en el
            archivo y «¿Qué significa esta regla?» para la explicación de la regla.
          </p>
          <p>
            <strong>El código de salida</strong> sirve para automatizar: <code>0</code> sin hallazgos graves, <code>1</code> hay hallazgos desde el umbral (<code>--fail-on</code>, por
            defecto bloqueante), <code>2</code> error de uso.
          </p>
        </Section>

        <Section id="ears" title="EARS en dos minutos">
          <p>
            EARS (Easy Approach to Requirements Syntax) es una forma de escribir requisitos que obliga a nombrar <strong>cuándo</strong> y <strong>qué responde el sistema</strong>, que
            es justo lo necesario para poder testearlos. Hay cinco patrones:
          </p>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th scope="col">Patrón</th>
                  <th scope="col">Forma</th>
                  <th scope="col">Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Ubicuo</th>
                  <td>The system SHALL …</td>
                  <td>System MUST log every login</td>
                </tr>
                <tr>
                  <th scope="row">Evento</th>
                  <td>
                    When <em>disparador</em>, the system SHALL …
                  </td>
                  <td>When an invitation is created, the system MUST email the address within 60 seconds</td>
                </tr>
                <tr>
                  <th scope="row">Estado</th>
                  <td>
                    While <em>estado</em>, the system SHALL …
                  </td>
                  <td>While the account is locked, the system MUST reject logins</td>
                </tr>
                <tr>
                  <th scope="row">No deseado</th>
                  <td>
                    If <em>condición</em>, then the system SHALL …
                  </td>
                  <td>If the card is declined, then the system MUST show an error</td>
                </tr>
                <tr>
                  <th scope="row">Opcional</th>
                  <td>
                    Where <em>función incluida</em>, the system SHALL …
                  </td>
                  <td>Where two-factor is enabled, the system MUST ask for a code</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Spec Kit escribe «System MUST …», que cuenta como patrón ubicuo: <strong>no se marca como error</strong>. Solo se sugiere reescribir lo escrito desde el actor («Users MUST
            be able to …») o sin sujeto del sistema.
          </p>
        </Section>

        <Section id="confiable" title="Qué tan confiable es">
          <p className="callout" role="note">
            <strong>Leer esto antes de actuar sobre un hallazgo.</strong> No todos los hallazgos tienen el mismo grado de certeza.
          </p>
          <ul className="bullets">
            <li>
              <strong>Lo determinista es confiable:</strong> contradicciones numéricas, ambigüedad por palabras vagas, preguntas <code>[NEEDS CLARIFICATION]</code> abiertas, escenarios
              incompletos, formas no EARS.
            </li>
            <li>
              <strong>Lo inferido por texto es una pista, no un veredicto:</strong> Spec Kit <strong>no vincula</strong> requisitos con tasks, así que «este requisito no tiene plan» se
              deduce comparando palabras. Si el requisito sí está implementado pero con otro vocabulario, aparece como falso positivo. Por eso un hueco inferido solo por texto es{" "}
              <strong>advertencia</strong> y solo es <strong>bloqueante</strong> si tu repo cita los requisitos (<code>FR-###</code>) o un modelo lo confirma.
            </li>
            <li>
              <strong>Cómo reducir el ruido:</strong> citá el id del requisito en la task que lo implementa («… (FR-005)»). Es la mejora que más ayuda, y además deja trazabilidad. O
              corré con <code>--llm anthropic</code> para que un modelo arbitre los casos dudosos.
            </li>
            <li>
              Medido sobre un repo real ya implementado: 0 bloqueantes (lo esperable), pero siguen apareciendo advertencias y sugerencias que en buena parte son ruido cuando no se usa
              el modelo. Detalle en <code>docs/04-real-repo-calibration.md</code>.
            </li>
          </ul>
        </Section>

        <Section id="asistente" title="El asistente">
          <p>
            Es un chat para trabajar los hallazgos con alguien que conoce tu spec: «reescribí FR-006 en EARS», «¿qué criterios de aceptación faltan para la story 3?», «¿este hallazgo
            es un falso positivo?».
          </p>
          <ul className="bullets">
            <li>
              <strong>Propone, no edita:</strong> te muestra el texto sugerido para que lo copies; nunca modifica tus archivos.
            </li>
            <li>
              Ve el reporte y tus archivos de la feature. Con un modelo real (<code>--serve --llm anthropic</code>) ese contenido se envía al proveedor.
            </li>
            <li>
              Sin modelo configurado el panel del asistente lo explica; <code>--llm demo</code> muestra la interfaz con respuestas de ejemplo (no son de un modelo).
            </li>
          </ul>
        </Section>

        <Section id="faq" title="Preguntas frecuentes">
          <div className="faq">
            <Faq q="¿Reemplaza a /speckit.analyze?">
              No: ese comando es un prompt para el agente (no determinista, sin CLI). Spec Reviewer es código: reproducible, corre en tu terminal o en CI y da un reporte
              estructurado. Se complementan.
            </Faq>
            <Faq q="¿Modifica mis archivos?">Nunca. Solo lee.</Faq>
            <Faq q="¿Se manda mi spec a internet?">
              No, salvo que actives <code>--llm</code> o el asistente con un proveedor real.
            </Faq>
            <Faq q="Me aparece un hueco que no es real.">
              Citá el <code>FR-###</code> en la task. Si es una restricción («MUST NOT alterar…») que no genera trabajo propio, ignoralo: es un caso conocido (regla <code>COV006</code>).
            </Faq>
            <Faq q="¿Qué versiones de Spec Kit soporta?">
              El formato de <code>spec.md</code>/<code>plan.md</code>/<code>tasks.md</code> de los templates actuales (<code>FR-###</code>, <code>SC-###</code>,{" "}
              <code>User Story N - … (Priority: Pn)</code>, <code>- [ ] T### [P] [USn] …</code>). Ver <code>docs/01</code>.
            </Faq>
          </div>
        </Section>

        <Section id="reglas" title="Glosario de reglas">
          <p>
            Cada hallazgo lleva un código de regla (<code>COV001</code>, <code>QUA003</code>…). El glosario tiene su propia página: qué detecta cada regla, por qué importa y cómo se
            arregla.
          </p>
          <p>
            <Link className="btn" to="/rules">
              {t("docs.openRules")}
            </Link>
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="guide-section" id={"guia-" + id} tabIndex={-1} aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`}>{title}</h2>
      {children}
    </section>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="faq-item">
      <summary>{q}</summary>
      <p>{children}</p>
    </details>
  );
}
