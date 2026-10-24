# 40 · ¿Producto viene a Speco antes que a Claude Code? El experimento (2026-10-24)

> Tesis para la hackathon: Speco es **«Cursor para producto»**: el lugar donde producto comprueba que las reglas se cumplen, que no hay
> regresiones de intención, y decide qué construir. Para que producto venga **antes** que a Claude Code, Speco tiene que dar algo que Claude Code no da.
> Esto es la prueba, con datos, de cuánto de eso es cierto hoy y qué se construyó para cerrar lo que no.

## Diseño

Una regresión de negocio realista, plantada como commit de otra persona («Dev Growth»): el tope mensual de referidos premiados pasa de **10** a **25**
en la migración, y la spec sigue diciendo 10 (`021/FR-008`; `021/SC-003` «nunca más de 200 créditos» deja de cumplirse). Los tests cloud lo
detectan (2 fallan). Cuatro preguntas de una PM, respondidas por dos brazos sobre el mismo commit:

- **Speco**: sólo lo que ve producto (MCP `what_it_does` / `get_intent` / `intent_history` / `change_requirement`), sin correr tests.
- **Claude Code solo**: un agente sin Speco (sin MCP, sin CLI, sin `.specreview/`); puede leer todo y correr tests.

## Resultado 1: antes de este cambio, la tesis **no** se sostenía

| Pregunta de la PM | Speco (antes) | Claude Code solo (92 s · 14 herramientas · ~89k tokens) |
|---|---|---|
| P1 ¿El tope es el que decidimos? | ✗ «verificada» | ✓ 25 vs 10, archivo y línea |
| P2 ¿Algo roto? ¿Quién lo cambió? | ✗ 0 rotas | ✓ SC-003 rota, `bba07bc` de Dev Growth; además marcó una posible discrepancia (24 h vs 30 días) |
| P3 Subir la recompensa 20 → 30: ¿qué toca? | ✗ «ready», 0 hallazgos | ✓ SC-003 (10 × 30 = 300 > 200), costo (D-014/G-14), docs |
| P4 ¿Qué reglas no tienen prueba? | ✓ instantáneo, determinista | ~ correcto, a mano |

Por qué falló Speco:
1. **Una verificación cuenta para el texto de la regla, no para el código.** La última corrida (commit `fdcff05`) seguía valiendo después del commit que rompió la regla.
2. **El test no prueba el número.** El test de `021/FR-008` fija el tope en 2 para probar el mecanismo: pasa con 10 y con 25. «Verificada» decía algo sobre el mecanismo, nada sobre lo que decidió producto.
3. **Un PR que sólo cambia código** recibía «no cambia ninguna spec: no hay intención que revisar».
4. Bonus: `--verify` sin `pytest` instalado registró la regla como **ROTA** por un error del entorno (`TODO.md` T-027).

## Resultado 2: Claude Code, en rol de dev, también se frena

Mismo repo, pedido de un dev: «Subí el tope mensual de referidos a 25. Es un cambio de config». El agente (sin Speco) encontró FR-008, SC-003 y
el razonamiento de costo, **no cambió nada** y devolvió la decisión como pregunta (25 s, 5 herramientas). Matices: el `CLAUDE.md` del repo (que
escribe `specreview init`) le dice que las decisiones de producto se devuelven como pregunta; las specs de este repo son excelentes; N = 1.

**Lo que esto cambia en el pitch:** no se puede decir «el agente no se da cuenta». Lo que sí se sostiene:
- El aviso le llega **al dev**, en su sesión. Producto nunca se entera, y nada impide que el dev diga «hacelo igual».
- No cubre los cambios que no pasan por ese agente: una persona, otra herramienta, un hotfix.
- No queda registro: el primer brazo lo dijo solo, «no sé si alguien lo aprobó».

## Lo que se construyó: spec 029, «números decididos»

Un número que decidió producto se vincula a la línea de código que lo guarda (`[values]` en `specreview.toml`) y se comprueba **cada vez que se
arma el ledger, sin correr tests** (detalle en `docs/39`):

- Ledger, MCP y app: la regla pasa a **rota** con «la regla dice 10; `…referrals.sql:5` tiene 25 · cambiado en `7de85f8` por Dev Growth el 2026-10-24».
  La página «El qué» abre con un recuadro *«Lo que decidiste y el software ya no hace»*.
- PR (`specreview diff` y el bot de GitHub): «⚠️ Esta PR mueve un número que decidió producto», aunque el PR no toque ninguna spec.
- `change_requirement` devuelve `touches`: el `referral_reward` del código y `SC-003` («nunca más de 200»).
- Cada regla dice hace cuántos commits fue su última corrida.

## Resultado 3: después

| Pregunta | Speco (después) | Claude Code solo |
|---|---|---|
| P1 | ✓ 2,7 s · 0 tokens · sin preguntar | ✓ 92 s · ~89k tokens · hay que saber qué preguntar |
| P2 | ◐ FR-008 rota con commit y autor ✓; SC-003 (200 = 10 × 20, derivado) sólo con `--verify` | ✓ |
| P3 | ◐ binding + SC-003 + SC-002; **no** razona costo ni abuso | ✓ más completo |
| P4 | ✓ | ~ |
| **PR que mueve el número** | ✓ comentario en el PR, sin que nadie pregunte | ✗ sólo si alguien se lo pide |
| **Registro de quién decidió** | ✓ (aprobaciones encadenadas) | ✗ |

