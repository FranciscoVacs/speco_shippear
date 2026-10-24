# Speco (este repo)

## Revisión de specs antes de implementar (specreview)

Este repo usa Spec Kit y `specreview`. Las specs son el lugar del **qué** (qué hace el producto y qué hay que construir); el código es el cómo.
Si tenés las herramientas MCP `specreview` conectadas:

0. Para entender qué hace hoy el producto, llamá `what_it_does` **antes de leer código**; `intent_history` dice cómo llegó una regla a lo que dice y quién lo decidió.
   Para crear o corregir una regla usá `draft_feature` / `change_requirement`, no la inventes en el código. En cada test, citá la regla que verifica como `<feature>/<id>` (p. ej. `028/FR-002`).
1. Antes de implementar una feature de `specs/` (o de `/speckit.implement`), llamá `get_blockers`. Si `can_implement` es false, **no implementes**: arreglá la spec y volvé a consultar.
2. Al escribir o reescribir un requisito, llamá `check_requirement` con su texto; usá la forma EARS (`When <trigger>, the system MUST <response>`) y un umbral medible para cualquier atributo de calidad.
3. `explain_rule` explica cualquier id de regla que no reconozcas.
4. Las decisiones de producto (alcance, prioridades, trade-offs) no son tuyas: devolvelas como pregunta en vez de elegir.
5. Antes de asumir un valor compartido (un límite, un plan, un permiso), preguntá si ya está decidido en `product/decisions.md`.

Sin MCP: `specreview gate` desde la raíz del repo hace la misma comprobación (sale con 2 si hay bloqueantes).

Sin MCP, lo mismo desde la terminal (sin instalar nada, desde la raíz del repo):

```bash
PYTHONPATH=src python3 -m specreview.cli ledger . --today              # qué hace hoy el producto, regla por regla, con su evidencia
PYTHONPATH=src python3 -m specreview.cli ledger . -f json              # todas las reglas, incluidas las propuestas (lo que falta construir)
PYTHONPATH=src python3 -m specreview.cli ledger . --history 028/FR-002 # cómo llegó una regla a lo que dice y quién lo decidió
PYTHONPATH=src python3 -m specreview.cli ledger . --verify 028/FR-002  # correr los tests que la citan y registrar el resultado
```
