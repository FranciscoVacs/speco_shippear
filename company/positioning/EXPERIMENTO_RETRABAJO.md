# Experimento: ¿una spec revisada ahorra retrabajo a un agente?

**Resultado (2026-10-21): no hubo diferencia medible.** Con esta tarea, la spec revisada no ahorró tokens, costo ni turnos, y no evitó retrabajo: ninguna corrida lo necesitó.
**Lo que sí mostró:** sin revisión, el agente **tomó solo decisiones de negocio** que nadie aprobó, y las avisó únicamente en su mensaje final.
Material para repetirlo: `experimento-retrabajo/`.

## Pregunta

¿Un agente de código llega al comportamiento **correcto** con menos trabajo total cuando la spec se revisó antes, que cuando se le dejan los bloqueantes?

## Diseño

- **Feature:** `examples/wire-transfers` (límites de transferencias y revisión de fraude).
- **A, sin revisar:** la spec como está. `specreview` encuentra 2 bloqueantes (`experimento-retrabajo/specreview_A.txt`):
  - `CON001`: el límite de tier 1 es 5,000 en FR-003 y 10,000 en FR-004;
  - `COV001`: FR-007 («manejar transferencias sospechosas») es vago y nadie lo implementa.
- **B, revisada:** cada hallazgo resuelto con una decisión de producto fijada de antemano. La revisión encontró además que FR-008 no tenía tarea, y se agregó T009. Resultado: 0 bloqueantes (`specreview_B.txt`, `specs_B/`).
- **Igual en las dos:**
  - modelo `claude-sonnet-5-5` con Claude Code 2.1.306 en modo no interactivo;
  - aislado de la configuración del usuario (`--safe-mode --strict-mcp-config`);
  - el mismo prompt (`prompt.txt`) y una interfaz fija en Python (`fee`, `daily_limit`, `check_wire`, `refund`);
  - el agente no puede preguntar y lista sus supuestos.
- **Medición:** 10 tests de aceptación ocultos (`test_hidden.py`), escritos con las decisiones de B. Si una corrida fallaba, se le pasaban las decisiones (`rework.txt`) y se medía la corrección.
- **N:** 3 corridas por condición, en pares en paralelo. Costo total: unos 0,55 USD.

## Resultados

| Condición | Costo medio (USD) | Turnos | Duración (s) | Tokens de salida | Tests ocultos | Rondas |
|---|---|---|---|---|---|---|
| A, sin revisar | 0,089 | 9,3 | 30,2 | 3.646 | 10/10 en las 3 | 1 |
| B, revisada | 0,087 | 9,3 | 31,1 | 3.428 | 10/10 en las 3 | 1 |
| B frente a A | −2,7 % | 0 % | +2,8 % | −6 % | — | — |

Rangos por corrida: A de 0,084 a 0,097 USD; B de 0,082 a 0,092 USD. **La diferencia es ruido.**

### Lo que hizo el agente sin revisión (A1, A2 y A3)

Los mensajes completos están en `final_A*.md`.

| Corrida | El límite de tier 1 | FR-007 (fraude) | FR-011 (auditoría) |
|---|---|---|---|
| A1 | Eligió 5,000: FR-004 «parece una edición suelta» | Lo ignoró: «no se puede testear» | — |
| A2 | Eligió 5,000 | Lo ignoró: «no se puede testear» | Lo dejó afuera: «se contradice» |
| A3 | Eligió 5,000 | Lo dejó afuera: «demasiado vago» | Lo dejó afuera: «se contradice» |

- **Acertó el límite las tres veces,** porque la contradicción era fácil de desempatar: FR-003 cubre los dos tiers, y el 10,000 de FR-004 coincide con el umbral de revisión.
- **Decidió solo** qué valor valía y qué requisitos no construir. Lo dijo **una vez, al final**, en un mensaje que con agentes en paralelo nadie lee.
- **Salvedad:** las corridas de B tampoco implementaron el bloqueo por fraude, aunque estaba decidido. La interfaz fija no tenía una entrada para eso. Esa omisión no se puede atribuir a la falta de revisión.

### Lo que el agente decidió solo frente a lo que Speco marcó antes

`specreview` corrió sobre la spec A **antes** de que empezara cualquier agente (`specreview_A.txt`). Casi cada decisión que los agentes tomaron por su cuenta coincide con un hallazgo previo:

