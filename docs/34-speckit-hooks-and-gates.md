# 34 · Spec Kit, sus hooks y `/speckit-analyze`: dónde encaja Speco

Pregunta que motivó esta nota (2026-10-21): **¿los hooks de Spec Kit (`.specify/extensions.yml`) y `/speckit-analyze` vuelven innecesario a Speco?**
Respuesta corta: no. Los hooks son un **lugar donde enganchar** una revisión, no una revisión. `/speckit-analyze` sí se superpone con parte del motor, pero mira otra cosa y le habla a otra persona.

> Lo que se dice acá de Spec Kit sale de su comando `/speckit-implement` y de la descripción de `extensions.yml` al 2026-10-21, **contrastado con la documentación el 2026-10-24**
> ([Extensions reference](https://github.github.io/spec-kit/reference/extensions.html)): la configuración vive en `.specify/extensions.yml` (`installed`, `settings`, `hooks`), los eventos son
> `before_<comando>` / `after_<comando>` (p. ej. `before_implement`), y `optional: false` emite el hook como automático (`EXECUTE_COMMAND`); la documentación **no** dice que un hook pueda
> bloquear un comando, y las plantillas actuales saltean los hooks con `condition`. Lo que sigue sin documentar es cómo **publicar** una extensión en el catálogo comunitario: solo cómo consumir
> catálogos (`specify extension catalog add <url>`).

## 1. Qué son los hooks de Spec Kit

`.specify/extensions.yml` es opcional. Engancha comandos antes o después de un paso de Spec Kit:

```yaml
hooks:
  before_implement:
    - extension: speco
      command: speckit.speco.gate     # se corre como /speckit-speco-gate
      optional: false
      description: Frenar si la spec tiene bloqueantes
```

- `/speckit-implement` le indica **al agente** que lea `hooks.before_implement` antes de implementar y `hooks.after_implement` al terminar.
- Un hook `optional: false` lo **corre el agente**. Uno opcional solo se le sugiere a la persona.
- El hook nombra **otro comando**, provisto por una extensión. El hook no revisa nada por sí mismo.

## 2. Los puntos de control, comparados

Hay varias formas de lograr que nadie implemente una spec con bloqueantes. Difieren en **quién ejecuta el control** y en **si se puede saltear**.

| Punto de control | Cuándo corre | Quién lo ejecuta | ¿Se puede saltear? | Cubre | Estado en Speco |
|---|---|---|---|---|---|
| **Hook de Spec Kit** (`before_implement`) | Al pedir `/speckit-implement` | El **agente**, porque el prompt se lo indica | Sí: depende de que el agente siga la instrucción | Cualquier agente que use Spec Kit | ⬜ falta la extensión (T-026) |
| **Hook de Claude Code** (`UserPromptSubmit`, plugin) | Al escribir un prompt que pide implementar | El **harness** de Claude Code | No desde el agente | Solo Claude Code | ✅ `plugin/hooks/hooks.json` (sin probar en cliente real, T-001) |
| **Instrucciones** (`AGENTS.md`, `.cursor/rules`, Copilot) | Siempre que el agente lea el archivo | El **agente** | Sí | Cursor, Codex, Copilot | ✅ `specreview init --agents` |
| **Git pre-commit / pre-push** | Al commitear o pushear | **git**, en la máquina | Sí, con `--no-verify`, y solo si se instaló | Cualquier persona o agente que commitee | ✅ `specreview gate --install-hook pre-commit\|pre-push` |
| **CI** (GitHub Action) | En cada PR | El runner de CI | No, si el check es requerido para mergear | Todo el equipo | 🟡 `action.yml` existe; falta tag `@v1` y Actions está frenado por facturación |
| **GitHub App en la PR** (`docs/32`) | En cada PR que cambia una spec | Nuestro servicio | No (es un comentario; frenar exige un check requerido) | Todo el equipo, incluido producto | ✅ `speco-pr-review` (comentario; todavía sin check run) |

Lectura:
- **Antes de escribir código**, lo único que no depende de la buena voluntad del agente es el hook del harness (Claude Code). El hook de Spec Kit y las instrucciones son pedidos al agente: un agente obediente los respeta, uno distraído no.
- **Antes de que llegue a `main`**, git pre-push y CI son controles duros. La App en la PR es la capa **visible para producto**: dice qué cambió en el negocio, no solo «pasa o no pasa».
- No compiten: se apilan. Un equipo serio usaría el hook de Spec Kit (o el de Claude Code) **y** un control en la PR.

## 3. `/speckit-analyze` contra Speco

`/speckit-analyze` es el chequeo de consistencia que trae Spec Kit: compara spec, plan, tasks y la constitución. Ahí sí hay superposición con las reglas `COV` y `CON` de Speco.

| | `/speckit-analyze` | Speco |
|---|---|---|
| Qué es | Un prompt que ejecuta el agente del desarrollador | Motor determinista; el modelo es opcional (`D-001`, `D-003`) |
| Repetible | El resultado puede variar entre corridas | El mismo cada vez: sirve como gate y en CI |
| Qué mira | El estado actual de la spec | También **qué cambió entre dos versiones**: «10,000 → 15,000» y la tarea que quedó con el valor viejo (spec 026) |
| Contra qué compara | Spec, plan, tasks, constitución | Lo mismo, más **decisiones y objetivos de producto** (`product/`, `PRD00x`) |
| Memoria | Ninguna | Aprobaciones auditables con hashes encadenados (spec 010) |
| Dónde se ve | La terminal del desarrollador | La PR, la app y el MCP |
| Para quién | Quien programa | Quien decide qué se construye |

**Riesgo honesto:** si Spec Kit mejora `/speckit-analyze` y lo lleva a las PRs, la parte de «linter de specs» pierde valor. La defensa está en lo que Spec Kit no modela: el diff de intención entre versiones, la memoria de decisiones, las aprobaciones y el público no técnico. Es la apuesta de «Cursor para producto» (`docs/31`).

## 4. Qué hacer

> Los workflows de Spec Kit cambian el punto 1: un paso del workflow lo ejecuta el motor, no el agente. Ver `docs/36`.

1. **Ser una extensión de Spec Kit** (T-026): un comando `speckit.speco.gate` que corra `specreview gate` y salga con error si hay bloqueantes, publicado con un `before_implement` obligatorio de ejemplo. Lleva el freno a todos los agentes que usan Spec Kit, sin un plugin por cliente.
2. **Un `after_implement` opcional** que muestre `specreview diff`: lo que la implementación va a decirle a producto en la PR, antes de abrirla.
3. **Un check run en la PR** desde la App, además del comentario, para que un repo pueda exigirlo antes de mergear. Necesita el permiso *Checks: write* en `deploy/github-app/manifest.json`.
