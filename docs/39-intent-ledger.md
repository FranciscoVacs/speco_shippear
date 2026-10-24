# 39 · El qué: el registro de intención (spec 028)

> Con agentes escribiendo el código, el código es el **cómo**. Este registro es el **qué**: cada regla que dicen las specs, cuánta
> evidencia la respalda hoy y cómo llegó a decir lo que dice. Es el primer lugar al que va un agente (o una persona) de producto
> antes de leer código. Objetivo `G-19`, decisión `D-020`.

## La pregunta que contesta

«¿Qué hace hoy el software, qué falta construir, y cómo lo sabemos?», sin abrir el código. Cada requisito (`FR`) y criterio de éxito (`SC`)
de cada spec tiene **un** estado:

| Estado | Qué significa | De dónde sale |
|---|---|---|
| **Propuesta** | La spec lo dice; nadie aprobó esta versión y no está construido | Spec sin `Status: Implemented` ni aprobación vigente |
| **Decidida** | Aprobada para la versión actual de la spec, todavía sin construir | Registro de aprobaciones (`docs/14`), sin cambios desde la aprobación |
| **Construida sin test** | La feature está implementada, pero ningún test cita la regla: sólo tenés la palabra de la spec | `Status: Implemented`, o todas las tasks hechas |
| **Con test, sin correr** | Un test cita la regla; no hay una corrida registrada para su texto actual | Citas `<feature>/<id>` en archivos de test |
| **Verificada** | La última corrida de los tests que la citan, **para este mismo texto**, pasó | `.specreview/verifications.jsonl` |
| **Rota** | Esa corrida falló: el software ya no hace lo que dice la regla | ídem |

«Verificada» es **evidencia por casos**, no una demostración (`D-019`, `docs/37`). Si alguien cambia el texto de la regla, las corridas viejas
dejan de contar y la regla vuelve a «con test, sin correr»: se verifica lo que dice la spec **hoy**, no lo que decía.

## Cómo se cita una regla

En el test que la comprueba, en cualquier lenguaje, con el número de la feature y el id:

```python
def test_second_approval():
    """Verifies 028/FR-002, FR-003"""        # los ids siguientes de la misma línea son de la misma feature
```

También vale `028-intent-ledger/FR-002` o `028:FR-002`; si el nombre después del número no es el de la feature, la cita es huérfana. Un id solo (`FR-002`) **no cuenta**: existe en todas las features.
Ojo con los fixtures: un test que *escribe* `001/FR-001` como dato cuenta como cita. Si no lo es, armá la referencia en tiempo de ejecución (así lo hace `tests/test_ledger.py`).
Un archivo cuenta como test por su ruta (`tests/`, `test_*.py`, `*_test.go`, `*.test.ts`, `*.spec.ts`…); en otro archivo, la cita es «la cita el código».
Una cita a una regla que no existe aparece como **evidencia huérfana**: o la regla se borró, o la cita está mal.

## Verificar (corre tests, sólo si el repo lo configuró)

```toml
# specreview.toml
[ledger]
verify = "python -m pytest -q {nodes}"     # {nodes}: los tests que citan la regla (pytest node ids); {files}: sus archivos
```

Si tus tests dependen del orden dentro de un archivo (fixtures de módulo compartidas), usá `{files}`: corre los archivos enteros que citan la regla y
cualquier falla en ellos la marca rota. Es lo conservador, y es lo que usa este repo. `passed_pattern` (p. ej. `"\\d+ passed"`) exige que la salida
muestre tests que pasaron: un runner que saltea todo también sale con 0.

`specreview ledger . --verify 028/FR-002` corre **sólo** esos tests, sin shell, y agrega una entrada al registro encadenado con el resultado,
el comando, el commit y el hash del texto de la regla. Sin comando configurado no corre nada y dice qué agregar (`D-001`: lo demás sigue offline).

## Números decididos (spec 029)

Un test que cita una regla no garantiza su **número**: el test de `021/FR-008` fija el tope en 2 para probar el mecanismo, así que sigue
pasando si alguien cambia el 10 decidido por 25. Para eso, vinculá el número a la línea de código que lo guarda:

```toml
# specreview.toml
[values]
"021/FR-008" = { file = "supabase/migrations/20261018000002_referrals.sql", match = "'referral_monthly_cap',\\s*(\\d+)" }
```

