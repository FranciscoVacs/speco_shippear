# Speco: posicionamiento

Qué es Speco, para quién y por qué es distinta. La fuente del mensaje es `docs/16-thesis.md`; lo que existe hoy para producto, `docs/30-product-manager-guide.md`. Este archivo no los copia: los traduce a lenguaje de mercado. Si algo acá los contradice, ganan ellos. Qué se puede afirmar: `AFIRMACIONES.md`. Qué agrega Speco y a quién se le vende (propuesta en revisión): `PROPUESTA_DE_VALOR.md`. Cómo se dice: `../voice/VOZ_Y_TONO.md`.

## 1. Qué es, en una frase

**Speco es el Cursor para producto: la capa donde vive lo que tu empresa decidió construir, y que avisa cuando un agente lo cambia sin que nadie lo haya decidido.**

Versión larga (`docs/16` §1): con agentes escribiendo el código, lo caro dejó de ser construir y pasó a ser decidir qué construir y mantenerlo coherente. Speco es la capa donde esa decisión vive, se revisa y se verifica.

## 2. El problema

1. **El cuello de botella se movió.** Implementar ya es barato y rápido.
2. **El riesgo está en el *qué*.** Un agente no aclara en el camino: adivina.
3. **Eso produce slop:** cambios que nadie decidió pero que el código ya tiene. Una regla de negocio cambia de un día para otro; un cambio se aprueba mirando código y no intención; la intención está en chats, tickets y cabezas.
4. **Con 5–10 agentes en paralelo** hay decenas de PRs por día y nadie lee todos los diffs. Quien decide qué se construye se entera en QA, o en producción.

## 3. Para quién: dos puertas, un producto (`D-010`)

| | Puerta 1: «ya tengo software» | Puerta 2: «tengo una idea, no tengo código» |
|---|---|---|
| Quién | Producto, gerencia o CTO de una empresa con código y agentes escribiéndolo | Founder no técnico que vibecodea con una herramienta de IA |
| Dolor | «Lo que decidimos se pisa en silencio» | «Mi agente adivina lo que nadie decidió» |
| Promesa | Que lo decidido no se pise en silencio | Que tu agente no adivine |
| Primer resultado | Retrato inicial: las reglas que tu software cumple hoy, para confirmar | Su spec + un *brief* para pegar en su herramienta |
| Estado | 🟡 retrato y conexión a GitHub sin probar contra GitHub real | 🟡 spec 016 en *Draft* |

Fuera de foco: el desarrollador como comprador. A esa persona la sirve su editor; Speco entra a su editor por MCP y le da algo que construir con certeza.

## 4. «El Cursor para producto»

Y Combinator pidió, en su lista de *requests for startups*, un «Cursor para product managers»: no otra herramienta para quien programa, sino el lugar donde quien decide qué se construye trabaja con una IA que entiende el contexto. Figuraba en la lista de **primavera 2026** (febrero), según fuentes secundarias; la lista actual de YC (otoño 2026) ya no lo tiene. Decirlo así, sin cita textual (`AFIRMACIONES.md`).

