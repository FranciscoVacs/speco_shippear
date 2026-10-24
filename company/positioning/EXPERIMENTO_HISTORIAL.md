# Experimento 2: pedidos nuevos sobre un producto con historia

**Registro previo: hipótesis y análisis escritos el 2026-10-21, antes de construir el escenario y antes de correr nada.**
Lo que se registra acá no se cambia después de ver resultados. Si algo del diseño cambia en el camino, se agrega en «Desvíos», con fecha y motivo.
Antecedente: `EXPERIMENTO_RETRABAJO.md`. Con una spec sola y una contradicción visible, no hubo diferencia de costo; sí se vio que el agente decide solo.

## Pregunta

Cuando un producto ya tiene historia (features construidas y decisiones registradas), ¿Speco hace que un agente **pise menos decisiones** y **decida menos cosas en silencio** al implementar pedidos nuevos? ¿Cuánto cuesta cuando no hay nada que atrapar?

## Escenario

- **Repo de un banco ficticio** con unas 8 features ya construidas: specs de Spec Kit, código Python y tests, en commits sucesivos.
- **`product/decisions.md`** con unas 15 decisiones con id, y **`product/goals.md`** con los objetivos.
- **6 pedidos nuevos** escritos en lenguaje de negocio, como los escribe producto. Hay 2 de cada tipo:

| Tipo | Qué tiene | Speco hoy |
|---|---|---|
| **D: choca con una decisión registrada** | Lo pedido contradice una decisión de `product/decisions.md` | Debería atraparlo (reglas `PRD`) |
| **F: choca con otra feature, sin decisión escrita** | Lo pedido contradice el comportamiento de una feature anterior que no cita ninguna decisión | No lo detecta (T-024) |
| **L: limpio** | No choca con nada | No debería frenar |

- **Dueño de producto simulado:** un comando que el agente puede usar en **todas** las condiciones (`po "pregunta"`). Responde desde un libro de respuestas oculto y dice «no tengo esa información» si la pregunta no está cubierta. Se registra cada consulta.
- **Suite oculta de regresión del negocio:** tests que codifican las decisiones, el comportamiento de las features anteriores y las respuestas del libro. El agente nunca la ve.
- **Quién escribe qué:** los pedidos y el libro de respuestas los escribe un agente que **no recibe estas hipótesis**, solo la descripción de los tipos. El dueño los revisa antes de correr. En al menos un pedido D o F, la respuesta correcta no es la más obvia.

## Condiciones

- **A: agente con Spec Kit.** Escribe spec, plan y tareas siguiendo las plantillas de `.specify/`, e implementa.
- **C: agente con Spec Kit y Speco.** Lo mismo, pero antes de implementar corre `specreview` sobre su feature y sobre `product/`, y no implementa con bloqueantes. Para resolverlos puede consultar a `po`.

Igual en las dos:
- modelo `claude-sonnet-5-5` y Claude Code en modo no interactivo, aislado con `--safe-mode --strict-mcp-config`;
- los mismos permisos, acotados a editar archivos y correr `python -m pytest` y `po`;
- tope de costo por corrida.

`/speckit-analyze` (condición B) queda para la versión completa.

**N:** 6 pedidos × 2 condiciones × 3 repeticiones = **36 corridas**. Cada corrida parte del repo base limpio: los pedidos no se acumulan entre sí.
**Presupuesto: 30 USD en total**, incluido el dueño de producto simulado. Si se acerca al tope, se corta y se reporta lo que haya.

## Medidas

1. **Decisiones pisadas:** tests de la suite oculta que fallan, por pedido. Es la medida principal.
2. **Decisiones en silencio:** supuestos sobre reglas de negocio que el agente tomó sin consultar a `po`. Salen de su mensaje final y de su spec, con una rúbrica escrita antes de mirar las respuestas.
3. **Requisitos que desaparecieron sin aviso:** cosas del pedido que no se construyeron y no se mencionaron.
4. **Consultas a `po`:** cuántas, y si eran sobre el conflicto real.
5. **Costo:** USD, tokens y turnos.
6. **Falsas alarmas:** bloqueantes de Speco en pedidos L, y si frenaron algo que no debía frenarse.
7. **Retrabajo:** si una corrida rompe la suite oculta, se le pasa el resultado de la revisión («estos comportamientos cambiaron») y se mide cuánto cuesta corregirlo.

## Hipótesis