- Cada vez que se arma el ledger (CLI, MCP, app) se lee ese número **sin correr tests**. Si no es uno de los números de la regla, la regla pasa a
  **rota** con «la regla dice 10; `archivo:línea` tiene 25» y el commit, autor y fecha que cambió esa línea (`git blame`).
- Una vinculación que no encuentra el archivo o el patrón queda **rota** también: nunca se muestra «verificada» sobre algo que no se pudo leer.
- `specreview diff` y el comentario del PR (spec 026) avisan cuando un PR **mueve** un número decidido, aunque no toque ninguna spec.
- `change_requirement` devuelve `touches`: las vinculaciones que todavía tienen el número viejo y las reglas de la feature con un número en la
  misma unidad (p. ej. pasar la recompensa de 20 a 30 créditos muestra el `referral_reward` del código y `SC-003`: «nunca más de 200»).
- Cada regla dice hace cuántos commits fue su última corrida (`run_age`).

Límite: un número **derivado** (200 = 10 × 20) no tiene una línea propia; ése sólo lo detecta correr los tests (`--verify`).

### Proponer vinculaciones, y el número en la decisión (specs 030 y 031)

- `specreview ledger . --suggest-values` (o la herramienta MCP `suggest_values`) propone el bloque `[values]`: para cada regla con un número, la
  línea de código que guarda ese número junto a un nombre que comparte una palabra con la regla. No escribe nada. En este repo encuentra las cuatro
  vinculaciones de referidos que escribió una persona, y otras para revisar (por ejemplo `welcome_credits` 20 para `020/FR-001`).
- Una decisión puede fijar números: `**Fixes**: 021/FR-008 = 10, 021/FR-005 = 20` en `product/decisions.md`. Una regla que dice otro número es
  un bloqueante (`PRD007`) que va a una persona; un número roto en el código dice qué decisión lo fijó; `change_requirement` dice qué decisión reabre.
- En la nube, un PR que **sólo** mueve un número decidido en el código deja esa feature esperando una decisión: el check «Speco · decisión» queda
  pendiente y la versión que se decide muestra los números en `values.md`.

## Una corrida de la suite, todas las reglas (spec 030)

```toml
[ledger]
suite = "python -m pytest -q --junitxml {junit}"
```

- `specreview ledger . --verify-all` corre la suite **una vez** y registra cada regla cuyos tests corrieron, en el commit actual.
- `specreview ledger . --junit report.xml` hace lo mismo con un reporte que ya existe (el del job de tests en CI). Con `--no-record` sólo dice
  qué reglas rompe esa corrida y sale con 1: es lo que el job de CI escribe en su resumen.
- Una corrida que no corrió ningún test (no está el runner, o todo se salteó) queda como **error**: se muestra, pero no cambia el estado de la regla.

## Una verificación vale lo que vale su test (spec 032)

Un agente puede hacer «pasar» una regla debilitando el test que la verifica (borrar un assert, dejarlo en `assert True`). Anthropic lo cuenta de su
propio experimento de verificación formal: el agente podía volver demostrable cualquier teorema reescribiendo lo que se comprobaba (post del
2026-10-22, nota 6; `docs/37` §6.1). Por eso:

- Cada corrida (de `--verify` o de un reporte JUnit) guarda la **huella** de cada test que cita la regla: el hash del código de la función del test,
  con sus decoradores (o del archivo entero si la cita no está dentro de una función de Python). Los espacios no cuentan.
- Si un test cambió desde la corrida, o un test nuevo empieza a citar la regla, esa corrida **deja de contar**: la regla vuelve a «con test, sin correr»
  y el ledger nombra los tests editados (`changed_tests`). Se verifica el test de hoy, no el de ayer.
- Las corridas registradas antes de la spec 032 no tienen huellas y siguen contando como antes.
- `specreview diff` agrega una sección «⚠️ Este cambio toca el test de una regla» con la regla, el test y su texto, para que una persona mire si el test
  sigue comprobando lo que dice la regla. El comentario del bot en GitHub la muestra **sólo si el repo lo pide**: por defecto el bot lee specs y archivos
  de producto, nada más. Con `[pr]` / `review_tests = true` en `specreview.toml`, lee además los tests cuyo contenido cambió en la PR (sus dos versiones).
