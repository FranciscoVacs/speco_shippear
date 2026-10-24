# Estructura de archivos de GitHub Spec Kit (verificada contra `github/spec-kit`, commit 51b6d17)

Fuente: `templates/*.md`, `templates/commands/*.md`, `scripts/bash/common.sh`. El parser depende de esto.

## Layout de un proyecto

```
<repo>/
├── .specify/
│   ├── feature.json            # {"feature_directory": "specs/003-user-auth"}  (feature "activa")
│   ├── memory/constitution.md  # principios no negociables del proyecto
│   └── extensions.yml          # opcional (hooks)
└── specs/
    └── 003-user-auth/          # NNN-short-name  (o YYYYMMDD-HHMMSS-short-name con --timestamp)
        ├── spec.md             # /speckit.specify  -> requisitos
        ├── plan.md             # /speckit.plan     -> plan de implementación (prosa libre)
        ├── research.md         # plan, fase 0
        ├── data-model.md       # plan, fase 1
        ├── quickstart.md       # plan, fase 1
        ├── contracts/*         # plan, fase 1 (si hay interfaces externas)
        ├── tasks.md            # /speckit.tasks    -> lista de tasks (estructurada)
        └── checklists/*.md     # /speckit.specify (requirements.md) y /speckit.checklist (CHKnnn)
```

Resolución de la feature activa (`common.sh`): `SPECIFY_FEATURE_DIRECTORY` > `.specify/feature.json` > error.
El reviewer acepta una ruta directa a la carpeta de la feature (el caso normal del CLI) y, si se le da la raíz del repo, descubre `specs/*/`.

## spec.md

| Elemento | Formato | Notas |
|---|---|---|
| Header | `**Feature Branch**: \`003-x\``, `**Status**: Draft` | |
| User stories | `### User Story N - Título (Priority: P1)` | Prioridad P1..Pn |
| Escenarios de aceptación | lista numerada `1. **Given** … **When** … **Then** …` bajo `**Acceptance Scenarios**:` | Único lugar con criterios de aceptación explícitos por story |
| Test independiente | `**Independent Test**: …` | |
| Edge cases | bullets bajo `### Edge Cases` | en forma de pregunta |
| Requisitos funcionales | `- **FR-001**: System MUST …` bajo `### Functional Requirements` | ID `FR-\d+` |
| Entidades | `- **Entidad**: …` bajo `### Key Entities` | |
| Success criteria | `- **SC-001**: métrica` bajo `### Measurable Outcomes` | ID `SC-\d+` |
| Assumptions | bullets bajo `## Assumptions` | |
| Marcadores | `[NEEDS CLARIFICATION: pregunta]` | máx. 3 por spec; son ambigüedad *declarada* |
| Clarificaciones | `## Clarifications` > `### Session YYYY-MM-DD` > `- Q: … → A: …` | lo agrega `/speckit.clarify` |

**Los FR no están vinculados a las user stories** y las stories no listan FRs. Cualquier relación FR↔story es inferida.

## plan.md

Prosa/headings libres: `## Summary`, `## Technical Context` (pares `**Clave**: valor`), `## Constitution Check`,
`## Project Structure` (árbol de archivos), `## Complexity Tracking` (tabla). **Sin IDs de requisito ni pasos numerados.**
Los "pasos del plan" reales se derivan de: tasks.md (primario), secciones del plan, entidades de data-model.md, contratos.

## tasks.md

```
## Phase N: <nombre>                         (Setup / Foundational / User Story N - Título (Priority: Pn) / Polish)
- [ ] T012 [P] [US1] Descripción con ruta en src/models/user.py
```
Regex: `^- \[( |x|X)\] (T\d+)( \[P\])?( \[US\d+\])? (.+)$`. `[P]` = paralelizable, `[USn]` = story.
Phases Setup/Foundational/Polish **no llevan `[USn]`** (infra compartida): no son "scope colado", son soporte.
**Las tasks no citan `FR-###`** por convención (el usuario/agente puede hacerlo a mano).

## Implicancia para el motor de cruce

Trazabilidad en capas, de más a menos confiable: (1) referencia explícita `FR-001` en plan/tasks/data-model,
(2) enlace por story (`[USn]` -> story -> FRs que comparten texto), (3) similitud léxica, (4) juicio de LLM opcional.
Cada vínculo guarda su `evidence` (qué capa lo produjo) para que el reporte sea explicable.