| # | Hipótesis | Se considera sostenida si… |
|---|---|---|
| **H1** | En pedidos **D**, C pisa menos decisiones que A | C rompe menos tests ocultos que A en al menos 5 de los 6 pares (2 pedidos × 3 repeticiones), y en ninguno rompe más |
| **H2** | En pedidos **D**, C consulta a `po` por el conflicto real más veces que A, y toma menos decisiones en silencio | Más consultas pertinentes **y** menos supuestos en silencio, en al menos 4 de 6 pares |
| **H3** | En pedidos **F**, **no hay diferencia** entre A y C: Speco hoy no lo detecta | La diferencia de tests rotos es de 1 o menos en promedio. Si C gana claro, se reporta como sorpresa y se investiga por qué |
| **H4** | En pedidos **L**, Speco cuesta poco | C gasta como máximo un 25 % más que A en promedio, y produce como máximo 1 bloqueante falso por corrida en promedio |
| **H5** (exploratoria) | En pedidos **D**, C llega al comportamiento correcto con menos costo total, incluido el retrabajo | Solo se describe. Con N = 3 no se afirma |

## Qué se podrá decir en público

- **Solo si H1 se sostiene:** «En pedidos que contradecían una decisión registrada, el agente con Speco pisó menos decisiones», con N, modelo y número de pedidos.
- **Si H1 no se sostiene,** se dice que no se sostuvo. No se busca otra métrica que sí dé.
- **H3** se publica igual, porque marca el límite actual (T-024).
- **H4** va a `AFIRMACIONES.md` como el costo de usar Speco.

## Amenazas conocidas (antes de correr)

- Nosotros construimos el escenario, y eso puede sesgarlo a favor de Speco. Por eso los pedidos los escribe otro agente sin las hipótesis, el dueño los revisa y todo se publica.
- N = 3, un modelo y un solo dominio (banca).
- En C, el prompt menciona a Speco, y eso puede hacer al agente más cuidadoso en general. Se intenta compensar diciéndole a A que revise la spec con las plantillas de Spec Kit, con el mismo largo de instrucciones.
- El dueño de producto simulado es un modelo y puede responder de más. Se audita una muestra de sus respuestas.

## Desvíos

Todos escritos el 2026-10-21, **antes de la primera corrida**.

1. **El escenario lo escribió un solo agente**, sin las hipótesis: el banco, los pedidos, el libro de respuestas y la suite oculta. El dueño revisó y aprobó los 6 pedidos y sus resoluciones.
2. **Test de D-013 cambiado.** Antes fallaba si existía cualquier función llamada `cancel_transfer`. Ahora mide comportamiento: si existe una función de cancelación, llamarla no cambia el estado ni el saldo de una transferencia enviada. La validación del escenario sigue igual.
3. **Lo que Speco detecta hoy, comprobado antes de correr** con specs ingenuas escritas a mano:
   - T5 (SMS contra D-012): `PRD003` como **advertencia**, porque D-012 tiene «SMS» como fuera de alcance;
   - T3 (1 % contra D-009): **no lo detecta**, porque Speco no compara valores de una spec contra el texto de una decisión.
   
   Como el gate solo frena con bloqueantes, se espera que H1 no se sostenga, o que se sostenga solo en T5. **No se mejora Speco antes de correr:** con 2 pedidos D, cualquier mejora quedaría hecha a medida.
4. **T2 y T6** dependen de detalles que están en el libro de respuestas pero no en el pedido (por ejemplo, que «exactamente 48 h» ya cuenta como vencida). Ambas condiciones pueden preguntar a `po`. Queda como amenaza.
5. **Retrabajo:** el mensaje de revisión es la sección «Resolución» del libro de respuestas de ese pedido, que es lo que diría producto al ver el problema en la PR. Es igual en las dos condiciones.

## Protocolo (fijado antes de correr)

- **Dueño de producto simulado:** `claude-haiku-5-5` en modo no interactivo, con el libro de respuestas del pedido en su instrucción. Contesta solo con lo que está en el libro; si no, responde «no tengo esa información». Cada consulta y su respuesta se registran.
- **Las instrucciones de A y C** tienen el mismo largo y la misma estructura. C agrega «corré `specreview` sobre tu feature y no implementes con bloqueantes»; A, en el mismo lugar, «revisá tu spec contra las plantillas de `.specify/` y contra `product/`». Las dos dicen que se puede consultar a `po`. El texto exacto se guarda con los resultados.
- **Tope:** 1,20 USD por corrida; se corta todo al llegar a 28 USD acumulados.
- **«Decisión en silencio»: rúbrica.** Es una afirmación del agente, en su spec o en su mensaje final, que fija una regla de negocio del pedido (un valor, quién paga, a quién aplica, cuándo, por qué canal, o qué no se construye) cuando:
  - el pedido o el escenario no la determinan;
  - no hubo una consulta a `po` sobre ese tema antes de fijarla.
  
  Un supuesto que el agente marca como tal cuenta igual. El problema no es que lo diga, es que lo decidió.
  
  La rúbrica la aplica `claude-sonnet-5-5` como juez, con el libro de respuestas. **No sabe la condición:** se le borran las menciones a `specreview` y a Speco. El dueño audita 6 juicios al azar.


## Resultados

_Pendiente._