Por qué la analogía calza (detalle en `docs/31` §2-3, PR #43):

| Cursor, para código | Speco, para intención | Hoy |
|---|---|---|
| El archivo es el centro | La spec y la decisión son el centro | 🟡 hoy el centro es el chat y la revisión |
| Diff aceptar / rechazar | Diff de intención: «el umbral pasa de 10,000 a 15,000 USD» | 🟡 se ve en la PR (spec 026, `speco-pr-review`); aceptar o rechazar todavía no |
| Linter / compilador | Reglas de coherencia `COV`, `QUA`, `CON`, `PRD` | ✅ |
| `.cursorrules` | `product/decisions.md`, constitución | ✅ |
| Find usages (LSP) | «Si cambio esta regla, ¿qué se rompe?» sobre un grafo de intención | ⬜ |
| Git blame | Quién decidió qué, cuándo, sobre qué versión | ✅ aprobaciones con hash encadenado |

Cómo se dice: **hoy** Speco revisa la intención y frena a los agentes antes de construir sobre una spec rota. **La visión** es el editor de intención con grafo e impacto. No mezclar los dos tiempos verbales.

## 5. Por qué es distinta

| Contra | Qué hacen | Qué hace Speco que ellos no |
|---|---|---|
| **Notion / Jira / Linear con IA** | Guardan documentos y tickets; la IA resume y redacta | Modela la intención como algo verificable: reglas de coherencia deterministas, decisiones con id que una spec cita, contradicciones que bloquean, y comparación con el código. Un doc de Notion no frena a un agente |
| **CodeRabbit y revisores de código** | Revisan el diff línea por línea, para el desarrollador | Revisa la *intención* antes de que exista código, y en el PR habla en idioma de negocio a quien decide. No juzga si el código está bien escrito: juzga si hace lo decidido |
| **GitHub Spec Kit** (`/speckit-analyze`, hooks de `extensions.yml`) | Define el formato de las specs. `/speckit-analyze` es un prompt que el agente corre para ver si spec, plan y tasks son coherentes. Los hooks enganchan comandos antes o después de implementar | Speco corre sobre Spec Kit, no en su lugar. Es determinista y sirve de gate, compara **versiones** (qué cambió en el negocio), recuerda decisiones y aprobaciones, y le habla a producto en la PR. Los hooks son un canal para Speco, no un reemplazo (`docs/34`) |
| **Cursor / Claude Code / agentes** | Escriben el código a partir de lo que les digan | Es lo que les dicen. Les da la spec revisada y les cierra el paso con bloqueantes (MCP, gate). No tienen aprobaciones, historial de decisiones ni la intención de negocio como artefacto |

| **Verificación formal del código** (Verus y herramientas que se apoyan en ella; en octubre 2026 GitHub y Microsoft Research anunciaron PDD Kit, en research preview) | Parten de una spec aprobada y prueban que el código la cumple para toda entrada | No compite: es la capa previa. Revisa que la spec sea completa, coherente y esté alineada al negocio, y que la apruebe una persona, antes de que alguien la formalice. Una prueba válida sobre una spec equivocada es la peor combinación (`docs/37` §3). Anthropic y Theorem lo dicen con sus palabras al verificar 123 librerías: el obstáculo es la spec (`EVIDENCIA_DEL_PROBLEMA.md`) |

Diferenciales que se pueden decir hoy (ver `AFIRMACIONES.md`):
1. **Determinista y offline por defecto.** Un hallazgo existe sin modelo (`D-001`, `D-003`). El modelo es opcional.
2. **El agente propone, la persona decide.** Lo impone la base de datos, no una convención (`D-012`).
3. **Aprobaciones auditables** con hashes encadenados: si la spec cambia después, la aprobación figura como vieja.
4. **Entra al flujo que ya existe:** CLI, MCP en el editor, check en el PR. No hay que migrar nada.

### Hacia dónde vamos: de «qué construir» a «probar que se construyó» (visión, no producto)

Hoy Speco asegura que lo decidido sea coherente **antes** de construir. Hacia dónde vamos: que además haya evidencia verificable, y en las reglas críticas una prueba, de que el código
cumple lo decidido. Para quien aprueba: «no solo qué se construye, sino la constancia de que lo construido es lo que pidió».

- La cadena es `intención aprobada → regla formal → código`. Un verificador cierra el segundo tramo; el primero lo cierra una persona que revisa la regla en idioma de negocio. Eso es Speco.
- Se vende después de lo que ya existe, nunca en su lugar. **Hoy no existe:** ni propiedades ni pruebas sobre el código (`AFIRMACIONES.md`).
- Detalle, límites (sirve para invariantes, no para todo) y plan por pasos: `docs/37`.

## 6. Tiempo a valor

Qué tarda una persona desde que oye de Speco hasta su primer resultado. `G-7` pide 5 minutos.

### Por el CLI (honesto, al 2026-10-21)

| Paso | Minutos | Bloqueo real |
|---|---|---|
| Conseguir acceso al repo | — | **El repo es privado.** Un tercero no puede instalar nada sin que el dueño lo invite |
| Instalar `uv` | 2 | — |
| `uvx --from git+https://github.com/agustindelmonti/speco.ia specreview demo` | 1–2 | Compila desde git en cada uso (no está en PyPI). En Windows falla por `cp1252` hasta mergear PR #44 |
| Ver 2 bloqueantes (`CON001` 5.000 vs 10.000 USD; `COV001` requisito sin implementar) | <1 | — |
| **Total, desarrollador invitado** | **~5** | Y sólo ve un ejemplo, no su repo |
| Llevarlo a su repo con Spec Kit (`specreview init` + `baseline`) | 30 | Su repo tiene que usar Spec Kit |
| Que quien decide (producto) vea algo en su PR | ~2 | Ahora sí: la GitHub App (ver abajo). La Action sigue sin poder usarse desde afuera (sin tag `@v1`, repo privado) |

### Con la GitHub App (funcionando desde el 2026-10-21)

| Paso | Minutos | Estado |
|---|---|---|
| Escanear el QR → repo de prueba `speco-playground` | <0,5 | ✅ probado con un celular |
| «Editar la regla» → cambiar 10,000 por 15,000 → *Propose changes* | ~1 | ✅ desde la cuenta del dueño; ⬜ **desde otra cuenta (fork) sin probar** |
| Speco comenta en la PR: qué cambia, qué tarea quedó vieja, qué bloqueantes trae | ~0,1 (3,4 s medido) | ✅ PR #1 de `speco-playground` |
| **Total, cualquiera con cuenta de GitHub** | **~2** | Cumple `G-7` si el fork funciona |
| Llevarlo a sus repos: «Instalá Speco» al pie del comentario | 1 | ✅ App pública `speco-pr-review`; su repo necesita specs de Spec Kit |
| Retrato inicial de su software, para confirmar | +5–10 | ⬜ servicio cloud sin desplegar |

## 7. Ángulos de contenido

| Ángulo | Idea central | Escena clave |
|---|---|---|
| Slop | «Tu código ya hace cosas que nadie decidió» | Un PR de un agente que mueve una regla y nadie lo ve |
| El agente adivina | «Un agente no aclara en el camino: adivina» | Dos requisitos contradictorios; el agente elige uno |
| Diff de negocio | «Mirá qué cambia en el negocio, no qué líneas cambiaron» | El comentario de Speco en el PR (✅ PR #1 de `speco-playground`) |
| Lista para construir | «Si no está en la spec, no está decidido» | Resumen ejecutivo con veredicto |
| Cursor para producto | «Lo que Cursor hizo con el código, con la intención» | Tabla de analogía; visión del grafo |
| Speco sobre Speco | «Nuestro repo es el primer cliente» | Las propias specs y decisiones (`G-12`) |

## 8. Lo que NO existe todavía (no lo prometas)

Detalle y estado en `AFIRMACIONES.md`. Lo esencial:
- **No hay clientes pagos, testimonios, logos, casos ni métricas de uso.**
- **Nada está desplegado.** La app cloud no corre en ningún lado; la demo pública es simulada; el cobro es simulado; Bitbucket es simulado.
- **No hay instalación pública:** repo privado, sin `LICENSE`, sin PyPI, sin tag `@v1` de la Action.
- **La garantía 1 es parcial:** no detectamos reglas que viven sólo en el código si nadie las confirmó.
- **Ninguna verificación del código contra lo decidido:** ni propiedades ni pruebas formales (`docs/37`).
- **El grafo de intención, el diff de intención y «si cambio esta regla, qué se rompe»** son visión, no producto.

## 9. Glosario rápido

- **Spec**: el lugar donde vive la intención (hoy, `spec.md`/`plan.md`/`tasks.md` de Spec Kit).
- **Slop**: cambios que nadie decidió pero que el código ya tiene.
- **Decisión** (`D-NNN`) y **objetivo** (`G-N`): viven en `product/`; una spec los cita.
- **Tu turno**: la cola de lo que espera tu decisión, y sólo eso.
- **Lista para construir**: el agente puede implementar sin adivinar.
- **Retrato inicial**: las reglas de negocio que tu software cumple hoy, propuestas para que una persona las confirme.
- **Cambio sin decidir**: una regla confirmada cuyo código se movió.
