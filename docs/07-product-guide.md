# Guía del producto

> Fuente de contenido para el onboarding y la página "Cómo funciona" de la UI, y para el README.
> Todo lo que afirma está respaldado por el código; si cambia el comportamiento, cambia acá.

## 1. Qué es

**Con agentes escribiendo el código, lo caro es decidir qué construir y mantenerlo coherente. Speco es la capa donde esa decisión vive, se revisa y se verifica** (la tesis completa y el vocabulario están en [`16-thesis.md`](16-thesis.md)).

El problema se llama **slop**: lo que entra al producto sin que nadie lo haya decidido. Tiene tres formas:

| Slop | Qué pasa | Qué garantiza Speco |
|---|---|---|
| **Una regla cambia sola** | Una regla de negocio implícita en el código cambia sin que nadie lo decida | Lo decidido no se pisa en silencio: contradicciones entre requisitos y contra decisiones previas |
| **Se aprueba código, no intención** | El cambio se revisa línea por línea y nadie ve qué cambió en el negocio | Los cambios se revisan como intención: veredicto por feature y «Tu turno» |
| **La intención no tiene casa** | Vive en chats, tickets y cabezas | La spec es el lugar de la intención: se verifica antes de construir y cada aprobación queda registrada |

**Alcance de hoy:** revisa `spec.md`, `plan.md` y `tasks.md` (GitHub Spec Kit) antes de implementar. Todavía no detecta reglas que viven solo en el código.

## 2. Cuándo usarla

Después de `/speckit.tasks` y **antes de `/speckit.implement`**. Corregir una línea de la spec cuesta minutos; corregir lo que
el agente construyó a partir de esa línea cuesta mucho más.

## 3. Cómo funciona

1. **Lee** `spec.md`, `plan.md`, `tasks.md` (y `data-model.md`) de la carpeta de la feature y los convierte en datos:
   requisitos (`FR-###`), criterios de éxito (`SC-###`), user stories con sus escenarios, pasos del plan y tasks.
2. **Cruza** requisitos contra plan y tasks en las dos direcciones: ¿qué requisito no tiene quién lo implemente? ¿qué
   task no responde a ningún requisito?
3. **Evalúa la calidad** de cada requisito: ¿es ambiguo? ¿se puede testear? ¿tiene criterio de aceptación? ¿contradice a otro?
   Usa **EARS** como vara (sección 6).
4. **Reporta** un hallazgo por línea, con **severidad**, **dónde está** (archivo y línea) y **una explicación corta**.

Todo esto se hace con reglas y comparación de texto: **es determinista, corre sin internet y no envía tu spec a ningún lado**.
Opcionalmente un modelo de lenguaje (`--llm`) confirma los casos dudosos y habilita el asistente conversacional.

## 4. Tus primeros 5 minutos

```bash
pip install -e '.[dev]'
specreview examples/invitations            # una spec de ejemplo con defectos plantados
specreview <tu-repo>                       # tu repo: busca specs/*/spec.md
specreview <tu-repo> --serve               # abre la interfaz web en http://127.0.0.1:8765
specreview --explain COV001                # qué significa cualquier regla
```
`<tu-repo>` puede ser la raíz del repositorio o la carpeta de una feature (`specs/003-mi-feature`).
Para revisar todas las features de una vez: `specreview <tu-repo> --all`.

## 5. Cómo leer el reporte

Cada línea tiene la forma: **severidad · dónde · ubicación · regla · qué pasa**.

| Severidad | Significa | Qué hacer |
|---|---|---|
| **Bloqueante** | No conviene implementar así: hay una contradicción, una pregunta sin responder o un requisito que seguro nadie implementa | Resolver antes de `/speckit.implement` |
| **Advertencia** | Probable defecto: ambiguo, sin criterio de aceptación, posible scope colado | Revisar; la mayoría merece arreglo |
| **Sugerencia** | Mejora de estilo o duda que no se pudo confirmar | Mirar si hay tiempo |

**Flujo recomendado:** arreglá los bloqueantes, después las advertencias, y volvé a correr. En la interfaz, tocá un hallazgo para
ver la línea exacta en el archivo y "¿Qué significa?" para la explicación de la regla.

