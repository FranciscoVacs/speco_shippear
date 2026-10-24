# 29 · Qué podés lograr con la CLI y el MCP (recetas)

Seis casos concretos, del más inmediato al más ambicioso. Cada uno dice **qué problema resuelve, qué escribís y qué ves**. Los
outputs son reales (corridos sobre `examples/`). Instalación y conexión: [`docs/28`](28-developer-quickstart.md).

| # | Receta | Usa | Tiempo hasta el valor |
|---|---|---|---|
| 1 | El agente no implementa una spec rota | MCP + plugin | 2 min |
| 2 | Escribir requisitos que ya nacen testeables | MCP | 1 min |
| 3 | Atrapar scope colado antes de que sea código | CLI / MCP | 30 s |
| 4 | Que cada PR de specs se revise solo | CLI + CI | 5 min |
| 5 | Encender todo en un repo con deuda, sin ruido | CLI | 3 min |
| 6 | Que la spec respete lo que producto ya decidió | CLI / MCP | 10 min |

---

## 1 · El agente no implementa una spec rota

**El problema.** El agente construye lo que está en `tasks.md`. Un requisito sin task simplemente no se hace; dos requisitos que
se contradicen, se implementa el que el agente lea primero. Lo descubrís en code review, o en producción.

**Qué hacés.** Con el plugin de Claude Code instalado, corrés `/speckit.implement` como siempre. Si la spec tiene bloqueantes, el
hook lo frena **antes** de que el agente toque código:

```
specreview: 006-wire-transfer-limits tiene 2 bloqueante(s); Arreglá estos bloqueantes EN LA SPEC
(spec.md/plan.md/tasks.md) y volvé a llamar; no implementes todavía.
  - CON001 FR-003 + FR-004 (spec.md:53): FR-003 y FR-004 se contradicen: valores distintos para lo mismo: «5,000 USD» vs «10,000 USD».
  - COV001 FR-007 (spec.md:57): FR-007 no tiene correlato en el plan ni en las tasks: nadie lo va a implementar.
```

Después `/review-spec 006`: el agente arregla lo que es mecánico (agregar la task que falta citando `FR-007`) y **te devuelve como
pregunta** lo que es decisión de producto («¿el límite diario es 5.000 o 10.000 USD?»). Vuelve a correr `get_blockers` hasta que
`can_implement` es `true`. Sin plugin, el mismo bucle con un prompt:

> Antes de implementar la feature 006 llamá `get_blockers`. Mientras `can_implement` sea false, arreglá la spec (no el código) y
> volvé a llamar. Lo que sea decisión de producto, preguntámelo con la opción A/B concreta.

**Qué ganás.** El agente deja de "adivinar" ante una spec ambigua; las decisiones llegan a una persona como preguntas cerradas.

---

## 2 · Escribir requisitos que ya nacen testeables

**El problema.** «El sistema debería ser rápido y fácil de usar» pasa cualquier review humano apurado y es imposible de verificar.

**Qué hacés.** Pedile al agente que valide cada requisito *antes* de escribirlo (la skill `spec-review` ya se lo indica), o hacelo
vos desde cualquier cliente MCP:

> Usá `check_requirement` con «The system should be fast and user friendly» y reescribilo hasta que pase.

```json
{ "ok": false, "ears_pattern": "none",
  "issues": [
    { "rule": "QUA002", "message": "no es testeable: usa «fast», «user friendly» sin un umbral medible.",
      "fix": "Definir un número verificable (p. ej. «p95 < 300 ms», «≥ 99 % de …»)" },
    { "rule": "QUA002", "message": "usa lenguaje no vinculante («should»)",
      "fix": "Usar MUST (obligatorio) o moverlo a Assumptions/ideas si es opcional" } ] }
```

Resultado de la iteración: *«When a user submits the invitation form, the system MUST respond within 300 ms at p95.»* — con
patrón EARS, `MUST` y un número que un test puede afirmar.

**Qué ganás.** Los criterios de aceptación salen de la spec, no de la cabeza de quien implementa. Y el test es casi mecánico.

---

## 3 · Atrapar scope colado antes de que sea código

**El problema.** Alguien agrega «ya que estamos, notificación por Slack» al plan y dos tasks. Nadie lo pidió, nadie lo va a
mantener, y llega al PR como si fuera parte de la feature.

```bash
specreview examples/invitations --min-severity warning | grep -E "COV00[23]"
```
```
ADVERTENCIA T009  tasks.md:19  COV002  T009 no responde a ningún requisito (introduce: slack, notification): posible scope que se coló.
ADVERTENCIA T010  tasks.md:20  COV002  T010 no responde a ningún requisito (introduce: csv, bulk, import): posible scope que se coló.
ADVERTENCIA P4    plan.md:7    COV003  El plan incluye «We also add a Slack notification channel so admins learn when invitat…» (P4) que no responde a ningún requisito (introduce: slack, notification, channel, learn).
```

Las dos salidas válidas están en la propia sugerencia: **agregar el requisito que lo justifica** (alguien de producto decide que sí)
o **borrar la task**. Lo que no puede pasar es que se implemente en silencio.

**Qué ganás.** El review de scope ocurre en el documento, donde corregir cuesta una línea, no en el diff.

---

## 4 · Que cada PR de specs se revise solo

