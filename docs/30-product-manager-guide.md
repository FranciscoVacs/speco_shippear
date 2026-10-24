# 30 · Speco para producto: cómo se mete en un flujo con agentes en paralelo

Para quien **decide qué se construye** (product manager, product owner, head of product, founder) en un equipo donde varios agentes
de código trabajan a la vez y se mergea todo el día. Es la contraparte de [`docs/28`](28-developer-quickstart.md) (para quien programa).
La tesis completa está en [`docs/16`](16-thesis.md); acá se baja a **qué instalás, qué cambia en tu semana y qué no hace todavía**.

> Esta guía también está en la app: **Ayuda → Para producto y gerencia** (`/docs/product`). Si cambia una, cambia la otra (`tests/test_product_guide_docs.py` vigila los comandos).
>
> **Regla de lectura:** cada sección marca qué existe hoy (✅), qué existe sólo en la demo o sin verificar contra servicios reales (🟡) y
> qué falta (⬜). La sección 8 junta lo que falta. Nada acá promete más que [`docs/16` §3](16-thesis.md) («Cobertura hoy»).

---

## 1. El problema, desde tu silla

Con un equipo humano, producto era el cuello de botella *por diseño*: el desarrollo era lento, así que había tiempo de escribir el
ticket, aclararlo en la daily y mirar la demo. Con agentes eso se invierte:

| Antes | Con 5–10 agentes en paralelo |
|---|---|
| Implementar tardaba semanas; la spec podía ser vaga porque se aclaraba en el camino | Implementar tarda minutos; **un agente no aclara en el camino: adivina** |
| Un PR por día, revisable línea por línea | Decenas de PRs por día; nadie lee todos los diffs |
| La intención vivía en la cabeza del dev que implementaba | No hay cabeza: la intención es lo que está escrito, o nada |
| El PM revisaba al final (demo, QA) | Al final ya está mergeado, y lo siguiente se apoya encima |

Tres cosas se rompen, y son las tres formas de *slop* de la tesis: **una regla de negocio cambia sin que nadie la decida**, **se aprueba
código en vez de intención**, y **la intención no tiene casa**. Tu trabajo deja de ser alimentar al equipo con tickets y pasa a ser
**decidir rápido, una sola vez, y que lo decidido quede donde los agentes lo lean**.

Speco no escribe tu spec ni programa. Es la capa que hace tres cosas por vos:

1. **Te junta en una sola cola lo que de verdad espera tu decisión** y esconde el resto (hoy: *Tu turno*).
2. **Frena a los agentes antes de que construyan sobre una spec rota o contradictoria** (hoy: el gate y el MCP).
3. **Te avisa cuando algo ya decidido se movió en el código sin que nadie lo haya decidido** (hoy: *cambios sin decidir*, por evidencia de código).

---

## 2. Dónde se mete: el ciclo con cuatro puntos de contacto

```
   ┌──────────────────────── tu cola: «Tu turno» ────────────────────────┐
   │                                                                     │
   ▼                                                                     │
 ① DECIDIR            ② ANTES DE CONSTRUIR       ③ EN EL PR            ④ DESPUÉS DEL MERGE
 objetivos y          el agente revisa la spec    un check de specs     el código cambió una regla
 decisiones en        (get_blockers) y se frena   comenta el PR:        confirmada → «cambio sin
 product/             si hay bloqueantes; lo que  bloqueantes,          decidir» en tu cola
 + specs              es tuyo vuelve como         contradicciones,
                      pregunta cerrada A/B        scope colado
```

| # | Punto | Qué hace Speco | Quién actúa | Estado |
|---|---|---|---|---|
| ① | **Decidir** | Guarda objetivos (`G-n`) y decisiones (`D-n`) en `product/`; cada spec los cita. Una decisión *superseded* o *rejected* citada por una spec **bloquea** (`PRD003`) | Vos | ✅ |
| ② | **Antes de construir** | El agente llama `get_blockers`; el plugin de Claude Code frena `/speckit.implement` con bloqueantes. Lo mecánico lo arregla el agente; lo que es de producto vuelve como pregunta | Agente → vos | ✅ en Claude Code · 🟡 en otros clientes (sin gate, ver §8) |
| ③ | **En el PR** | La GitHub Action revisa sólo las features que el PR tocó y deja **un** comentario que se actualiza, anotaciones y un check | CI → equipo | ✅ |
| ④ | **Después del merge** | Compara las líneas de evidencia de cada regla *confirmada*; si cambiaron, abre un hallazgo que nombra la regla y espera tu motivo | CI/worker → vos | 🟡 (ver §8: servicio cloud sin GitHub real) |