- **Tipo de evidencia:** cada regla con tests dice si su evidencia son **ejemplos** o **casos generados** (Hypothesis `@given`, fast-check, jqwik
  `@Property`, `forAll`, `proptest!`). Ninguna dice «probada»: esa palabra queda para una prueba formal (`D-019`).
- **Forma de las reglas:** `specreview ledger . --shape` clasifica cada requisito funcional en invariante, condicional o no formalizable, con su
  porcentaje y su N. Es el paso 1 de `docs/37` §7.

## Crear y corregir el qué (para agentes)

| Herramienta MCP | Qué hace | Qué escribe |
|---|---|---|
| `what_it_does` | **Empezá acá.** Lo que el software hace hoy, por feature, con su evidencia | nada |
| `intent_ledger` / `get_intent` | Todas las reglas, o una, con estado, citas y última corrida | nada |
| `intent_history` | Versiones de la regla en git (quién, cuándo), aprobaciones, cambios propuestos y corridas, en una línea de tiempo | nada |
| `verify_intent` | Corre los tests que citan la regla | `.specreview/verifications.jsonl` |
| `draft_feature` | Una feature nueva en `Draft` bajo el próximo número, con su revisión | `specs/NNN-x/spec.md` + `.specreview/intent-log.jsonl` |
| `change_requirement` | Reescribe o agrega una regla; devuelve antes/después, valores que se movieron, su revisión y si la aprobación quedó vieja | ese `spec.md` + `intent-log.jsonl` |

El agente **propone**; aprobar sigue siendo de una persona (`D-012`). Si cambia una regla de una feature aprobada, la respuesta lo dice y la aprobación
queda vieja a la vista de todos. `specreview init` escribe estas instrucciones en `CLAUDE.md`, `AGENTS.md`, Cursor o Copilot.

## Auditable

- `verifications.jsonl` e `intent-log.jsonl` son **append-only y encadenados por hash**, como las aprobaciones: editar o borrar una entrada rompe la
  cadena y el ledger dice dónde. Viven en el repo y se revisan en la PR como cualquier otro archivo.
- `intent_history` / `specreview ledger --history REF` arma la historia de una regla desde git (cada versión de su texto, con commit, autor y fecha),
  más las decisiones de su feature, los cambios que propuso un agente (con motivo) y cada corrida.

## Terminal y app

```bash
specreview ledger .                  # conteos por estado y cada regla
specreview ledger . --today          # sólo lo que el software hace hoy
specreview ledger . -f json|markdown
specreview ledger . --strict         # exit 1 si una regla construida no tiene test o una verificación falló (CI)
specreview ledger . --history 028/FR-014
```

En la app: **El qué** en la barra lateral (`/ledger`). Con `specreview <repo> --serve` muestra tu repo en vivo y el historial de cada regla; en la demo
muestra el ledger real de este repositorio.

## Límites honestos

- `verify` ejecuta el comando que define el `specreview.toml` **del repositorio**, igual que correr sus tests a mano: un agente conectado puede
  pedirlo. Conectá el MCP sólo a repositorios en los que confiarías para correr sus tests.

- La evidencia es **declarada**: que un test cite `028/FR-002` no prueba que lo compruebe bien. Lo que sí es mecánico: que el test exista, que esté en
  ese archivo y línea, si su última corrida pasó para el texto actual y, desde la spec 032, si el test cambió desde esa corrida. Revisar que el test
  compruebe la regla sigue siendo trabajo de una persona: la huella avisa que hay que mirarlo, no dice si quedó bien.
- La huella de un test de Python es su función: si el test depende de un helper o una fixture que cambió, la corrida sigue contando.
- «Construida» confía en el `Status` de la spec o en las tasks marcadas: si alguien marca hecho algo que no lo está, el ledger lo cree.
- El historial lee el `spec.md` de cada commit: un requisito renumerado aparece como uno quitado y otro agregado.
- En este repo, las citas de los tests anteriores a la spec 028 se agregaron después, revisando que cada test compruebe la regla **entera**; las que
  sólo comprobaban una parte se sacaron. Lo que queda «construida sin test» (sobre todo reglas de la interfaz web, que se prueban con scripts de
  navegador y no con pytest) es trabajo pendiente a la vista, no un error.
