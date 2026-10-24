# Plan de construcción

Stack: Python 3.13, **core sin dependencias** (stdlib), pytest para tests. Paquete `specreview`, CLI `specreview`.

| Fase | Entregable | Verificación |
|---|---|---|
| 1 | `docs/01` + fixture `examples/taskly/` con defectos plantados + `expected.json` (verdad conocida) | el fixture es un repo Spec Kit válido |
| 2 | `parser/`: spec, plan, tasks -> modelo normalizado (`model.py`) | tests de parser (incl. templates reales y casos sucios) |
| 3 | `crossref.py`: req->plan y plan->req con evidencia y score | tests + el fixture produce exactamente los huecos plantados |
| 4 | `quality.py`: EARS (5 patrones), ambigüedad, testeabilidad, AC faltantes, contradicciones | tests por regla + fixture |
| 5 | `report.py`: `Finding(severity, location, rule, message)`; render texto/JSON | snapshot tests |
| 6 | CLI pulida (colores, exit codes, `--format`, `--fail-on`), probar en repo real | demo end-to-end |

Capa LLM: `llm.py` define un `Protocol` `LLMClient`; por defecto no se usa (todo determinista y offline). Se enchufa para
matching borderline y contradicciones. Arquitectura con "analizadores" registrables (`Analyzer.run(ctx)->list[Finding]`)
para que la capa de producto (North Star) se agregue sin tocar el core.
