# Boceto del pitch: hackatón del sábado 2026-10-24

**Estado: boceto.** Arma el pitch alrededor de la propuesta de valor (`../positioning/PROPUESTA_DE_VALOR.md`).
La demo en vivo y su checklist están en `DEMO_HACKATHON.md`; este archivo es lo que se **dice**. Las otras versiones (30 s, 2 min, 5 min) y las objeciones, en `PITCH_Y_OBJECIONES.md`.
Nada se dice si no está en `../positioning/AFIRMACIONES.md`. Lo pendiente va marcado.

**Duración objetivo:** 3 minutos **[DECIDIR]** según el formato del hackatón.
**Una idea para que se lleven:** *podá en la spec, no en el código.*

---

## 0:00 – 0:25 · El cambio de época

> «Hoy cualquiera puede construir cualquier idea. Un agente escribe en una tarde lo que a un equipo le llevaba un mes.
> Construir dejó de ser caro. Lo caro ahora es **construir lo equivocado**: después hay que encontrarlo, revisarlo y podarlo.»

*Pantalla:* una sola frase. «Construir es barato. Construir lo equivocado, no.»

Refuerzo opcional (10-15 s). Fuente y salvedades en `../positioning/EVIDENCIA_DEL_PROBLEMA.md` §6:

> «No es una predicción. Anthropic pasó de 2.500 a más de 30.000 cambios mergeados por día en cuatro meses, y tuvo que dejar git. Lo que cuentan: el trabajo de los ingenieros pasó a ser *"to tell Claude 'no'"*, y revisan *"the intent of the change"* en vez de cada línea.»

*Pantalla:* «2.500 → 30.000 merges/día · Anthropic, 13-oct-2026».

## 0:25 – 0:55 · El problema, con nombre y apellido

> «Imaginen un banco. Quiere usar agentes, y su gente está a favor. Pero tiene cientos de reglas de negocio: límites, comisiones, plazos, fraude.
> Si un agente cambia una sola de esas reglas sin que nadie lo decida, es un incidente. Y nadie lee todos los diffs.
> Por eso los bancos no dejan entrar a los agentes. No es un tema de velocidad: es que **no pueden controlar ni auditar lo que cambia**.»

*Pantalla:* «¿Quién decidió que el límite ahora es 15.000?»

Refuerzo opcional (10 s, si el formato da; si no, va en preguntas). Evidencia y salvedades en `../positioning/EVIDENCIA_DEL_PROBLEMA.md`:

> «Esta semana salieron 53 vulnerabilidades de Java en un solo día, un récord en más de diez años. Y Anthropic y Theorem probaron formalmente más de cien librerías open source en unas semanas. Probar que el código cumple una spec ya lo hace una IA. Y el mismo paper lo dice: *"a proof checker can't tell you whether your spec matches reality"*. El cuello de botella es la spec.»

*Pantalla:* la cita, con «Anthropic, 22-oct-2026» debajo.

## 0:55 – 1:50 · La demo (ver `DEMO_HACKATHON.md`)

> «Esto es una spec de un banco: límites de transferencias y revisión de fraude. Un agente abre una PR que cambia **una línea**: el umbral de revisión manual pasa de 10,000 a 15,000 dólares.
> Para un revisor de código, eso no es nada. Esto es lo que ve Speco.»

*Pantalla:* el comentario de Speco en la PR. Leer en voz alta tres cosas:
1. «FR-005 cambió: **10,000 → 15,000 USD**.» Qué cambia en el negocio, no en el código.
2. «⚠️ **`T004` todavía dice 10,000**.» **El agente iba a construir la regla vieja.** Nadie lo hubiera visto en el diff.
3. «**Espera una decisión.**» No la toma la IA: la toma una persona, y queda registrada.

> «Esto pasó antes de que exista una sola línea de código. Corregirlo acá cuesta un minuto. En producción, en un banco, cuesta un incidente.»

## 1:50 – 2:20 · Qué es Speco

> «Speco no reemplaza a Spec Kit, el estándar de GitHub para escribir specs: corre sobre él.
> **Spec Kit es como git. Speco es como la revisión de PRs y las ramas protegidas, pero para el negocio.**
> Ningún cambio de regla llega al código sin que alguien lo vea, lo decida y quede registrado.»

