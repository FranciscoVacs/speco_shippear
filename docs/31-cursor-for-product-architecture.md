# 31 · «Cursor para producto»: qué falta y cómo se explica la arquitectura

Notas de brainstorming (octubre 2026) para estudiar y para armar un pitch técnico. **No es una decisión ni una spec**: es el mapa de
razonamiento. Lo que se adopte pasa a `product/decisions.md` (con su `D-NNN`) y a una spec en `specs/`.
La tesis de producto vive en [`docs/16`](16-thesis.md); acá se baja a **arquitectura**.

> **Regla de lectura** (la misma que `docs/16` y `docs/30`): ✅ existe hoy · 🟡 existe parcial, sólo en demo, o sin verificar contra
> servicios reales · ⬜ falta. Los estados salen de `docs/16 §3`, el README y `TODO.md` al momento de escribir; **verificar contra el
> código antes de afirmarlos en un pitch**.

---

## 1. La pregunta y la respuesta corta

**¿Qué falta para que Speco sea «Cursor para producto»?**

Hoy Speco se parece más a un **linter y revisor con chat** que a un editor. Cursor no es famoso por revisar código: es famoso porque
ahí es donde se **escribe**, con una IA que entiende el contexto y propone cambios que se aceptan o se rechazan.

Respuesta corta, en tres movimientos:
1. **Un modelo común**: pasar de «carpetas con documentos» a un **grafo tipado de artefactos de intención** (spec, decisión, regla de negocio, OKR, feature).
2. **Una superficie de autoría** sobre ese grafo, con **diff de intención** (aceptar/rechazar cambios de negocio, no de líneas).
3. **Cerrar el loop con el código**: ver lo que se construyó y compararlo con lo decidido (drift real).

---

## 2. Qué hace a Cursor «Cursor» (y su equivalente de producto)

| Cursor | Qué aporta | Equivalente en Speco | Estado |
|---|---|---|---|
| El archivo es el centro | Se escribe sobre el artefacto, la IA asiste | Documento vivo editable (spec / decisión) | ⬜ hoy el centro es el chat |
| Apply + diff aceptar/rechazar | Cambios de la IA revisables uno a uno | **Diff de intención** («el reembolso pasa de 30 a 14 días») | ⬜ |
| Checkpoints / undo | Volver atrás sin miedo | Historial de cómo cambió una regla y quién lo decidió | ⬜ (`docs/16 §6`) |
| Tab (completado) | Sugiere mientras escribís | Sugerir casos borde y reglas ya decididas mientras se escribe | ⬜ |
| `@` mentions | Contexto explícito y navegable | `@D-012`, `@feature-billing`, `@G-3` | ⬜ hoy el contexto es la carpeta `product/` |
| Indexado del repo | La IA «conoce» el código | Indexado del negocio: specs, decisiones, tickets, docs, métricas | 🟡 `product/` y specs; el retrato (spec 014) parte del código |
| `.cursorrules` | Reglas del proyecto aplicadas siempre | La constitución y las políticas de la empresa | 🟡 `.specify/memory/constitution.md`, `PRD001-005` |
| Modo agente | Trabajo multi-paso con herramientas | «Preparame la spec del cambio de pricing» de punta a punta | 🟡 el agente conversa y revisa; no ejecuta flujos largos |
| Agentes en background | Varias tareas en paralelo, supervisadas | Panel de agentes para el PM (`docs/30`) | ⬜ hay guía, no panel |
| LSP (diagnósticos, go-to-def, find usages, rename) | Entiende la **estructura** del lenguaje | El grafo de intención (sección 3) | ⬜ |

La fila clave es la última. El resto son *features*; el LSP es la **base** que las hace posibles.

---

## 3. El modelo central: un grafo tipado de intención

### 3.1 Por qué un grafo
El código tiene estructura que una herramienta puede entender (símbolos, imports, tipos, referencias). Los artefactos de producto
también tienen estructura, pero casi nadie la modela. Si el «archivo» de Speco puede ser spec, decisión, feature, OKR o regla de
negocio, lo que los une no es la carpeta: son las **relaciones**.

### 3.2 La analogía completa

