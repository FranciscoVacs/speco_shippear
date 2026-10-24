# 16 · La tesis (fuente única del mensaje)

> Todo texto del producto que explique **por qué existe Speco** (onboarding, guía, estados vacíos, tours, README, pitch) sale de acá.
> Si el mensaje cambia, cambia este archivo primero y las superficies lo siguen (tabla de la sección 5).

## 1. La tesis en una línea

**Con agentes escribiendo el código, lo caro dejó de ser construir y pasó a ser decidir qué construir y mantenerlo coherente.
Speco es la capa donde esa decisión vive, se revisa y se verifica: el Cursor para el negocio.**

Para quién: gerencias y product owners. No para quien programa (a esa persona la sirve el código y su editor; Speco le da algo que
construir con certeza).

**Dos puertas, un producto** (`D-010`, spec 016):
- **Ya tengo software:** una empresa con código existente. Conecta GitHub, ve el *retrato inicial* de lo que su software hace hoy, confirma las reglas y congela la línea base (specs 013-015).
- **Tengo una idea y todavía no tengo código:** alguien que está *vibecodeando* con una herramienta de IA y no es técnico. Cuenta lo que quiere con sus palabras, Speco le pregunta lo que importa, queda guardado como su spec (sin repositorio) y se lleva un *brief* para pegar en su herramienta. Cuando aparece código, Speco lo compara con lo que decidió.
Es la misma tesis para quien más la necesita: si el agente va a escribir el código, que no adivine lo que nadie decidió.

## 2. El argumento, en cuatro pasos

1. **El cuello de botella se movió.** Antes costaba el *cómo* (implementar). Con agentes, implementar es barato y rápido.
2. **Entonces el riesgo está en el *qué*.** Decidir qué construir, y que lo decidido siga siendo cierto semana a semana.
3. **Eso se rompe de una forma concreta: el slop.** Cambios que nadie decidió pero que el código ya tiene. Tres formas:
   - una regla de negocio implícita cambia de un día para otro sin que nadie la haya decidido;
   - un cambio se aprueba mirando código, no intención;
   - la intención está desperdigada (chat, tickets, cabezas) y no hay un lugar donde se verifique.
4. **La respuesta es una capa por encima del código.** Si el código es una herramienta más, el valor está en la abstracción que lo
   gobierna: la **spec** como lugar donde la intención vive y se verifica.

## 3. Las tres garantías (lo que Speco promete)

| # | Garantía | En palabras de quien aprueba | Cobertura hoy |
|---|---|---|---|
| 1 | **Las reglas de negocio no cambian sin una decisión** | «Nada de lo que decidimos se pisa en silencio» | **Parcial.** Hoy: contradicciones entre requisitos y contra lo ya decidido (`product/decisions.md`, `PRD001-005`). **Falta** detectar reglas implícitas que ya viven *solo* en el código. |
| 2 | **Los cambios se revisan como intención, no como código** | «Veo qué cambia en el negocio, no qué líneas cambiaron» | **Sí.** Veredicto por feature, «Tu turno», resumen ejecutivo, `--diff` en el PR. |
| 3 | **La spec es el lugar donde la intención vive y se verifica** | «Si no está en la spec, no está decidido» | **Sí.** Revisión de spec/plan/tasks antes de implementar, criterios de aceptación, aprobaciones auditables. |

Regla de honestidad: **ninguna superficie afirma una garantía por encima de su columna «Cobertura hoy».** La 1 se comunica como
«lo decidido no se pisa» (lo que ya hacemos), nunca como «detectamos cualquier cambio de comportamiento».

## 4. Vocabulario (una palabra por concepto)

| Usar | En vez de | Por qué |
|---|---|---|
| **Intención** / «lo que decidimos» | requisito, FR | El requisito es la forma técnica; la intención es lo que importa a gerencia |
| **Decisión** | hallazgo, finding | Un hallazgo se arregla; una decisión se toma. Los hallazgos viven en el *Detalle técnico* |
| **Slop** (con una frase que lo defina la primera vez) | drift, deuda de spec | Una sola palabra, memorable, que el equipo pueda repetir |
| **Spec** | documento, ticket | Es *el* lugar de la intención |
| **Tu turno** | pendientes | Marca quién espera a quién |
| **Lista para construir** | aprobada sin más | El agente puede implementar sin adivinar |

Los términos técnicos (EARS, reglas `COV001`, `--llm`) no desaparecen: pasan a «Cómo funciona por dentro», un clic más abajo
(`D-006`, simple por defecto).

