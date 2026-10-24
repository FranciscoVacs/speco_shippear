# Contrato de datos para la UI

La UI **no** reimplementa análisis: sólo muestra el JSON que produce `specreview -f json` (ver `report.to_dict`).

## Report (`schema_version: 1`)
```jsonc
{
  "schema_version": 1,
  "feature": "003-team-invitations",
  "summary": {"blocker": 6, "warning": 10, "suggestion": 3},
  "metrics": {
    "requirements": 10, "success_criteria": 2, "user_stories": 3, "tasks": 14, "plan_items": 5,
    "requirements_with_plan_or_tasks_pct": 60,       // puede ser null si no hay requisitos
    "requirements_with_acceptance_pct": 50,
    "tasks_without_requirement": 2,
    "ears_patterns": {"ubiquitous": 8, "event": 2, "state": 0, "unwanted": 0, "optional": 0, "complex": 0, "none": 0}
  },
  "notes": ["No hay plan.md ..."],                    // avisos del parser
  "findings": [{
    "rule": "COV001",                                // familias: COV (cobertura), QUA (calidad), CON (contradicción)
    "rule_name": "requisito sin plan",
    "severity": "blocker" | "warning" | "suggestion",
    "ids": ["FR-005"],                               // FR-###, SC-###, T###, P#, US#, US#.#
    "location": {"file": "spec.md", "line": 72},
    "message": "texto corto en español",
    "fix": "sugerencia de arreglo (puede ser \"\")",
    "evidence": ["más cercano: T012 (similitud 0.19)"]
  }]
}
```
Los findings llegan ordenados (severidad desc, regla, id natural). Los ids de requisito/task/story/plan-item son
clickeables: `location.file` + `location.line` apuntan al archivo fuente de la feature.

## Sources (sólo para el visor de código)
`{"spec.md": "<texto>", "plan.md": "...", "tasks.md": "...", "data-model.md": "..."}` (los que existan).

## Modos de datos de la app
1. **Estático / embebido**: `window.__SPECREVIEW__ = {report, sources}` inyectado en el HTML (reporte exportable, sin servidor).
2. **Servidor**: `GET /api/features`, `GET /api/review?feature=<id>`, `GET /api/sources?feature=<id>` (los implementa `specreview serve`).
3. **Muestras de desarrollo**: `/samples/index.json` + `/samples/<id>.report.json` + `/samples/<id>.sources.json`.
