# Dogfooding: Spec Reviewer revisa sus propias specs

Desde la versión 0.2 el producto se especifica con Spec Kit y se revisa con sí mismo (constitución, principio VI):
`.specify/` y `specs/001…004` describen sus features, y `specreview . --all` las revisa. La compuerta
`tests/test_all_mode.py::test_own_specs_have_no_blockers_and_review_fast` hace fallar la suite si una spec propia tiene un bloqueante.

## Flujo de trabajo para cualquier cambio

1. **Spec primero** (`specs/NNN-nombre/spec.md`): requisitos EARS, escenarios Given/When/Then.
2. `specreview specs/NNN-nombre` → corregir lo que marque **antes** de planificar.
3. `plan.md` y `tasks.md`; **citar `FR-###` en cada task y en cada escenario** (trazabilidad explícita: vuelve firmes los huecos y silencia falsos positivos).
4. Revisar de nuevo. Implementar. Marcar `[X]` **sólo** cuando el trabajo y su test existen.
5. `specreview . --all` antes de abrir el PR.

## Lo que encontró el reviewer en sus propias specs

| Hallazgo | Era real | Acción |
|---|---|---|
| FR-009/011/012/014 de la 001 sin criterio de aceptación | sí | escenarios agregados (US1.3, US1.4, US5) |
| FR-004 y FR-010 de la 001 con varios MUST | sí | separados en requisitos atómicos |
| FR-008, FR-009, FR-002 de la 003 sin criterio de aceptación | sí | escenarios agregados |
| FR-006/010 (003) y FR-009 (004) no atómicos | sí | separados |
| FR-006/007/009 (001), FR-003/004/008/011 (003): "sin criterio" aunque el escenario existe | **no** (sinónimos: «modify» vs «changed») | limitación conocida del cruce por texto; se resuelve citando el id en el escenario |

## Bugs del propio reviewer que salieron a la luz

1. Con spec pero sin plan ni tasks mostraba **«cobertura 100 %»**: engañoso; ahora es desconocida (`—`) y `COV000` apunta a `spec.md`.
2. Un id citado en un escenario se buscaba como subcadena (`FR-001` coincidía con `FR-0010`); ahora es id completo.
3. **Proceso, no código:** se marcó una task como hecha (T009 de la 003) antes de escribir su test. Lo detectó la relectura de las tasks, no la herramienta.

## Backlog nacido del dogfooding

- **Validar tasks `[X]` contra el repo**: una task marcada como hecha cuyo archivo (`src/...`) no existe es una señal firme. Hoy el reviewer no mira el código, sólo las specs.
- Reconocer escenarios que citan el id también en `plan.md`/`tasks.md` al calcular la cobertura de criterios (hoy sólo cuentan escenarios y SC).
- Correr `specreview . --all --fail-on blocker` en CI y comentar en el PR (North Star del brief).

## Verificación de la UI (features 003 y 004)

Las tasks de UI se marcaron `[X]` sólo después de recorrer la interfaz en un navegador real contra servidores reales
(`--llm demo`, sin `--llm` y un repo de terceros), no por el reporte de quien la construyó:

- 0 pedidos a `/api/chat` antes de apretar Enviar y 1 después, con `focus {rule, ids}` (FR-006, FR-011).
- Primer texto de la respuesta demo a los **117 ms** (SC-001 de la 003: < 1000 ms).
- De un hallazgo a su línea resaltada en **1 clic** (SC-001 de la 004: ≤ 2).
- Las **17 de 17** reglas del catálogo aparecen en la guía (SC-002 de la 004).
- `verify-ui.mjs` (105 chequeos: onboarding, guía, ayuda inline, asistente, estados vacíos, modo embebido, 375/1280 px, claro/oscuro): ALL PASS.

Bugs que salieron de verificar (corregidos): el renderizador de Markdown congelaba la página con cualquier respuesta en negrita
(dos regex compartían estado); la etiqueta «Asistente» y la marca «demo» salían pegadas; la pregunta prellenada terminaba en `.».`;
el eco del demo cortaba una palabra a la mitad.

**No verificado:** un modelo real (sólo el proveedor demo y streams interceptados), lectores de pantalla, Safari/Firefox, dispositivos táctiles.