Lo que une todo: **cada hallazgo tiene un dueño** (`owner`). Sólo los que *no puede resolver el equipo* (¿cuál de dos reglas manda?,
¿entra o se saca este scope?, ¿esta pregunta abierta?, ¿se confirma esta regla?) llegan a tu cola. Los demás los ve el equipo o el
agente. Esa es la forma en que Speco intenta que **no te vuelvas el nuevo cuello de botella**.

---

## 3. Setup: tres niveles, de cero a flujo completo

No hace falta hacer todo. Cada nivel termina con algo visible y se puede parar ahí.

### Nivel 0 · Mirarlo sin instalar nada (5 min) ✅
Abrí la demo de la app (sitio estático, datos simulados y rotulados). Pasá por **Inicio → Decisiones → una revisión → Aprobación**.
Es el mejor lugar para entender el lenguaje: *veredicto*, *Tu turno*, *Lista para construir*. Si querés ver el motor real sin la app,
pedile a tu dev el [quickstart](28-developer-quickstart.md): `specreview demo` es un comando.

### Nivel 1 · Tu equipo ya usa Spec Kit: hacerte visible en el repo (30 min, con un dev) ✅
Necesitás que un dev haga una vez lo técnico; vos hacés lo que sólo vos podés:

| Paso | Quién | Qué | Resultado |
|---|---|---|---|
| 1 | Dev | `specreview init` (deja `specreview.toml` y el workflow de GitHub Actions) y mergear ese PR | Cada PR que toque `specs/` recibe un comentario con el veredicto |
| 2 | Dev | `specreview baseline` | La deuda actual se registra y de acá en más sólo ves **lo nuevo** (sin esto, 40 hallazgos viejos y nadie mira el comentario) |
| 3 | **Vos** | Crear `product/goals.md` con 3–8 objetivos (`**G-1**: …`) | Ahora «¿esta feature responde a un objetivo?» es verificable (`PRD001`, `PRD004`) |
| 4 | **Vos** | Crear `product/decisions.md` con lo que ya está decidido, cada una con `Status` y, si aplica, `Out of scope` | Un agente que proponga lo contrario choca con `PRD003` |
| 5 | **Vos** | Pedir que cada spec nueva abra con `**Goals**: G-1` y `**Decisions**: D-003` (el template/prompt de tu equipo lo escribe) | La trazabilidad se *cita*, no se infiere |
| 6 | Dev | Agregar a las reglas de los agentes (`AGENTS.md`, `CLAUDE.md`) la instrucción «antes de implementar llamá `get_blockers`; lo que sea decisión de producto, preguntalo» (ver [`docs/11`](11-mcp-and-plugin.md)) | Los agentes te hacen preguntas cerradas en vez de adivinar |

El formato exacto de `product/` está en [`docs/13`](13-product-layer.md). Un ejemplo mínimo de una decisión:

```markdown
## D-003: Los puntos no vencen
**Status**: accepted
**Out of scope**: vence, expira, expiry
```
Si un agente escribe «los puntos vencen a los 12 meses» en un requisito, aparece como advertencia que **es tuya** (inferido por
texto: puede ser falso positivo; vos confirmás).

> **Consejo:** empezá con pocas decisiones, las que más han dolido («no hay descuentos en planes mensuales», «un usuario = una
> organización»). Una decisión que nadie cita no protege nada; una lista de 80 que nadie mantiene tampoco.

### Nivel 2 · La app conectada a tu código y a tu día (1–2 h) 🟡
Es el modo *cloud*: iniciás sesión (teléfono verificado), creás tu empresa, instalás la GitHub App (o Bitbucket) desde **Conectar** y
Speco arma el **retrato inicial**: reglas de negocio que tu software ya cumple hoy, cada una con las líneas de código que la
respaldan. Vos **confirmás / corregís / rechazás** (rechazar pide motivo) y **congelás la línea base**. Desde ahí, si una regla
confirmada cambia, te enteramos.

