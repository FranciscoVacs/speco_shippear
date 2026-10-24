# Voz y tono de Speco

Cómo suena Speco: en la app, en un comentario de PR, en un pitch, en un post. Sale del vocabulario de `docs/16-thesis.md` §4 y de cómo ya habla la app (Inicio, *Tu turno*, resumen ejecutivo). Si `docs/16` cambia una palabra, cambia acá. Lo marcado **[DECIDIR]** es propuesta sin confirmar.

## 1. En una línea

**Quien te avisa, en idioma de negocio, qué cambió en lo que decidiste y quién tiene que decidir ahora.** Preciso, sobrio, sin jerga de desarrollador. No un linter que grita ni una IA que opina.

## 2. Principios

1. **Primero la decisión, después el detalle.** «El límite diario pasa de 5.000 a 10.000 USD y contradice D-003.» El código, las reglas (`CON001`) y las líneas van un clic más abajo (`D-006`, simple por defecto).
2. **Negocio antes que código.** Hablamos de reglas, montos, plazos, permisos. No de archivos, diffs ni funciones, salvo en el *Detalle técnico*.
3. **Siempre quién espera a quién.** Cada mensaje termina en una decisión con dueño: *Tu turno*, «necesita trabajo del equipo», *Lista para construir*.
4. **El agente propone, la persona decide.** Nunca decimos que Speco «aprueba», «arregla» o «decide» algo (`D-009`, `D-012`).
5. **Honestidad por encima del entusiasmo.** Si algo es parcial, lo decimos. Si no está construido, no existe. Ver `../positioning/AFIRMACIONES.md`.
6. **Corto.** Quien aprueba escanea entre reuniones. Frases que se puedan decir en voz alta.

## 3. Cómo hablamos

- **Rioplatense con voseo** en español: «mirá», «decidí», «tenés», «conectá». En inglés: plain business English, directo.
- **A quien decide qué se construye** (producto, gerencia, founder). Al desarrollador le hablamos en su editor (MCP), no en el pitch.
- **Speco se llama «Speco».** El paquete y el comando son `specreview`; eso se dice sólo cuando hay que tipearlo.
- **Sin emojis** en el producto ni en los comentarios de PR. **[DECIDIR]** captions de redes (propuesta: ninguno).
- **Cifras en formato del idioma**: `5.000 USD` en español, `USD 5,000` en inglés.

## 4. Vocabulario (de `docs/16` §4, una palabra por concepto)

| Decimos | Evitamos | Por qué |
|---|---|---|
| **intención**, «lo que decidimos» | requisito, FR | El requisito es la forma técnica; la intención es lo que le importa a gerencia |
| **decisión** | hallazgo, finding, issue | Un hallazgo se arregla; una decisión se toma |
| **slop** (definido la primera vez: «cambios que nadie decidió pero que el código ya tiene») | drift, deuda de spec | Una palabra que el equipo pueda repetir |
| **spec** | documento, ticket | Es *el* lugar de la intención |
| **Tu turno** | pendientes, inbox | Marca quién espera a quién |
| **Lista para construir** | aprobada, done | El agente puede implementar sin adivinar |
| **cambio sin decidir** | drift detectado | Nombra el problema en idioma de negocio |
| **retrato inicial** | escaneo, análisis del repo | Lo que tu software hace hoy, para confirmar |
| propone / confirmás | detecta y corrige solo | El humano decide |
| «lo decidido no se pisa en silencio» | «detectamos cualquier cambio de comportamiento» | Regla de honestidad de `docs/16` §3 |
| el Cursor para producto | «revolucionario», «el futuro del desarrollo» | Una analogía concreta, no un adjetivo |

Términos técnicos (EARS, `COV001`, `--llm`, MCP) no desaparecen: van en «Cómo funciona por dentro».

## 5. Tono según dónde estemos

| Contexto | Tono | Ejemplo |
|---|---|---|
| Comentario en un PR | Seco, una línea por decisión, quién decide | «Cambia una regla de negocio: el límite diario pasa de 5.000 a 10.000 USD. Contradice D-003. Decide: producto.» |
| Pitch / escenario | Sobrio, producto en pantalla, una idea por minuto | «Con agentes, construir es barato. Decidir qué construir no.» |
| LinkedIn / post | Una idea de fondo, sin vender | «Un agente no aclara en el camino. Adivina.» |
| Onboarding | Una idea por paso | «El cuello de botella se movió.» |
| Mala noticia (bloqueante) | Calmo, con la salida a la vista | «Dos requisitos se contradicen. Elegí uno y el agente sigue.» |
| Email / soporte | Cálido y claro | «Listo. Si querés lo miramos juntos en 15 minutos.» |

## 6. Antes y después

- Mal: «Speco usa IA de última generación para analizar tu código.»
  Bien: «Speco te dice qué cambia en el negocio cuando un agente abre un PR.»
- Mal: «Detectamos todos los cambios de comportamiento.» (no es verdad, garantía 1 parcial)
  Bien: «Lo que decidiste no se pisa en silencio.»
- Mal: «3 findings de severidad blocker en FR-011.»
  Bien: «Hay una decisión tuya pendiente: el límite diario, 5.000 o 10.000 USD.»
- Mal: «Speco aprueba tus specs automáticamente.»
  Bien: «Speco te dice si la spec está lista para construir. Aprobás vos.»
- Mal: «Equipos que usan Speco reducen bugs un 40 %.» (no tenemos ese dato)
  Bien: «Probalo con tu repo: en un minuto ves qué espera tu decisión.»

## 7. Abierto para decidir

- **[DECIDIR]** emojis en captions de redes (propuesta: ninguno).
- **[DECIDIR]** ¿cara de marca (founder) o sólo producto en pantalla?
- **[DECIDIR]** idioma por defecto del contenido público: ¿español primero (mercado local) o inglés primero (YC, comunidad de agentes)?
- **[DECIDIR]** ¿«el Cursor para producto» o «el Cursor para el negocio» (la frase de `docs/16` §1)? Propuesta: «para producto» en inglés y frente a YC; `docs/16` decide la versión canónica.