```bash
specreview init                                                  # workflow + specreview.toml
specreview . --diff origin/main -f sarif -o specreview.sarif     # lo que corre el CI: sólo features que el PR tocó
```

En el PR: **un** comentario que se actualiza con la tabla de hallazgos, anotaciones en el diff (Code Scanning) y un check que
falla con bloqueantes. Para otros CI o hooks locales:

```bash
specreview . --fail-on blocker                    # exit 1 si hay bloqueantes (pre-push, Makefile, cualquier CI)
specreview . -f markdown -o review.md             # para pegar en un ticket o en Slack
specreview . -f html -o review.html               # reporte autocontenido, para mandar a alguien que no usa terminal
specreview . -f json | jq '.findings[] | select(.severity=="blocker") | .ids'   # integrarlo a lo que ya tengas
```

**Qué ganás.** La revisión de requisitos deja de depender de que alguien se acuerde de hacerla. Detalle: [`docs/10`](10-adoption.md).

---

## 5 · Encender todo en un repo con deuda, sin ruido

**El problema.** Tu repo tiene 40 hallazgos viejos. Si el CI los reporta todos, nadie lo mira en una semana.

```bash
specreview . --all                      # foto de hoy, con tabla por feature
specreview baseline                     # registra lo actual en .specreview/baseline.json
specreview . --all                      # ahora: 0 hallazgos. De acá en más, sólo lo nuevo
specreview waive dfbc6da73e4f --reason "Lo decidió producto: el viejo plan sigue vigente hasta Q1" --expires 2027-03-31
```

El `fingerprint` (lo ves en `-f json` o en SARIF) **no cambia si editás líneas más arriba**, así que el baseline no se "resucita"
por tocar el archivo. Baseline y waivers son archivos del repo: la excepción se revisa en un PR como cualquier cambio, con autor,
motivo y fecha de vencimiento.

**Qué ganás.** Adopción incremental: hoy sólo frenás lo nuevo, y la deuda vieja se paga cuando convenga.

---

## 6 · Que la spec respete lo que producto ya decidió

**El problema.** La spec se apoya en una decisión que producto ya revocó, o cita un objetivo que no existe. El código sale
correcto *respecto de la spec* y equivocado respecto del negocio.

Con una carpeta `product/` (`goals.md`, `decisions.md`; opt-in, ver [`docs/13`](13-product-layer.md)):

```bash
cd examples/subscriptions && specreview . --only product
```
```
BLOQUEANTE   D-003  spec.md:1   PRD003  La spec se apoya en la decisión D-003 («Annual plans are billed upfront»), que está superseded.
ADVERTENCIA  G-9    spec.md:1   PRD002  La spec cita el objetivo G-9, que no existe en product/goals.md.
ADVERTENCIA  FR-002 + D-002  spec.md:37  PRD003  FR-002 parece ir contra la decisión D-002 («No discounts on monthly plans»): menciona «discount»…
ADVERTENCIA  003-annual-plans  spec.md:46  PRD005  Supuesto sobre el usuario sin evidencia: «Admins prefer paying once a year…»
```

Por MCP, el agente puede preguntar `product_overview` («¿qué objetivos nadie está construyendo?, ¿qué features no responden a
ninguno?») y `approval_status` («¿esta feature está aprobada? ¿cambió la spec desde la aprobación?») — ambas de sólo lectura:
**un agente puede consultar y proponer, nunca aprobar**.

**Qué ganás.** El código deja de ser la única fuente de verdad sobre el negocio; las decisiones viven en archivos versionados y el
agente las respeta.

---

## Prompts listos para copiar

| Para… | Pegale al agente |
|---|---|
| Empezar el día | «Corré `list_features` y decime cuáles pueden implementarse hoy y cuáles tienen bloqueantes, en una tabla.» |
| Antes de `/speckit.implement` | «Llamá `get_blockers` para la feature actual. Si `can_implement` es false, arreglá la spec y repetí.» |
| Entender una regla | «Usá `explain_rule` con COV001 y mostrame un ejemplo de arreglo en mi spec.» |
| Revisar un PR ajeno | «Corré `review_feature` con `min_severity: "warning"` sobre la feature de este PR y resumilo en 5 líneas por regla.» |
| Redactar una story | «Escribí los FR de esta story y pasá cada uno por `check_requirement` hasta que `ok` sea true.» |
| Cerrar una discusión | «Listá las decisiones de producto pendientes que salieron de `get_blockers`, cada una con 2 opciones y el costo de cada una.» |

## Más allá del repo: el MCP remoto
Si tu empresa usa Speco (la capa de decisiones), el agente también puede consultar —**sólo lectura**— qué reglas de negocio
esperan decisión, qué cambios de código se desviaron de lo aprobado y qué features están bloqueadas, conectando
`https://<servicio>/mcp` con OAuth. Ver [`docs/22`](22-speco-on-speco.md).

## Límites honestos
- Sin `--llm`, la cobertura requisito↔plan se **infiere por similitud de texto**: un hueco inferido es advertencia, no bloquea.
  Citar `FR-###` en la task lo vuelve explícito (y bloqueante si falta). Calibración real: [`docs/04`](04-real-repo-calibration.md).
- La herramienta revisa **specs**, no código. Nunca decide por vos: una contradicción de negocio se muestra, no se resuelve sola.