## 5. Cómo se ve en cada superficie

| Superficie | Qué comunica | Forma |
|---|---|---|
| **Estado vacío del Inicio** | Qué puede preguntarle quien aprueba | Pregunta de negocio («¿Qué espera mi decisión?»), no «¿Qué querés revisar?» |
| **Onboarding (4 pasos)** | 1 El cuello de botella se movió · 2 Qué es el slop · 3 Las tres garantías · 4 Tu primer minuto | Máximo 1 idea por paso; el último lleva a *Decisiones* |
| **Guía → «Qué es»** | La tesis completa con el argumento de la sección 2 | Lo técnico va en «Cómo funciona por dentro» |
| **Decisiones / Tu turno** | Garantías 2 y 3 en acción | Lenguaje de decisión, no de regla |
| **Resumen ejecutivo** | «Lista para construir» = el agente no va a adivinar | Una frase + qué se arriesga |
| **Aprobaciones** | Garantía 3: la decisión queda registrada y auditable | «Quién decidió qué, cuándo» |
| **README / pitch** | La tesis en una línea + las 3 garantías | Primer párrafo = sección 1 |

### Product tour (propuesto, no implementado)
Mismo hilo que el onboarding pero sobre la UI real, 4 paradas con la demo cargada: **Inicio** (preguntale al agente) →
**Decisiones / Tu turno** (esto espera tu decisión: garantía 2) → **Resumen ejecutivo** (lista para construir o no: garantía 3) →
**Aprobaciones** (queda registrado). Se dispara una vez y se reabre desde *Ayuda*.

## 6. Qué falta para sostener la tesis completa
- **Garantía 1 completa:** extraer reglas de negocio implícitas del código y compararlas con la spec (hoy solo spec ↔ spec ↔ decisiones).
- **Pasar de «revisar una spec» a «gobernar la intención en el tiempo»:** 🟡 desde la spec 028 cada regla tiene su historial (versiones en git, quién la aprobó, cambios propuestos por agentes con motivo, verificaciones) en el **registro del qué** (`docs/39`). Falta: que el historial viva también en la versión cloud.
- **Intención verificada (§6 bis):** de las reglas aprobadas a propiedades que se comprueban sobre el código. Primer escalón 🟡: trazabilidad regla → test → corrida registrada (`docs/39`, el paso 3 de `docs/37` §7). Lo demás ⬜; sigue contar cuántos requisitos son invariantes.
- Un objetivo de producto para esto (hoy `G-1…G-6` hablan de la herramienta, no de la tesis) y su decisión (`D-007`).

## 6 bis. Hacia dónde va la tesis: del «qué construir» al «probar que se construyó»
Decidir y mantener lo decidido es el primer tramo. El segundo, que **hoy no existe**, es poder **probar** que el código cumple lo que se decidió: que haya evidencia
verificable, y en las reglas críticas una demostración formal, de que lo construido es lo que se había pedido. Speco no reemplaza a un verificador: es la capa
previa que asegura que la regla a probar sea la correcta, revisada y aprobada por una persona. Detalle, límites y plan: [`docs/37`](37-verified-intent.md); decisión propuesta `D-019`.

**Fuente primaria del marco teórico:** Anthropic + Theorem, *«LLMs are making formal software verification feasible at a much larger scale»* (22-oct-2026, <https://www.anthropic.com/research/formal-verification>).
Probar que el código cumple una spec ya se automatiza a escala; según el mismo post, el obstáculo es conseguir «a comprehensive and unambiguous spec», y «a proof checker can't tell you whether your spec matches reality».
Toda narrativa sobre este tramo parte de ahí (`docs/37` §6.1). Citas y salvedades: `company/positioning/EVIDENCIA_DEL_PROBLEMA.md`.

Cómo se dice: *hoy* revisamos que lo decidido sea coherente antes de construir; *hacia dónde vamos* es probar que el código lo cumple. Nunca «probamos» en presente.

## 7. Apuestas siguientes (specs 016-018)
| Apuesta | Qué dice | Spec | Decisión |
|---|---|---|---|
| Dos puertas | Onboarding para empresas con software y para quien no tiene código | 016 | `D-010` |
| Teléfono verificado | Todo usuario es una persona real: registro por SMS (Supabase), sin emails falsos | 017 | `D-011` |
| Speco sobre Speco | Nuestro repo es la primera empresa conectada; MCP remoto con OAuth; los agentes leen y proponen, nunca deciden | 018 | `D-012` |