**El código de salida** sirve para automatizar: `0` sin hallazgos graves, `1` hay hallazgos desde el umbral (`--fail-on`,
por defecto bloqueante), `2` error de uso.

## 6. EARS en dos minutos

EARS (Easy Approach to Requirements Syntax) es una forma de escribir requisitos que obliga a nombrar **cuándo** y **qué responde
el sistema**, que es justo lo necesario para poder testearlos. Hay cinco patrones:

| Patrón | Forma | Ejemplo |
|---|---|---|
| Ubicuo | The system SHALL … | System MUST log every login |
| Evento | When *disparador*, the system SHALL … | When an invitation is created, the system MUST email the address within 60 seconds |
| Estado | While *estado*, the system SHALL … | While the account is locked, the system MUST reject logins |
| No deseado | If *condición*, then the system SHALL … | If the card is declined, then the system MUST show an error |
| Opcional | Where *función incluida*, the system SHALL … | Where two-factor is enabled, the system MUST ask for a code |

Spec Kit escribe «System MUST …», que cuenta como patrón ubicuo: **no se marca como error**. Solo se sugiere reescribir lo escrito
desde el actor («Users MUST be able to …») o sin sujeto del sistema.

## 7. Qué tan confiable es (leer esto)

- **Lo determinista es confiable:** contradicciones numéricas, ambigüedad por palabras vagas, preguntas `[NEEDS CLARIFICATION]`
  abiertas, escenarios incompletos, formas no EARS.
- **Lo inferido por texto es una pista, no un veredicto:** Spec Kit **no vincula** requisitos con tasks, así que "este requisito
  no tiene plan" se deduce comparando palabras. Si el requisito sí está implementado pero con otro vocabulario, aparece como
  falso positivo. Por eso un hueco inferido solo por texto es **advertencia** y solo es **bloqueante** si tu repo cita los
  requisitos (`FR-###`) o un modelo lo confirma.
- **Cómo reducir el ruido:** citá el id del requisito en la task que lo implementa («… (FR-005)») y en el escenario de
  aceptación que lo verifica. Es la mejora que más ayuda, y además deja trazabilidad. O corré con `--llm anthropic` para que un modelo arbitre los casos dudosos.
- Medido sobre un repo real ya implementado: 0 bloqueantes (lo esperable), pero siguen apareciendo advertencias y sugerencias
  que en buena parte son ruido cuando no se usa el modelo. Detalle en `docs/04-real-repo-calibration.md`.

## 8. El asistente

Es un chat para trabajar los hallazgos con alguien que conoce tu spec: «reescribí FR-006 en EARS», «¿qué criterios de
aceptación faltan para la story 3?», «¿este hallazgo es un falso positivo?».

- **Propone, no edita:** te muestra el texto sugerido para que lo copies; nunca modifica tus archivos.
- Ve el reporte y tus archivos de la feature. Con un modelo real (`--serve --llm anthropic`) ese contenido se envía al proveedor.
- Sin modelo configurado la pestaña lo explica; `--llm demo` muestra la interfaz con respuestas de ejemplo (no son de un modelo).

## 9. Preguntas frecuentes

**¿Reemplaza a `/speckit.analyze`?** No: ese comando es un prompt para el agente (no determinista, sin CLI). Spec Reviewer es
código: reproducible, corre en tu terminal o en CI y da un reporte estructurado. Se complementan.

**¿Modifica mis archivos?** Nunca. Solo lee.

**¿Se manda mi spec a internet?** No, salvo que actives `--llm` o el asistente con un proveedor real.

**Me aparece un hueco que no es real.** Citá el `FR-###` en la task. Si es una restricción («MUST NOT alterar…») que no genera
trabajo propio, ignoralo: es un caso conocido (regla `COV006`).

**¿Qué versiones de Spec Kit soporta?** El formato de `spec.md`/`plan.md`/`tasks.md` de los templates actuales
(`FR-###`, `SC-###`, `User Story N - … (Priority: Pn)`, `- [ ] T### [P] [USn] …`). Ver `docs/01`.