| Lo que el agente decidió solo | Corridas | ¿Speco lo había marcado antes? |
|---|---|---|
| Que el límite de tier 1 es 5,000 y no 10,000 («parece una edición suelta») | 3 de 3 | **Sí, bloqueante:** `CON001` FR-003 y FR-004 se contradicen |
| No construir la regla de fraude (FR-007), por «vaga» | 3 de 3 | **Sí, bloqueante:** `COV001` «nadie lo va a implementar». Además `QUA001` (ambiguo) y `QUA006` (sin criterio de aceptación) |
| No construir «revisar rápido» (FR-008) | 3 de 3 | **Sí, advertencia:** `QUA002` «no es testeable» |
| No construir el resumen semanal (T007) | 1 de 3 | **Sí, advertencia:** `COV002` «no responde a ningún requisito» |
| No construir la retención de auditoría (FR-011), porque «se contradice» | 2 de 3 | **A medias:** `QUA006` dijo que le faltaba criterio de aceptación. **No detectó** la contradicción interna (guardar 5 años frente a borrar a pedido) |

Algunas omisiones (FR-006, la cola de revisión, el reembolso como proceso) vienen de la interfaz fija, que pedía solo cuatro funciones. No son ambigüedad de la spec y no están en la tabla.

**Lectura para el dueño del negocio:** Speco no hizo al agente más barato ni más correcto en esta tarea. **Mostró, antes del código, casi todos los lugares donde el agente iba a decidir por el negocio.** Sin Speco, eso aparece en el último párrafo de cada respuesta, o en producción.

**Mejora del motor:** detectar contradicciones **dentro** de un mismo requisito (FR-011: «MUST keep … 5 years and allow its deletion»). Hoy `CON001` compara pares de requisitos.

## Qué significa para el mensaje

1. **No hay número de ahorro.** «Una spec revisada ahorra X % de tokens» **no se dice**: lo medimos y no apareció. Ver `AFIRMACIONES.md`.
2. **Los tokens no son el argumento.** El agente moderno desempata bien una contradicción obvia, y lo hace barato.
3. **El argumento que sí tiene evidencia es el de gobierno:** el agente **decide reglas de negocio por su cuenta**, aunque acierte. En un banco, «el agente eligió el límite y decidió no construir la regla de fraude» es el problema, no la solución. Speco hace que esas decisiones las tome una persona, antes del código, y que queden registradas.

Frase que se puede decir, con su salvedad:
> «Le dimos a un agente una spec bancaria con una contradicción. Las tres veces eligió solo cuál límite valía, y las tres veces dejó afuera el requisito de fraude por "vago". Lo avisó en el último párrafo de su respuesta. Esta vez acertó el límite. Nadie lo decidió.»
*(3 corridas, un modelo, una feature.)*

## Amenazas a la validez

- N = 3 por condición. Que no haya fallas en 3 corridas es compatible con una tasa real de error de hasta ~60 %.
- Una sola feature, un solo modelo.
- La contradicción era fácil de resolver.
- La interfaz fija escondía FR-007, FR-008 y FR-011: resolverlos no podía cambiar el resultado de los tests.
- Los tests salen de las decisiones de B, lo que favorece a B. A pasó todo igual.
- Hubo rechazos de permisos en ambas condiciones (A2, A3 y B2), y los agentes se recuperaron solos.
- Las corridas en pares pueden sumar ruido de carga a la duración.
- **Es un resultado nulo para esta tarea; no prueba que revisar nunca ayude.**

## Si se quiere volver a medir

Para no diseñar un experimento que gane B por construcción, conviene cambiar las condiciones, no el objetivo:
- **Contradicciones sin desempate obvio:** que ningún requisito sea «más completo» que el otro.
- **Una decisión correcta que no sea la más probable:** por ejemplo, que producto haya decidido el valor menos común.
- **Sin interfaz fija:** que el agente diseñe la API desde la spec, como en un proyecto real.
- **Varias features y más corridas** (N ≥ 10), con dos modelos.
- **Medir la omisión silenciosa:** cuántos requisitos quedan sin construir y si alguien se entera antes del merge.

`run.sh` tiene rutas de la máquina donde se corrió. Hay que ajustarlas para repetirlo.
Los agentes corren con permiso para editar archivos y ejecutar `python -m pytest`, y eso alcanza para ejecutar código. Por eso, para repetirlo, **conviene correrlo en un contenedor o una VM sin credenciales del host**.
La corrida original usó un permiso más amplio (`Bash(python:*)`), en carpetas temporales. El script versionado ya lo tiene acotado.