| Paso | Qué hace | Nota |
|---|---|---|
| Conectar repo | Owner/admin instala la GitHub App y elige qué repos puede leer Speco | Sólo lectura |
| Retrato | Propone reglas desde specs `Implemented` y, **sólo si un owner/admin da consentimiento**, desde un puñado de archivos de código vía un modelo (≤30 archivos / 300 KB) | Lo que propone una máquina es una propuesta; sólo una persona lo convierte en baseline |
| Confirmar | Cola *Tu turno* → Confirmar / Corregir / Rechazar | Queda quién, cuándo y qué cambió, sin poder reescribirse |
| Congelar | Foto inmutable de las reglas confirmadas | Punto de comparación de todo cambio posterior |
| Slack | `specreview notify slack . --interactive`: un digest que **sólo nombra lo que espera tu decisión** (y calla si no hay nada), con botones Aprobar/Rechazar | Necesita que tu usuario de Slack esté vinculado a un `approver` |
| Agente del lado producto | Conectá Speco como conector MCP a tu Claude (`/agents` en la app trae la dirección y los pasos) y preguntale «¿qué espera mi decisión?» (`pending_decisions`) | Los agentes **leen y proponen; nunca deciden** (`D-012`), y lo hace cumplir la base, no una convención |

Quién puede qué: `approver` decide; `member` y `viewer` leen. Los roles de la empresa son owner / admin / approver / member / viewer.
Quién puede aprobar es en sí una decisión: revisala vos.

---

## 4. Tu día, con Speco

Un día tipo con 6–8 agentes trabajando en paralelo. Los tiempos son una estimación del orden de magnitud, no una medición.

| Momento | Qué hacés | Dónde | Tiempo |
|---|---|---|---|
| **Al empezar** | Abrís **Decisiones**: los contadores te dicen cuántas features están *Necesitan tu decisión*, *Bloqueadas*, *Necesitan trabajo del equipo* o *Listas para construir*. Leés **Tu turno** (sólo lo tuyo, por feature). Si usás Slack, es el digest de la mañana | App / Slack | 10 min |
| **Decidir** | Por cada ítem: elegís A o B, o respondés la pregunta abierta, y lo anotás **en la spec** (no en el chat). El agente la relee en su próxima corrida. Si la decisión es de fondo (aplica a más de una feature), va a `product/decisions.md` con un id nuevo | Spec / `product/` | 2–5 min c/u |
| **Durante el día** | Los agentes que se atascan te devuelven preguntas cerradas («¿límite diario 5.000 o 10.000 USD?»). Si tu cliente MCP tiene Speco conectado, le preguntás al agente «¿esto ya está decidido?» antes de contestar de memoria | Tu agente / chat | ad hoc |
| **Antes de aprobar** | Abrís la revisión: arriba va el **resumen ejecutivo** (veredicto, una frase, qué se arriesga). **Lista para construir** = el agente no va a adivinar. Aprobás, aprobás con condiciones, rechazás o delegás (con motivo) | App | 3 min c/u |
| **Cuando algo cambió solo** | Llega un *cambio sin decidir*: una regla confirmada cuyo código se movió. Reconocés con motivo («los dueños decidieron abrir las invitaciones») o pedís revertirlo | App / Slack | 5 min |
| **Al cerrar** | *Copiar resumen* arma el texto listo para Slack/standup. Para un stakeholder sin acceso a la app: reporte HTML autocontenido (`specreview . -f html`) | App / CLI | 2 min |

**Lo que deja de pasar:** abrir diffs para entender qué cambió en el negocio; contestar por chat la misma duda a tres agentes;
descubrir en QA que dos tareas asumieron límites distintos.

**Lo que empieza a pasar:** decidís *más cerca de la spec* y *más temprano*; cada decisión deja un id que los agentes pueden citar; y
tu aprobación es un registro con hash de los archivos, así que si la spec cambia después, la decisión figura como **vieja**.

---

## 5. Recetas para producto

Cada una: **cuándo la usás → qué hacés → qué ves → qué ganás**.

### Receta A · Triar tu cola en 10 minutos (todos los días)
- **Cuándo:** primera hora, o cuando llega el digest de Slack.
- **Qué hacés:** *Decisiones → Tu turno*. Mirá primero lo **bloqueado por una contradicción** (`CON001/002`): dos requisitos que el agente va a
  implementar a su manera. Después preguntas abiertas (`QUA004`), después scope colado (`COV002/003`).