Respaldo (no se lee; se tiene a mano para preguntas):
- Motor determinista: el mismo resultado cada vez, sin mandar el código a un modelo.
- Aprobaciones con hash encadenado: si la spec cambia después, la aprobación figura como vieja.
- Entra donde ya se trabaja: CLI, MCP en el editor del agente, comentario en la PR.

## 2:20 – 2:40 · Por qué importa: el agente decide solo

> «Hicimos la prueba. Le dimos a un agente esta spec bancaria con una contradicción en el límite.
> Las tres veces eligió solo cuál valía. Las tres veces dejó afuera el requisito de fraude por "vago". Lo avisó en el último párrafo de su respuesta.
> Esta vez acertó el límite. **Pero nadie lo decidió.** Eso es lo que un banco no puede aceptar, y lo que Speco cambia.»

Salvedad que hay que poder decir si preguntan: 3 corridas, un modelo, una feature (`../positioning/EXPERIMENTO_RETRABAJO.md`).
**No decir** que Speco ahorra tokens o retrabajo: lo medimos y no hubo diferencia.

## 2:40 – 3:00 · Visión y cierre con QR

> «Esto es el principio. Lo que Cursor hizo para quien programa, lo hacemos para quien decide qué se construye: el lugar donde la intención se escribe, se revisa y se verifica. **El Cursor para producto.**
> Escaneen esto. En un minuto, desde el celular, cambian una regla del banco y ven a Speco revisarla.
> **Podá en la spec, no en el código.**»

*Pantalla:* el QR grande (`qr-playground.svg`), la URL corta debajo y la frase.

---

## Versión de 60 segundos (pasillo, jurado)

> «Los agentes escriben código rapidísimo; el problema es que también construyen rapidísimo lo equivocado. En un banco, un agente cambia un límite de 10,000 a 15,000 en una línea y nadie lo ve.
> Speco revisa la **intención** antes del código. En cada PR dice qué regla de negocio cambia, qué tarea quedó con el valor viejo y quién tiene que decidirlo. Queda registrado.
> Spec Kit es el formato; nosotros somos el control de cambios del negocio. Es el Cursor para producto. Escaneá el QR y probalo en un minuto.»

## Preguntas que van a venir

| Pregunta | Dónde está la respuesta |
|---|---|
| «¿Esto no lo hace Spec Kit?» | `PITCH_Y_OBJECIONES.md`; detalle en `docs/34` |
| «¿No es CodeRabbit?» | `PITCH_Y_OBJECIONES.md` |
| «¿Tienen clientes? ¿Algún banco?» | Ninguno. Es la hipótesis que vamos a validar (`SEGMENTO_REGULADOS.md`). No decir más |
| «¿Cuánto ahorra?» | «En tokens, nada que hayamos podido medir: los agentes desempatan bien lo obvio. El valor es que las decisiones de negocio las tome una persona y queden registradas.» |
| «¿La verificación formal con IA no los vuelve innecesarios?» | Al revés: Anthropic dice que lo difícil ahora es la spec. Respuesta armada en `../positioning/EVIDENCIA_DEL_PROBLEMA.md` |
| «¿Cómo lo pruebo?» | El QR. Ahora mismo |

## Antes del sábado

- [ ] **[DECIDIR]** comprador principal: banca/fintech, o se mantiene «gerencias y product owners» (`PROPUESTA_DE_VALOR.md` §2.1)
- [x] Resultado del experimento: **no se dice un número** de ahorro; se usa el hallazgo de «el agente decide solo»
- [x] Fuente de «~100 vulnerabilidades críticas de Java, ocultas 17 años»: no existe así. Era PHP2Shell, el miércoles 21, escondida desde 2012 (`../positioning/EVIDENCIA_DEL_PROBLEMA.md` §4)
- [x] Autor del tweet «Anyway, it's Wednesday»: @fiveoutofnine (Daily Caller). Falta el link directo: mostrar captura con el autor (`../positioning/EVIDENCIA_DEL_PROBLEMA.md` §7)
- [x] YC: «Cursor for Product Managers» estaba en la lista de primavera 2026 (fuentes secundarias). Decirlo así, sin cita textual (`../positioning/AFIRMACIONES.md`)
- [ ] Ensayar con cronómetro dos veces; cortar si pasa de 3:10