| Código | Producto | Estado |
|---|---|---|
| Archivo / módulo | Spec, decisión, regla de negocio, OKR, feature | 🟡 existen, en carpetas distintas |
| Import / referencia | «esta spec implementa esta regla», «esta decisión sirve a este OKR» | 🟡 `PRD001-005` cubren spec ↔ decisión ↔ objetivo |
| Tipo / contrato | Regla con condición y excepción explícitas (EARS) | 🟡 `QUA00x` usa EARS como vara |
| Compilador / linter | Reglas de coherencia `COV`, `QUA`, `CON`, `PRD` | ✅ |
| Go to definition | «¿Dónde se decidió esto y quién lo aprobó?» | 🟡 aprobaciones auditables (spec 010) |
| Find usages | «¿Qué specs y qué código dependen de esta regla?» | ⬜ |
| Rename / refactor | Cambiar «plazo de reembolso» en todo lo que lo menciona | ⬜ |
| Git blame | Quién decidió qué y cuándo | 🟡 aprobaciones |
| Test suite | Criterios de aceptación verificados contra el código | 🟡 criterios en spec; verificación contra código ⬜ |

**Criterio de roadmap que sale de esta tabla:** cada operación que un desarrollador hace con código, ¿tiene su equivalente de negocio?
Las que hoy no existen son lo que hay que construir.

### 3.3 Esquema propuesto (a validar)

```
Nodo   = { id estable, tipo, título, cuerpo, dueño, estado, fechas, fuente }
Tipos  = spec | decision | regla | okr | feature | criterio | (suelto)
Arista = { origen, destino, tipo, confirmada: bool, propuesta_por: humano|agente }
Tipos de arista = implementa | sirve_a | depende_de | contradice | reemplaza | verifica
```

IDs estables y legibles (`D-012`, `G-3`, `BR-045`, `FR-007`) — el repo ya usa `D-NNN` y `G-N`. La arista lleva `confirmada`:
**el agente propone relaciones, el humano las confirma** (igual que Cursor infiere imports sin que los escribas).

### 3.4 Esto no parte de cero
- ✅ El motor de reglas ya razona sobre spec ↔ plan ↔ tasks y, en opt-in, spec ↔ `product/`.
- ✅ Veredicto por feature, «Tu turno», resumen ejecutivo, `--diff` en PR.
- 🟡 Retrato inicial desde código (specs 013-015): puebla el grafo con reglas candidatas.
- 🟡 MCP + gate + plugin: canal hacia el agente de código.
- ⬜ Falta: IDs/aristas explícitos y persistentes, índice consultable, historial de cambios por nodo.

---

## 4. Las operaciones del grafo son las features estrella

Ordenadas por impacto percibido por alguien no técnico:

1. **Impacto de un cambio** («si cambio esta regla, ¿qué se rompe?»): el *find usages* de producto. Demostrable en 30 segundos y sin
   respuesta hoy en ninguna herramienta común.
2. **Por qué**: cualquier regla lleva a su decisión, su dueño y su fecha en un clic.
3. **Contradicciones transversales**: hoy spec ↔ spec; el valor grande es OKR ↔ roadmap ↔ regla ↔ código.
4. **Cobertura de intención**: «este OKR no tiene ninguna spec que lo implemente», «esta regla no tiene criterio de aceptación».
5. **Drift real**: lo construido vs lo decidido (cierra la garantía 1 de `docs/16`).

---

## 5. Una sola superficie, varias lentes por rol

Usuarios: quien decide **qué construir** (producto, gerencia, middle management) y también desarrolladores. El error sería hacer
cuatro productos. El grafo es el mismo; cambia la **lente**:

| Rol | Pregunta que trae | Qué ve primero |
|---|---|---|
| Gerencia | ¿Estamos construyendo lo que decidimos? | Drift, OKR sin cobertura, decisiones pendientes |
| Producto | ¿Esto está listo para construir? | Editor de spec, diff de intención, «Tu turno» |
| Middle management | ¿Qué cambió y quién lo aprobó? | Historial, impacto, aprobaciones |
| Desarrollador | ¿Qué me piden exactamente y por qué? | Vía MCP/IDE: la regla, su contexto y sus criterios |

**El desarrollador no tiene que entrar a Speco**: Speco entra a su editor (MCP). Es el canal de distribución más barato y el que valida
el valor — quien recibe menos ambigüedad lo nota y se lo cuenta a producto.

---

## 6. Hoja de ruta propuesta