- **Regla práctica:** decidí en la spec, en una línea, con el id. «Se saca T009» o «FR-012 queda en 5.000 USD; FR-011 se elimina».
- **Qué ganás:** el agente que espera destrabado no consume horas; vos no volvés a explicar lo mismo.

### Receta B · Que cinco agentes no adivinen lo mismo distinto
- **Cuándo:** ponés a trabajar varias features en paralelo que tocan un mismo concepto (límites, planes, permisos, vencimientos).
- **Qué hacés:** antes de lanzarlos, escribí (o confirmá) la decisión en `product/decisions.md` y hacé que cada spec la cite con `**Decisions**: D-0xx`.
  Un agente que proponga lo contrario, o use un término del *Out of scope* de la decisión, tiene una advertencia que es tuya (`PRD003`).
- **Qué ganás:** una decisión, una vez, leída por todos. **Ojo:** hoy Speco no detecta que dos specs *paralelas* se contradigan entre sí si
  ninguna cita una decisión común (ver §8): por eso esta receta pide elevar el concepto compartido a decisión *antes* de paralelizar.

### Receta C · Preguntarle a tu agente «¿esto ya está decidido?»
- **Cuándo:** un dev o un agente te pregunta algo y no te acordás si ya se resolvió.
- **Qué hacés:** con el conector MCP de Speco en tu Claude (o `specreview mcp .` si trabajás sobre un checkout), pedí:
  > Llamá `pending_decisions` y decime qué espera mi decisión, agrupado por feature. Para lo que ya está decidido, citá el id (D-xxx / FR-xxx).
- **Qué ganás:** respuestas con citas a lo decidido, no a la memoria de nadie. El agente **no puede** aprobar nada por vos.

### Receta D · Escribir una feature para que los agentes puedan construirla
- **Cuándo:** nueva feature. Lo mejor que le podés dar a un agente es una spec que no lo obligue a adivinar.
- **Qué hacés:** pedile a tu agente que valide cada requisito antes de escribirlo (`check_requirement`) y aspirá a ver **Lista para construir**:

  > Escribí la spec de «<idea>» con requisitos en formato EARS, con un criterio de aceptación por cada user story y la lista de
  > preguntas que NO puedo dejar sin responder. Antes de darme el borrador, validá cada requisito con `check_requirement`.

  Tu parte: responder las preguntas con A/B, definir los números («p95 < 300 ms», «5.000 USD/día»), y declarar `**Goals**` y `**Decisions**`.
- **Qué ganás:** los criterios de aceptación salen de la spec, no de quien implementa; el test es casi mecánico ([`docs/29`](29-developer-recipes.md), recetas 1–3).

### Receta E · Cuando una regla cambió sin que nadie la decidiera (cambio sin decidir) 🟡
- **Cuándo:** aparece un *cambio sin decidir* en el retrato o llega por Slack.
- **Qué hacés:** abrí la regla (qué decía, el código que la respaldaba, qué cambió). Dos salidas: **reconocer con motivo** (la decisión de negocio cambió y ahora está
  registrada) o **pedir que se revierta** (era slop). Si se reconoce un cambio permanente, actualizá la spec o la decisión correspondiente.
- **Límite que tenés que conocer:** el drift mira que **cambiaron las líneas de evidencia**, no que cambió el comportamiento. Una regla repartida en varios archivos
  puede moverse sin tocar su evidencia. Es una señal para que alguien mire, no un veredicto ([`docs/18`](18-initial-portrait.md)).

### Receta F · Tengo una idea y no hay código (la segunda puerta) 🟡
- **Cuándo:** estás validando algo con una herramienta de IA (vibecoding) y todavía no hay repositorio.
- **Qué hacés:** elegí «empiezo desde una idea», contá lo que querés con tus palabras y respondé las preguntas de a una. Speco guarda tus
  decisiones como spec (sin repo) y te da un **brief** para pegar en tu herramienta. Si no sabés una respuesta, queda abierta y marcada como riesgo en lugar de adivinarse.
  Cuando después conectes el código, compara lo construido con lo decidido: lo que el código hace y nadie decidió, y lo decidido que falta.
- Spec: `specs/016-two-doors` (estado *Draft* al momento de escribir esto: ver §8).