Mismo resultado en tres corridas (SC-002 de la spec 029). Sin modelo. 645 tests pasan.

## Veredicto

- **Probado:** «verificar que las reglas se cumplen» y «sin regresiones» para los **números decididos**: Speco lo dice antes de que alguien pregunte, en el
  ledger y en el PR, determinista y sin costo, con quién lo cambió. Es lo que Claude Code no hace solo: **no mira cuando nadie le pregunta.**
- **No probado (todavía):** que Speco sea mejor que Claude Code **respondiendo** preguntas abiertas de producto (P3). No lo es: Claude Code razona costo,
  abuso y documentos; Speco lista vínculos. Para eso Speco tiene que **darle el contexto a Claude**, no competir con él.
- **Corrección de la frase del pitch:** de «producto viene a Speco antes que a Claude Code» a **«Speco le avisa a producto antes de que nadie le pregunte
  a Claude Code»**. Producto viene a Speco porque Speco **lo llama** (PR, recuadro, Slack), y la conversación sigue con Claude sobre un registro confiable.

## Otras apuestas, en orden

| # | Apuesta | Por qué | Costo |
|---|---|---|---|
| 1 | **Proponer las vinculaciones** (`TODO.md` T-028) | El costo de entrada de la 029: nadie vincula 400 reglas a mano. ~1 de cada 4 reglas tiene un número | S |
| 2 | **Verificación continua** con una corrida de la suite (T-029) | Cierra P2 entero (números derivados) y hace que «verificada» signifique «en este commit» | M |
| 3 | **El aviso va a producto, no al dev**: el PR que mueve un número abre el check «Speco · decisión» (spec 027) y avisa por Slack a quien aprobó la regla | Convierte el hallazgo en una decisión registrada: el único lugar donde un agente no compite | M |
| 4 | **Guardar el número en la decisión** (`product/decisions.md` hoy sólo tiene títulos) | Los dos agentes lo notaron: «la decisión no fija el monto». Sin eso no hay «qué decidimos» confiable | S |
| 5 | **Speco como contexto de Claude para P3**: `change_requirement` le pasa `touches` + decisiones + costos al asistente | Speco no gana razonando; gana dando a Claude el grafo correcto (`docs/31` §4, «impacto de un cambio») | M |
| 6 | Repetir el experimento con N ≥ 10, otro repo, y un agente **sin** el `CLAUDE.md` de Speco | N = 1 y un repo excepcionalmente bien especificado sesgan a favor de Claude Code | S |

## Segunda ronda (mismo día): las apuestas, construidas

| # | Apuesta | Estado | Dónde |
|---|---|---|---|
| 1 | Proponer las vinculaciones | ✅ `--suggest-values` y MCP `suggest_values`; encuentra las 4 de referidos y propone otras (p. ej. `welcome_credits` 20 → `020/FR-001`) | spec 030 |
| 2 | Verificación continua | ✅ `--verify-all` / `--junit`: una corrida de la suite registra todas las reglas en el commit actual (671 tests → 240 reglas, 2,7 s la importación); CI nombra en su resumen las reglas que rompe una corrida | spec 030 |
| — | Error del entorno ≠ regla rota | ✅ una corrida sin tests queda como `error` y no cambia el estado | spec 030 |
| 3 | El aviso va a quien decide | ✅ en un repo que la empresa lee, un PR que **sólo** mueve un número decidido deja el check «Speco · decisión» pendiente y lleva a decidir esa versión (con `values.md`) | spec 031 |
| 4 | El número en la decisión | ✅ `**Fixes**: 021/FR-008 = 10` en D-015; una spec que dice otro número es `PRD007` y va a una persona | spec 031 |
| 5 | Speco como contexto de Claude | ◐ `change_requirement` devuelve las decisiones y reglas que toca; no razona costo (eso sigue siendo de Claude) | spec 031 |
| 6 | Repetir el control del dev sin las instrucciones de Speco | ◐ N = 3, abajo | — |

### Control del dev sin `CLAUDE.md`, sin MCP y sin configuración de Speco (N = 3)

Tres copias del repo sin `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `specreview.toml` ni `.specreview/`. Mismo pedido («subí el tope a 25, es config»).
**Las tres veces el agente no cambió nada** y devolvió la decisión como pregunta, citando FR-008, SC-003 y D-015 (≈ 28 s y 5 herramientas cada una).

Sesgo a declarar: este repo describe **este mismo ejemplo** en la spec 029 y en `docs/39`; dos de las tres corridas lo citaron. Y las specs de
este repo son de una calidad poco común. Para separar el efecto falta repetirlo en un repo ajeno, sin el ejemplo escrito.

**Lo que esto confirma:** cuando las specs viven en el repo, Claude Code es un buen guardián **del dev, cuando el dev se lo pide**. El valor de Speco
no es reemplazar esa pregunta, sino lo que pasa alrededor de ella: el dev puede contestarse «sí, hacelo» y ninguna persona de producto se entera;
un cambio que no pasa por un agente (una persona, otra herramienta, un `UPDATE` en producción, como sugirió una de las corridas) no tiene a nadie
mirando; y la respuesta queda en un chat, no en un registro. Speco pone el check en el PR, la decisión en el registro y el aviso en el ledger.

## Qué no decir

- «Claude Code no detecta el cambio.» Lo detectó, como analista y como dev.
- «Speco detecta cualquier regresión.» Detecta números vinculados; lo derivado, sólo corriendo tests.
- Cualquier cifra de ahorro: no se midió costo de retrabajo.
