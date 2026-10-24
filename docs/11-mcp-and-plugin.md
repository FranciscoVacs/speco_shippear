# 11 · MCP y plugin de Claude Code

El consumidor de la spec es cada vez más un agente. Este servidor MCP deja que el agente de código (Claude Code, Cursor, Kiro…)
revise la spec **antes** de implementarla: el patrón de "revisión adversarial" dentro del propio bucle del agente.

## Servidor (`specreview mcp [ROOT]`, stdio)
Sin dependencias: JSON-RPC 2.0 por stdio (MCP 2024-11-05 a 2025-06-18). Aplica el mismo `specreview.toml`, baseline y waivers que
el CI, así que el agente ve lo mismo que verá el PR.

| Herramienta | Para qué |
|---|---|
| `get_blockers(feature?)` | **Antes de implementar.** Devuelve `can_implement` y solo los bloqueantes. |
| `review_feature(feature?, min_severity?, ignore_baseline?)` | El reporte completo (mismo JSON que `-f json`). |
| `list_features()` | Features con conteos y `can_implement`. |
| `check_requirement(text)` | Valida **un** requisito antes de escribirlo: patrón EARS, ambigüedad, testeabilidad. |
| `explain_rule(rule)` | Qué significa una regla y cómo se arregla. |
| `what_it_does()` | **Para entender el producto, antes de leer código.** Qué hace hoy el software, regla por regla, con su evidencia (spec 028, `docs/39`). |
| `intent_ledger(feature?, state?)` · `get_intent(ref)` | Cada regla con su estado (propuesta → verificada / rota), las citas en tests y código, y la evidencia huérfana. |
| `intent_history(ref)` | Cómo llegó una regla a lo que dice: versiones en git, aprobaciones, cambios propuestos y verificaciones. |
| `verify_intent(ref)` | Corre sólo los tests que citan la regla (comando de `[ledger] verify`) y deja la corrida en un registro encadenado. |
| `draft_feature(title, requirements, ...)` · `change_requirement(feature, text, id?, reason?)` | Crear o corregir el qué: escriben sólo la spec, devuelven su revisión y dejan registro. No aprueban. |

Recursos: `specreview://ledger`, `specreview://feature/<id>/report`. Prompt: `review-spec`. La feature se puede nombrar por prefijo (`003`).

Cualquier cliente MCP: `{"command": "specreview", "args": ["mcp", "."]}` (o `uvx --from git+https://github.com/agustindelmonti/speco.ia specreview mcp`).

## Plugin de Claude Code (`plugin/`)
```
/plugin marketplace add agustindelmonti/speco.ia
/plugin install specreview@specreview
```
Instala: el servidor MCP, el comando **`/review-spec [feature]`** (arreglar bloqueantes en la spec, no en el código, y repetir),
la skill `spec-review` (llamar `get_blockers` antes de implementar y `check_requirement` al escribir requisitos) y un **hook**
`UserPromptSubmit` que **frena `/speckit.implement`** (exit 2, con los bloqueantes en pantalla) mientras la spec tenga bloqueantes.
El hook nunca estorba fuera de un repo Spec Kit ni ante un prompt que no pide implementar (`specreview gate --hook`).

## Límite
El gate usa solo lo determinista y offline; los huecos "inferidos por texto" son advertencias y no frenan (ver `docs/04`).