### Receta G · Mostrar el estado a alguien que no usa la app
- **Qué hacés:** *Copiar resumen* (texto para Slack) o `specreview . -f html -o review.html` (un archivo autocontenido). Para actas de decisiones:
  `specreview approvals list` imprime quién decidió qué y cuándo, y `specreview approvals verify` comprueba que el registro no se editó.
- **Qué ganás:** una respuesta auditable a «¿quién aprobó esto y sobre qué versión?».

---

## 6. Cómo no convertirte en el nuevo cuello de botella

Que Speco te junte las decisiones en una cola no las vuelve más rápidas. Lo que sí podés hacer:

| Práctica | Por qué |
|---|---|
| **Decidí en la spec, no en el chat** | El agente relee la spec; el chat se pierde. Una decisión fuera de la spec «no está decidida» |
| **Elevá lo recurrente a `product/decisions.md`** | La segunda vez que contestás lo mismo, es una decisión que debía existir |
| **Pedí preguntas cerradas** (A/B con consecuencia) | Se contestan en minutos; las abiertas se dejan para mañana |
| **Delegá con nombre** (`delegated`, con motivo) a otro `approver` por área | Tu cola no depende de tu agenda; queda registrado quién |
| **Usá `waive` con vencimiento** para lo que decidís aceptar | «Lo decidió producto, vence en Q1» no ensucia el check y se vuelve a mirar |
| **Fijá un ritmo** (por ejemplo: bloqueados el mismo día, el resto en 48 h) | Speco ordena por urgencia y dice *quién espera a quién*, pero no te pone el plazo |
| **No aprobés con bloqueantes** salvo `override` + motivo | Queda marcado: es una excepción consciente, no un descuido |

Las **sugerencias** nunca cambian el estado de una feature; si tu cola se llena de ruido, ajustá `specreview.toml` (`--min-severity`) o
registrá un baseline, no ignores el check entero.

---

## 7. Qué cambia en tus rituales

| Ritual | Antes | Con Speco |
|---|---|---|
| Refinamiento | Discutir tickets en una reunión | Revisar *Tu turno*: sólo lo que de verdad necesita producto; el resto ya viene resuelto por el agente |
| Aceptación | Ver la demo y decir «ok» | Mirar el veredicto de la intención **antes** de que se construya; en la demo se verifica que el criterio de aceptación pasa |
| Priorización | Backlog ordenado por impacto | Lo mismo, más el filtro *Lista para construir*: sólo se paraleliza lo que los agentes pueden construir sin adivinar |
| Postmortem de bug de negocio | «No se entendió el ticket» | «¿Estaba decidido? ¿En qué spec? ¿Qué cambió y quién lo aprobó?» (registro de aprobaciones + historial de cambios a reglas) |
| Auditoría | Buscar en mails | `approvals list` y la cadena de hashes |
| Onboarding de un PM nuevo | Leer todo | El retrato y `product/decisions.md` son el mapa de lo que el producto hace y por qué |

---

## 8. Límites honestos: lo que no hace hoy

Para producto, **estos límites importan más que las capacidades**.

