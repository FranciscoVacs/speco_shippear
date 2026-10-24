# Pitch y objeciones

Material para hablar con quien decide qué se construye (producto, gerencia, founder) y con jurados o inversores. Se apoya en `../positioning/POSICIONAMIENTO.md`, se dice con `../voice/VOZ_Y_TONO.md`, y nada se afirma que no esté en `../positioning/AFIRMACIONES.md`. Lo marcado **[VERIFICAR]** se confirma contra el producto antes de decirlo; **[DECIDIR]** lo resuelve el dueño.

Regla de tiempos verbales: lo que existe va en presente; lo que viene va como «estamos construyendo» o «hacia dónde vamos». Nunca al revés.

## Pitch de 30 segundos

> Con agentes escribiendo el código, construir es barato. Lo caro es decidir qué construir y que eso siga siendo cierto. Un agente no aclara en el camino: adivina. Y el código termina haciendo cosas que nadie decidió. Speco es el Cursor para producto: la capa donde vive lo que tu empresa decidió, que frena a los agentes antes de construir sobre una spec rota y te avisa, en idioma de negocio, cuando un cambio pisa una decisión.

## Pitch de 2 minutos

| Beat | Tiempo | Qué decir |
|---|---|---|
| Dolor | 20 s | «Tenés 6 agentes abriendo PRs. Nadie lee todos los diffs. Un martes el límite de transferencias pasó de 5.000 a 10.000 USD y nadie lo decidió.» |
| Por qué ahora | 15 s | «El cuello de botella se movió del cómo al qué. Las herramientas siguen mirando el cómo.» |
| Qué es | 15 s | «Speco es la capa de intención: specs, decisiones y objetivos que los agentes leen y que se verifican.» |
| Demo | 50 s | Comentario de Speco en un PR (ver `DEMO_HACKATHON.md`; probado en el PR #1 de `speco-playground`); respaldo: `specreview demo` en terminal, 2 bloqueantes en segundos |
| Por qué confiar | 15 s | «Determinista y offline por defecto. El agente propone, una persona decide. Cada aprobación queda con hash.» |
| Hacia dónde vamos | 10 s | «Y lo que viene: no solo decidir qué se construye, sino poder probar que lo construido es lo que pediste.» Solo como visión (`docs/37`) |
| Cierre | 5 s | «Lo que Cursor hizo con el código, Speco lo hace con la intención.» |

## Pitch de 5 minutos (técnico, de `docs/31` §9)

| # | Beat | Tiempo | Contenido |
|---|---|---|---|
| 1 | Problema | 30 s | Implementar es barato; decidir y mantener coherencia es caro. Un agente adivina. Tres formas de slop (`docs/16` §2) |
| 2 | Idea | 30 s | Lo que Cursor hizo con el código, con la intención: un lugar donde se escribe, se revisa y se verifica. YC lo pidió como «Cursor para product managers» en su lista de primavera 2026 (sin cita textual; `AFIRMACIONES.md`) |
| 3 | Arquitectura | 2 min | Hoy: motor de reglas deterministas (`COV`/`QUA`/`CON`/`PRD`) + juez LLM opcional → superficies por rol: app, MCP en el editor, comentario en el PR. Visión: grafo tipado de intención (spec, decisión, regla, OKR) con aristas `implementa`, `contradice`, `depende_de`. Mostrar la tabla código ↔ producto de `docs/31` §3.2 |
| 4 | Demo | 1 min | PR que cambia una regla → comentario de Speco en idioma de negocio (probado en el PR #1 de `speco-playground`). Respaldo: `specreview demo` |
| 5 | Por qué ahora y por qué nosotros | 30 s | Ya existe: motor de reglas, aprobaciones auditables, MCP y gate, retrato desde código (sin probar en real). Falta: grafo persistente y autoría |
| 6 | Qué sigue | 30 s | 1 grafo con ids · 2 «si cambio esta regla, ¿qué se rompe?» · 3 diff de intención · 4 drift real contra el código · 5 **intención verificada**: de la regla aprobada a una propiedad que se comprueba sobre el código, y a una prueba formal en lo crítico (`docs/37`). Es visión: no existe |

## Preguntas duras

| Pregunta | Respuesta | Estado |
|---|---|---|
| «¿No es Notion o Jira con IA?» | No. Esos guardan documentos. Speco modela la intención para que se pueda verificar: reglas deterministas, decisiones con id que bloquean si se contradicen, y comparación con el código. Un doc de Notion no frena a un agente. | verificado (la comparación con código, con matiz) |
| «¿No es CodeRabbit?» | CodeRabbit le revisa el diff al desarrollador. Speco revisa la intención, antes del código, y le habla a quien decide. No dice si el código está bien escrito; dice si hace lo decidido. | verificado como diseño |
| «¿Esto no lo hace Spec Kit? Tiene `/speckit-analyze` y hooks» | Los hooks son un lugar donde enganchar una revisión, no una revisión: Speco es lo que se engancha. `/speckit-analyze` es un prompt que corre el agente del desarrollador y mira la spec de hoy. Speco es determinista, sirve de gate, compara **qué cambió entre versiones** contra las decisiones de producto, y lo dice en la PR a quien decide. Comparación completa: `docs/34`. | con matiz: la extensión de Spec Kit no existe todavía (T-026) |
| «¿Por qué no lo hace Cursor o Claude Code?» | Trabajan sobre el código. La intención de negocio no es su artefacto, y no tienen aprobaciones ni historial de decisiones. Speco entra a ellos por MCP: los complementa. | verificado |
| «¿Cómo evitan que la IA invente reglas?» | El agente propone, una persona confirma; nunca decide (`D-009`, `D-012`). Y el motor base es determinista: un hallazgo existe sin modelo. | verificado |
| «¿Qué tan confiable es el retrato desde código?» | Todavía no lo medimos con un modelo real. Por eso todo lo que propone es una propuesta hasta que una persona lo confirma. | verdad hoy; no inventar una cifra |
| «¿Cuántos clientes tienen?» | Ninguno pago todavía. Usamos Speco sobre su propio repo. Estamos buscando los primeros equipos con agentes en paralelo. | verdad hoy |
| «¿Esto lo usa alguien fuera de ustedes?» | No todavía. El repo es privado y estamos por abrir la primera instalación. | verdad hoy |
| «¿Pueden probar matemáticamente que el código hace lo que pedimos?» | Hoy no. Hoy revisamos que lo decidido sea coherente antes de construir. Hacia dónde vamos: traducir las reglas que una persona aprobó a propiedades que se comprueban sobre el código, y a una prueba formal donde importa (dinero, permisos). Una prueba solo es tan buena como la regla que prueba, y esa revisión es lo que hacemos. | verdad hoy; visión (`docs/37`) |
| «GitHub anunció verificación formal con agentes (PDD Kit). ¿Los pisa?» | Es nuestra tesis, validada por GitHub y Microsoft Research: se revisan especificaciones, no código. Ellos prueban que el código cumple una spec aprobada; nosotros decidimos si esa spec es la correcta. Se encadenan. | con matiz: anunciado (~21-oct-2026, research preview, solo Rust); sin repo ni docs. Decir «anunciaron» |
| «Anthropic y Theorem ya verifican formalmente con IA. ¿Para qué Speco?» | Ellos prueban que el código cumple una spec; su propio post dice que «a proof checker can't tell you whether your spec matches reality» y que conseguir una spec completa y sin ambigüedad es el obstáculo para escalar. Probaron que no crashea, una propiedad genérica. Las reglas de negocio las decide una persona: Speco hace que estén completas, sin contradicciones y aprobadas antes de probarlas. Se encadenan (`../positioning/EVIDENCIA_DEL_PROBLEMA.md`). | verificado (las citas); Speco no verifica código |
| «¿Y si el agente cambia el test para que pase?» | Es lo que le pasó a Anthropic en su verificación formal: el agente podía hacer pasar cualquier prueba reescribiendo lo que se comprobaba. En Speco cada verificación queda atada al código del test que corrió: si alguien lo edita, esa verificación deja de contar y Speco dice qué test cambió, para que lo mire una persona. | verificado (spec 032): ledger, `specreview diff` y comentario de GitHub si el repo lo activa |
| «¿Detectan cualquier cambio de comportamiento?» | No. Lo decidido no se pisa en silencio: contradicciones dentro de una feature y contra las decisiones registradas. Las reglas que viven sólo en el código las detectamos cuando alguien las confirma en el retrato. | verificado (garantía 1 parcial) |
| «¿Y si dos specs paralelas se contradicen?» | Hoy no lo detectamos si no citan una decisión común. La práctica es elevar el concepto compartido a decisión antes de paralelizar. La regla que lo detecta está en el backlog (`TODO.md` T-024). | verificado |
| «Spec Kit es nicho. ¿Qué pasa si mi equipo no lo usa?» | Hoy las revisiones de spec necesitan Spec Kit. La puerta del retrato parte del código, no de las specs. **[DECIDIR]** si se suma otro formato. | con matiz |
| «¿Dónde viven las decisiones: en Speco o en Linear/Notion?» | Hoy en el repo (`product/`), versionadas con git. Si Speco es origen o espejo es una decisión abierta (`docs/31` §8). **[DECIDIR]** | abierto |
| «¿Cuánto cuesta?» | **[DECIDIR]** No decir precio en público. `docs/30-billing.md` tiene supuestos (29 / 99 USD) y el cobro es simulado. | con matiz |
| «¿Mis datos y mi código?» | El retrato con modelo sólo lee código si un owner da consentimiento, y como máximo 30 archivos / 300 KB. Cada empresa aislada por RLS. Sin certificaciones. | con matiz: sin despliegue real |
| «¿Por qué ustedes?» | **[DECIDIR]** historia del founder. Lo demostrable: motor, MCP, aprobaciones y 25 specs propias revisadas con la herramienta. | con matiz |
| «¿Cómo crecen?» | Loop del PR: cada comentario lo ven varias personas del equipo (`docs/24` §4). Hipótesis, sin medir. | placeholder |

## Preguntas para hacerle al cliente

- ¿Cuántos agentes escriben código en tu equipo, y cuántos PRs por día se mergean?
- ¿Cuándo fue la última vez que una regla de negocio cambió sin que nadie lo decidiera? ¿Cómo se enteraron?
- ¿Dónde vive hoy lo que decidieron: tickets, docs, chat, cabezas?
- ¿Quién aprueba un cambio de negocio, y mira el código o mira otra cosa?
- ¿Usan Spec Kit o algún formato de spec?
