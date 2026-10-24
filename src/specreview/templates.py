"""Files written by `specreview init`."""

CONFIG_TEMPLATE = '''# specreview: configuración del repo (todo es opcional)
# fail_on = "blocker"          # blocker | warning | suggestion | never: desde qué severidad falla el CI
# min_severity = "suggestion"  # ocultar hallazgos por debajo de esta severidad
# threshold = 0.35             # umbral de similitud para la cobertura requisito <-> plan
# disable_rules = ["QUA003"]   # reglas que el equipo decidió no aplicar
# ignore_features = []         # features que no se revisan
'''

WORKFLOW_TEMPLATE = '''name: specreview
on:
  pull_request:
    paths: ["specs/**", ".specify/**", "specreview.toml", ".specreview/**"]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: agustindelmonti/speco.ia@v1
        with:
          fail-on: blocker
'''


AGENT_RULES_BEGIN = "<!-- specreview:begin -->"
AGENT_RULES_END = "<!-- specreview:end -->"
AGENT_RULES = '''## Revisión de specs antes de implementar (specreview)

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
'''
# destination -> (file, front matter): the instruction files each agent reads on its own
AGENT_TARGETS = {
    "agents-md": ("AGENTS.md", ""),                                   # Codex, Cursor, Copilot agent, Jules, Aider...
    "cursor": (".cursor/rules/specreview.mdc", "---\ndescription: Revisar la spec con specreview antes de implementar\nalwaysApply: true\n---\n\n"),
    "copilot": (".github/copilot-instructions.md", ""),
}
GIT_HOOK_MARK = "# specreview-gate"
GIT_HOOK = f'''{GIT_HOOK_MARK}
if command -v specreview >/dev/null 2>&1; then
  specreview gate "$(git rev-parse --show-toplevel)" || exit $?
elif command -v uvx >/dev/null 2>&1; then
  uvx --from git+https://github.com/agustindelmonti/speco.ia specreview gate "$(git rev-parse --show-toplevel)" || exit $?
fi
'''