| Límite | Consecuencia | Qué hacer mientras tanto |
|---|---|---|
| **Garantía 1 es parcial** ([`docs/16`](16-thesis.md)): Speco no detecta reglas que viven *sólo* en el código si nadie las confirmó; el drift mira líneas de evidencia | No digas «detectamos cualquier cambio de comportamiento» | Confirmá las reglas críticas (dinero, permisos, datos personales) en el retrato (evidencia por símbolo: `TODO.md` T-025) |
| **Contradicciones: dentro de una feature y contra `product/decisions.md`.** Dos specs paralelas que se contradicen sin citar una decisión común no se detectan | Dos agentes pueden implementar límites distintos en features distintas | Receta B: elevar el concepto compartido a decisión antes de paralelizar (regla que lo detecte: `TODO.md` T-024) |
| **Lo inferido por texto es una pista, no un veredicto** (`PRD003` por *Out of scope*, huecos de cobertura sin `FR-###`) | Falsos positivos posibles; sólo lo explícito bloquea | Citar ids (`FR-005`, `D-003`) |
| **El gate duro sólo existe en Claude Code** (plugin + hook). En Cursor/VS Code/Codex el agente tiene las herramientas pero nada lo obliga a usarlas | Un agente puede implementar sin consultar | `specreview init --agents` (instrucciones en `AGENTS.md`/reglas del IDE), `specreview gate --install-hook pre-push` y el check de PR como red de seguridad ([`docs/28`](28-developer-quickstart.md)). Las instrucciones son persuasión: el hook de git y el PR son los que obligan |
| **El MCP y el plugin se probaron por stdio, no en clientes reales** (`TODO.md` T-001) | Los snippets de cada cliente pueden necesitar ajustes | Probar un cliente a la vez; reportar lo que falle |
| **Slack y Jira se probaron contra servidores falsos**, no contra un workspace real ([`docs/14`](14-approvals-and-connectors.md)) | Los botones o la firma pueden fallar al primer uso real | Hacer una corrida en un canal de prueba antes de confiar |
| **Modo cloud: GitHub, OAuth con Supabase y el conector MCP remoto no están verificados contra servicios reales** ([`docs/19`](19-cloud-app.md), [`docs/22`](22-speco-on-speco.md)). Fuera del retrato, las pantallas de la app muestran datos de demostración rotulados | No todo lo que ves en la app cloud es tuyo todavía | Distinguí los rótulos «demo» y tratá lo cloud como piloto |
| **El retrato con modelo no se probó con un modelo real**: la calidad y el recall están por medir ([`docs/18`](18-initial-portrait.md)) | Puede faltar alguna regla importante | Revisá a mano las reglas de mayor riesgo; no lo tomes como inventario completo |
| **Sin secciones de PRD completo**: sólo se leen objetivos, decisiones y supuestos | Un PRD largo no se valida | Bajá a specs lo que querés que se verifique |
| **Sólo Spec Kit** (`spec.md`/`plan.md`/`tasks.md`) y sólo repos con esa estructura para las revisiones de spec | Si tu equipo usa otro formato, el nivel 1 no aplica | Empezar por el retrato (nivel 2) |
| **No hay product tour ni guía in-app para este flujo** ([`docs/16` §5](16-thesis.md)) | Esta página es la única guía de este recorrido | — |

---

## 9. Primera semana sugerida

| Día | Qué | Resultado |
|---|---|---|
| 1 | Recorré la demo y leé [`docs/16`](16-thesis.md) §1–3 (10 min) | Entendés el vocabulario |
| 1 | Con un dev: nivel 1, pasos 1–2 | Cada PR de specs tiene su comentario |
| 2 | Escribí `product/goals.md` y las 5 decisiones que más te han dolido | Los agentes tienen algo que citar |
| 3 | Hacé que la próxima feature nueva nazca con `**Goals**`/`**Decisions**` (receta D) | Primera spec «lista para construir» |
| 4 | Corré la receta A con una feature real en paralelo con otra (receta B) | Sabés cuánto tarda *tu* cola y qué ítems repiten |
| 5 | Decidí si seguís al nivel 2 (retrato, Slack, MCP en tu Claude) | Una decisión sobre cuánta infraestructura querés |

Qué medir (para decidir si sirve, no para reportar hacia arriba): cuántas decisiones por feature llegan a tu cola, cuánto tardás en
despejarla, cuántas veces un agente se frenó por un bloqueante *real*, y cuántos cambios de negocio ves después del merge que
**no** estaban en una spec. Si esto último baja, la capa está haciendo su trabajo.

---

## Mapa de documentos

| Si querés… | Leé |
|---|---|
| El porqué y el vocabulario | [`docs/16`](16-thesis.md) |
| La app que usa quien aprueba (veredicto, Tu turno) | [`docs/12`](12-decisions.md) |
| Objetivos, decisiones y reglas `PRD00x` | [`docs/13`](13-product-layer.md) |
| Aprobaciones, Slack y Jira | [`docs/14`](14-approvals-and-connectors.md) |
| El retrato de reglas y los cambios sin decidir | [`docs/18`](18-initial-portrait.md) |
| Conectar un agente a Speco (MCP remoto) | [`docs/22`](22-speco-on-speco.md) |
| Poner Speco en CI y adoptar con deuda | [`docs/10`](10-adoption.md) |
| Lo que hace el equipo técnico (para pasarle a tu dev) | [`docs/28`](28-developer-quickstart.md) · [`docs/29`](29-developer-recipes.md) |
