# 36 · Workflows de Spec Kit: dónde entra Speco

Notas de diseño (2026-10-21) sobre los [workflows de Spec Kit](https://github.github.io/spec-kit/reference/workflows.html).
**No es una spec.** Lo que se adopte pasa a `product/decisions.md` y a `specs/`.

> **Contrastado con la documentación de Spec Kit el 2026-10-24** ([Workflows reference](https://github.github.io/spec-kit/reference/workflows.html)):
> - Los workflows son YAML (`schema_version`, `workflow`, `requires`, `inputs`, `steps`); los instalados viven en `.specify/workflows/<id>/`.
> - Los overlays del proyecto se guardan en `.specify/workflows/overlays/<extends>/<id>.yml`.
> - El workflow `speckit` incluido pide `speckit_version: ">=0.8.5"` y **no trae slots**: un slot (`type: slot`) lo declara el autor de un workflow y, sin llenar, se saltea. Para Speco, el overlay se ancla con `insert_after` en los pasos existentes, no llenando un slot.
> - Sigue sin estar documentada la versión exacta en que apareció `specify workflow`: queda como la mínima que pide `speckit` (0.8.5).

## 1. Qué trae

Un workflow es un YAML con `inputs` y `steps`. `specify workflow run|resume|status` lo ejecuta, con `--json` para máquinas.

| Pieza | Qué hace | Por qué nos importa |
|---|---|---|
| `shell` / pasos custom (`step.yml` + `StepBase`) | Los ejecuta **el motor**, no el agente | El freno deja de ser un pedido al agente (`docs/34 §2`) |
| `gate` + `verdict_input` | Pausa hasta que alguien decide. El veredicto puede llegar como input al retomar | Es el enganche de una aprobación remota |
| Estado en `.specify/workflows/runs/<id>/` y `resume` | Un run pausado se retoma sin rehacer lo hecho | La decisión puede tardar días |
| Overlays (`insert_after`, `replace`…) | Cambian un workflow instalado sin editarlo | Speco se inserta en el `speckit` del equipo |
| `if`, `while`, `do-while`, `fan-out` | Control de flujo | El ciclo revisar → arreglar → revisar |
| Catálogos | Distribución | Publicar el overlay y el paso |

## 2. CLI y MCP (quien programa)

1. **Overlay `speco` sobre `speckit`.** Agrega un paso de revisión después de `tasks` y otro antes de `implement`, más un `if` que corta si hay bloqueantes. Reemplaza la idea de T-026: la extensión de `extensions.yml` depende de que el agente obedezca, el paso no.
2. **Paso custom `speco-review`.** Expone una salida tipada (`steps.review.output.blockers`, `findings`, `verdict`) para que otros pasos decidan con ella. El motor no tiene dependencias, así que el paquete es chico.
3. **Workflow `speco-fix-loop`.** `do-while`: revisar → `prompt` al agente con los hallazgos → revisar, hasta N vueltas → `gate` humano. Es la receta 1 de `docs/29`, pero determinista y retomable.
4. **MCP `pending_gates`.** Lee los runs pausados del repo. El agente puede contestar «esto espera la aprobación de la spec 006», en vez de reintentar.

## 3. La app (Cursor para producto)

1. **Los gates son la bandeja de decisiones.** Un paso `speco-approval` publica el hash de la spec en el servicio y pausa el run. Quien decide aprueba en la app (cadena de hashes, spec 010) y el `resume` toma el veredicto por `verdict_input`. «¿Qué espera tu decisión hoy?» pasa a ser la lista de runs pausados en todos los repos.
2. **Políticas como overlays.** «En el segmento regulado, compliance aprueba el plan» se escribe una vez en la app. Se compila a un overlay y llega al repo con una PR. La constitución deja de ser solo texto y pasa a ser un control que se ejecuta.
3. **La app como orquestador** (más adelante). Producto dispara `speckit.specify` desde la app. El run corre en una sandbox o en Actions (`workflow_dispatch`), y cada gate muestra el diff de intención. Eso cierra el loop de `docs/31 §1`: escribir, decidir y verificar en el mismo lugar.

## 4. Seguridad

- El `message` de un gate se imprime literal. Lo que venga del repo va por `show_file`.
- La sustitución `{{ }}` no escapa nada. Nunca se interpolan inputs libres en `run`: se usa `enum` o el paso custom.
- `capture` guarda la salida en texto plano en el disco. El paso no imprime tokens.
- Un paso custom corre con los permisos de quien lo ejecuta, como el motor hoy: solo lee y parsea markdown.

## 5. Orden sugerido

1. Overlay + paso `speco-review` (CLI). Es lo más chico y lleva el freno duro a todos los agentes.
2. `speco-approval` contra el servicio (`docs/35`), con la bandeja en la app.
3. Overlays generados desde las políticas de la app.
4. Runs disparados desde la app.