| Orden | Qué | Por qué en ese orden |
|---|---|---|
| 1 | **Grafo con IDs y aristas** (modelo + índice + persistencia) | Base de todo; hoy es lo que menos está |
| 2 | **Operación estrella: impacto de un cambio** | Demo de 30 s; usa el grafo sin necesitar UI de edición |
| 3 | **Edición con diff de intención** | Cambia el modelo mental de «reviso» a «decido con un copiloto»; se apoya en el grafo (cada propuesta muestra los nodos afectados) |
| 4 | **Cerrar el loop con el código** (drift) | Convierte revisión en gobierno; completa la garantía 1 |
| 5 | Completado mientras se escribe, `@` mentions, panel de agentes | Pulido sobre la base ya sólida |

**Lo que no copiaría de Cursor:**
- *Individual*: producto es colaborativo (aprobaciones, comentarios, «tu turno»). Acá el modelo es más cercano a Figma/Notion con IA nativa.
- *Latencia como único estándar*: una revisión con LLM de 30 s mata el flujo de escritura. Reglas deterministas rápidas mientras se escribe; juez LLM al guardar.

---

## 7. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Poblar el grafo es el costo de entrada** | Nadie escribe 300 reglas a mano | Retrato inicial desde código + confirmación humana; medir precisión |
| **Reglas falsas en el retrato** | Un grafo con ~40% de ruido mata la confianza más rápido que no tener grafo | Mostrar confianza, exigir confirmación, empezar con pocas reglas de alto valor |
| **Ontología demasiado rígida** | Producto no la va a mantener | Permitir nodos «sueltos»; relaciones propuestas por el agente |
| **Dos fuentes de verdad** | Si las decisiones viven en Speco y en Notion/Linear, se desincronizan | Decidir pronto: ¿Speco es origen o espejo con sync? |
| **Latencia** | Rompe la sensación de editor | Dos capas: determinista (ms) y LLM (al guardar) |
| **Login/servicios reales sin probar** | `TODO.md` T-010 y `docs/19`: Supabase y GitHub reales nunca se probaron | Verificarlo antes de prometer cloud en un pitch |

---

## 8. Preguntas abiertas (decisiones que cambian el diseño)

1. ¿Speco es la **fuente de verdad** de decisiones y reglas, o un **espejo** de Notion/Linear/Jira?
2. ¿Dónde viven los nodos: **archivos en el repo** (como hoy, versionados con git) o **base de datos** (cloud)? ¿O ambos, con el repo como origen?
3. ¿Cuál es el usuario **ancla** del primer release: producto (escribe) o gerencia (aprueba)? Cambia qué se construye primero.
4. ¿Qué es lo mínimo del grafo para que «impacto de un cambio» sea creíble? (¿sólo spec ↔ decisión ↔ OKR, o ya con código?)
5. ¿Cómo se mide que una regla extraída del código es **correcta** (precisión del retrato)?

---

## 9. Esqueleto de pitch técnico (5 minutos)

1. **Problema (30 s).** Con agentes, implementar es barato; lo caro es decidir qué construir y mantenerlo coherente. Un agente no aclara en el camino: adivina.
2. **Idea (30 s).** Lo que Cursor hizo con el código, Speco lo hace con la intención: un lugar donde se escribe, se revisa y se verifica.
3. **Arquitectura (2 min).** El grafo tipado de artefactos → motor de reglas deterministas + juez LLM → superficies por rol (app, MCP en el IDE, CI en el PR). Mostrar la tabla de la sección 3.2.
4. **Demostración (1 min).** «Si cambio esta regla, ¿qué se afecta?» (cuando exista) o, hoy, `specreview demo` + el retrato inicial.
5. **Por qué ahora y por qué nosotros (30 s).** Ya hay motor de reglas, aprobaciones auditables, MCP y retrato desde código; falta el grafo persistente y la autoría.
6. **Qué sigue (30 s).** Hoja de ruta de la sección 6.

**Preguntas duras que conviene tener preparadas:**
- *«¿Y esto no es Notion/Jira con IA?»* → No modelan relaciones verificables ni se comparan con el código; la diferencia es el grafo + las reglas de coherencia + el drift.
- *«¿Cómo evitan que la IA invente reglas?»* → El agente propone, el humano confirma; nunca decide (`D-012`).
- *«¿Por qué no lo hace el propio Cursor/Claude Code?»* → Operan sobre el código; la intención de negocio no es su artefacto y no tienen aprobaciones ni historial de decisiones.
- *«¿Qué tan confiable es el retrato?»* → Responder con la métrica de precisión (sección 8, pregunta 5); si no existe aún, decirlo.
