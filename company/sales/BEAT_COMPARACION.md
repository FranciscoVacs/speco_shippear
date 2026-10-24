# Beat: «¿Por qué no le pregunto directo a Claude Code?»

La pregunta que va a hacer un comprador, un VP o un inversor. Este beat la contesta con datos del experimento del 2026-10-21 (`../positioning/EXPERIMENTO_RETRABAJO.md`), no con un argumento.
Dura **45 segundos**. Entra en la demo entre el beat 5 y el 6 de `DEMO_HACKATHON.md`, o se usa suelto como respuesta a la pregunta.
La lámina para proyectar es `beat-comparacion.html` (funciona sin internet; sin las tipografías web usa las del sistema).

## La respuesta en una frase

> **Claude puede opinar. Speco hace que decida una persona y que quede registrado.**

Claude Code **actúa**. Speco **controla** lo que actuó: es un juez aparte del agente, que da siempre el mismo resultado, y deja un registro de quién decidió qué.

## Lo que muestra el experimento

Spec bancaria con una contradicción (FR-003 dice 5,000 USD y FR-004 dice 10,000 USD para tier 1). Tres corridas de un agente sin revisión (`claude-sonnet-5-5`).

- **Decidió solo, las tres veces.** Eligió 5,000, dejó afuera la regla de fraude (FR-007) y «revisar rápido» (FR-008), y dejó afuera la retención de auditoría (FR-011).
- **Lo avisó.** Fue honesto: lo dijo en la sección «Assumptions» de su último mensaje. El problema no es que lo oculte; es **dónde** lo dice, **quién** decidió, y que **no queda registro ni aprobación**.
- **Acertó el límite.** Las tres veces. La contradicción era fácil de desempatar.
- **Speco lo había marcado antes de que corriera cualquier agente:** `CON001`, `COV001`, `QUA001`, `QUA002`, `QUA006`, `COV002`. De 5 decisiones que el agente tomó solo, 4 estaban marcadas y 1 a medias (no detecta la contradicción *interna* de FR-011).

## Guion (45 s)

| Tiempo | Qué se dice | Qué hay en pantalla |
|---|---|---|
| 0:00–0:10 | «Siempre alguien pregunta: ¿para qué Speco, si le pido a Claude Code que revise la spec? Hicimos la prueba.» | La lámina, titular. |
| 0:10–0:25 | «Le dimos a un agente una spec bancaria con una contradicción. Las tres veces eligió solo cuál límite valía y dejó afuera la regla de fraude por "vaga". Lo avisó, hay que reconocerlo: en el último párrafo. Esta vez acertó. **Pero lo decidió el agente.**» | Columna izquierda, las citas. |
| 0:25–0:35 | «Speco había marcado cada una de esas decisiones **antes** de que arrancara ningún agente: la contradicción, el requisito que nadie implementa, el que no se puede testear. Sin modelo, en dos décimas de segundo.» | Columna derecha y la tabla. |
| 0:35–0:45 | «Claude puede opinar. Speco hace que **decida una persona** y que quede registrado: quién, cuándo y sobre qué versión.» | El cierre de la lámina. |

### Prueba en vivo opcional (10 s, terminal)

Muestra que Speco da **el mismo resultado cada vez**, que un prompt no garantiza:

```bash
for i in 1 2 3; do specreview examples/wire-transfers -f json | md5sum; done
```

Salen tres hashes idénticos (verificado el 2026-10-24: `8db12862966256d249cbcaf255843666` las tres veces). Se dice: «Tres corridas, el mismo resultado, byte por byte.»

## Por perfil

| Quién pregunta | Respuesta corta |
|---|---|
| **Comprador o VP** | «¿Quién aprobó el cambio de ese límite, y qué versión vio cuando lo aprobó? Con un prompt no hay respuesta. Con Speco es una consulta.» |
| **Inversor** | «El análisis se abarata cada trimestre: lo van a hacer mejor los modelos. Lo defendible es el registro de las decisiones y que el juez no sea el mismo agente que escribió el código. Es la razón por la que existe el control de cambios aunque el contador sepa sumar.» |
| **Desarrollador** | «Si programás solo, no lo necesitás. Es para cuando quien decide no es quien programa, y alguien tiene que responder por lo decidido.» |

## Lo que NO se dice

- **«Claude dio tres respuestas distintas.»** Es falso: eligió el mismo límite las tres veces. Varió el motivo y lo que dejó afuera, no la decisión. Que otra corrida eligiera 10,000 **no se probó** (N = 3).
- **«Claude esconde sus decisiones.»** No las esconde: las lista.
- **Cualquier ahorro de tokens, costo o retrabajo.** Se midió y no hubo diferencia (−2,7 % de costo, dentro del ruido).
- **«Speco detecta cualquier contradicción.»** Detectó la de FR-003 y FR-004; no la que está *dentro* de FR-011.
- **«Un banco ya lo usa.»** No hay clientes.

## Si preguntan lo difícil

| Pregunta | Respuesta |
|---|---|
| «Pero Claude Code también podría hacer esa revisión con un prompt.» | «Puede opinar, sí. Lo que no tiene es independencia (el que escribe no se califica), repetibilidad, ni un registro que un auditor pueda verificar.» |
| «¿Y si GitHub o Anthropic lo agregan?» | «El análisis lo van a agregar. El registro de decisiones de una empresa, con sus aprobaciones, es otro producto, y es lo que hoy construimos. **[DECIDIR]** cuánto de eso mostrar: en la nube recién empieza (`docs/38`).» |
| «Tres corridas no es nada.» | «Es verdad: 3 corridas, un modelo, una feature. Es una señal, no una estadística. Los detalles están en `EXPERIMENTO_RETRABAJO.md`, incluida la lista de lo que podría invalidarlo.» |
| «¿Por qué acertó, entonces?» | «Porque la contradicción era fácil de desempatar. No sabemos qué pasa cuando no lo es: es la próxima prueba.» |

## Plan B

Si no anda la pantalla, el mismo contenido está en `EXPERIMENTO_RETRABAJO.md` (las dos tablas). Si no hay internet, la lámina local y `specreview examples/wire-transfers` funcionan sin red.
