# 28 · Quickstart para desarrolladores: del cero al primer hallazgo en 5 minutos

Para quien programa (o dirige un agente que programa) y quiere ver valor **antes** de leer nada más. Tres pasos, cada uno
termina con algo visible. Todos los comandos de esta página están probados.

> **Qué hace, en una línea:** lee `spec.md` / `plan.md` / `tasks.md` de [Spec Kit](https://github.com/github/spec-kit) y te dice,
> **antes de escribir código**, qué requisito nadie va a implementar, qué task es scope colado, qué requisito no se puede testear
> y qué dos requisitos se contradicen. Es determinista y offline: sin API keys, sin cuenta.

## Requisitos
- Python ≥ 3.11 y [`uv`](https://docs.astral.sh/uv/) (recomendado) o `pip`. Nada más: `specreview` no tiene dependencias.
- Para el paso 2, un cliente MCP (Claude Code, Cursor, VS Code, Claude Desktop, Codex…).
- Un repo con `specs/NNN-x/spec.md` **no hace falta** para el paso 1: `specreview demo` trae su propio ejemplo.

---

## Paso 1 · Verlo funcionar (60 segundos, sin clonar ni instalar nada)

```bash
uvx --from git+https://github.com/agustindelmonti/speco.ia specreview demo
```
`demo` copia un ejemplo incluido en el paquete (una spec de transferencias bancarias) a una carpeta temporal y lo revisa. No necesita
repo propio, red (después de bajar el paquete) ni API keys. `specreview demo --all-findings` muestra también advertencias y
sugerencias; `--dir ./mi-demo` lo copia a una carpeta que elijas para que lo edites.

Salida real:

```
Spec review · 006-wire-transfer-limits
11 requisitos · 2 stories · 4 pasos de plan · 7 tasks

BLOQUEANTE  FR-003 + FR-004  spec.md:53  CON001  FR-003 y FR-004 se contradicen: valores distintos para lo mismo: «5,000 USD» vs «10,000 USD».
            ↳ Decidir cuál vale y eliminar o corregir el otro
BLOQUEANTE  FR-007           spec.md:57  COV001  FR-007 no tiene correlato en el plan ni en las tasks: nadie lo va a implementar.
            ↳ Agregar el paso/task que lo implementa (citando FR-007), o quitar el requisito si ya no aplica
```

Eso es todo el producto en miniatura: un límite de transferencias que la spec define con dos valores distintos y un requisito
de compliance que ninguna task implementa. Cuesta minutos arreglarlo hoy y semanas después de que el agente lo implemente mal.

Más ejemplos (hay que clonar el repo: `git clone https://github.com/agustindelmonti/speco.ia`): `examples/invitations`
(6 bloqueantes), `examples/subscriptions` (con capa de producto), `examples/loyalty-points`, `examples/invoice-exports`,
`examples/push-notifications`; se corren con `specreview examples/<nombre> -v`.

### Instalarlo de verdad
Todavía no está en PyPI; se instala desde GitHub:

```bash
uv tool install git+https://github.com/agustindelmonti/speco.ia     # comando `specreview` global
# o sin instalar, siempre la última:
uvx --from git+https://github.com/agustindelmonti/speco.ia specreview --version
# o con pip:
pip install git+https://github.com/agustindelmonti/speco.ia
```

### Sobre tu repo
```bash
cd tu-repo-con-spec-kit
specreview .            # la feature más nueva de specs/
specreview . --all      # todas, con tabla resumen
specreview . -v         # + cómo arreglar cada hallazgo
specreview --explain COV001     # qué significa una regla (--rules las lista todas)
```
`specreview` sale con exit code 1 si hay bloqueantes, 0 si no: ya sirve en un script o en un pre-commit.
**Si tu repo ya tiene deuda:** `specreview baseline` registra lo actual y desde ahí sólo ves lo nuevo ([`docs/10`](10-adoption.md)).

---

## Paso 2 · Conectar el MCP a tu agente (2 minutos)

El MCP deja que **el agente de código se revise la spec solo**, dentro de su propio bucle, antes de implementar. Es un servidor
local por stdio, de sólo lectura: no manda tu código a ningún lado.

El comando que todos los clientes necesitan es el mismo:

```
uvx --from git+https://github.com/agustindelmonti/speco.ia specreview mcp .
```
(Si ya hiciste `uv tool install`, alcanza con `specreview mcp .`.)

### Claude Code (recomendado: plugin = MCP + comando + skill + gate)
```
/plugin marketplace add agustindelmonti/speco.ia
/plugin install specreview@specreview
```
Con esto tenés, de una vez:
- las 7 herramientas MCP,
- el comando **`/review-spec [feature]`**: arregla los bloqueantes *en la spec* y repite hasta que no queden,
- la skill `spec-review`: el agente llama `get_blockers` solo antes de implementar y `check_requirement` al escribir requisitos,
- un hook que **frena `/speckit.implement`** (exit 2, con los bloqueantes en pantalla) mientras la spec tenga bloqueantes.

Sólo el MCP, sin el resto:
```bash
claude mcp add specreview -- uvx --from git+https://github.com/agustindelmonti/speco.ia specreview mcp .
```

### Cursor — `.cursor/mcp.json`
```json
{
  "mcpServers": {
    "specreview": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/agustindelmonti/speco.ia", "specreview", "mcp", "."]
    }
  }
}
```

### VS Code (Copilot) — `.vscode/mcp.json`
```json
{
  "servers": {
    "specreview": {
      "type": "stdio",
      "command": "uvx",
      "args": ["--from", "git+https://github.com/agustindelmonti/speco.ia", "specreview", "mcp", "."]
    }
  }
}
```

### Claude Desktop — `claude_desktop_config.json`
Acá el directorio de trabajo no es tu repo: poné la **ruta absoluta**.
```json
{
  "mcpServers": {
    "specreview": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/agustindelmonti/speco.ia", "specreview", "mcp", "/ruta/absoluta/a/tu-repo"]
    }
  }
}
```

### Codex CLI — `~/.codex/config.toml`
```toml
[mcp_servers.specreview]
command = "uvx"
args = ["--from", "git+https://github.com/agustindelmonti/speco.ia", "specreview", "mcp", "/ruta/absoluta/a/tu-repo"]
```

### Cursor, VS Code, Codex y otros: que el agente use la revisión
Fuera de Claude Code no hay hook que frene `/speckit.implement`: el agente tiene las herramientas MCP pero **nada le dice que las use**. Dos capas:

1. **Instrucciones** (persuasión: el agente puede ignorarlas). Un comando las escribe donde cada agente las lee (`AGENTS.md` para Codex y la mayoría, `.cursor/rules/specreview.mdc`, `.github/copilot-instructions.md`), sin pisar lo que ya tengas: el bloque va entre marcas y volver a correrlo sólo lo actualiza.
```bash
specreview init --agents                # los tres archivos
specreview init --agents agents-md,cursor   # sólo algunos
```
2. **Enforcement** (no depende del agente). El gate como hook de git, que frena el commit o el push mientras la spec tenga bloqueantes:
```bash
specreview gate --install-hook pre-push     # o pre-commit; agrega el gate a un hook existente sin pisarlo
```
Y el check de PR (`specreview init` deja el workflow) como red de seguridad final: es el único gate que ningún IDE puede saltear.

### Comprobar que quedó bien (sin cliente)
```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | specreview mcp . | tail -1
```
Debe listar las 7 herramientas. En el cliente: Claude Code `/mcp`, Cursor *Settings → MCP*, VS Code *MCP: List Servers*.

### Qué le da al agente

| Herramienta | Cuándo la usa el agente |
|---|---|
| `get_blockers(feature?)` | **Antes de implementar.** `can_implement` + sólo los bloqueantes. |
| `review_feature(feature?, min_severity?)` | El reporte completo (mismo JSON que `-f json`). |
| `list_features()` | Qué features hay y cuáles se pueden implementar. |
| `check_requirement(text)` | **Al escribir** un requisito: patrón EARS, ambigüedad, testeabilidad. |
| `explain_rule(rule)` | Qué significa `COV001`/`QUA002`… y cómo se arregla. |
| `product_overview()` | Objetivos de producto ↔ features (opt-in, carpeta `product/`). |
| `approval_status(feature?)` | Si una feature está aprobada y si la spec cambió desde entonces. Sólo lectura. |

La feature se nombra por prefijo (`003`). Usa el mismo `specreview.toml`, baseline y waivers que el CI, así que el agente ve lo
mismo que va a ver el PR.

### Primer prompt para probarlo
Abrí tu repo con el agente y pegá:

> Revisá la feature `003` con specreview antes de implementar. Arreglá los bloqueantes en la spec (no en el código) y
> mostrame las decisiones de producto que no puedas tomar vos como preguntas concretas.

Con el plugin de Claude Code: `/review-spec 003`.

---

## Paso 3 · Que lo vea todo el equipo: CI en cada PR (1 minuto)

```bash
specreview init           # crea specreview.toml + .github/workflows/specreview.yml
specreview baseline       # (si hay deuda) registrar lo actual: de acá en más sólo lo nuevo
git add -A && git commit -m "Add specreview" && git push
```
En cada PR que toque `specs/**` queda **un** comentario que se actualiza (no se acumula), anotaciones en el diff vía SARIF y el
check falla si hay bloqueantes. Detalle en [`docs/10-adoption.md`](10-adoption.md).

---

## Si algo no anda

| Síntoma | Causa y arreglo |
|---|---|
| `error: no encontré features (specs/*/spec.md)` | Pasá la raíz del repo o la carpeta de la feature (`specs/003-x`). El mensaje busca features cerca y te sugiere el comando (`Probá: specreview examples/wire-transfers`); si no hay ninguna, sugiere `specreview demo`. |
| El cliente MCP dice que no conecta | Probá el comando a mano (sección *Comprobar*). Si `uvx` no está: `curl -LsSf https://astral.sh/uv/install.sh \| sh`. En Claude Desktop usá ruta absoluta. |
| El MCP funciona pero ve "0 features" | El `.` del config se resuelve contra el directorio donde el cliente lanza el proceso. Poné la ruta absoluta. |
| Un hallazgo "inferido por texto" parece falso positivo | Spec Kit no vincula tasks con requisitos; se infiere por similitud. Citá el id en la task (`… (FR-005)`) y desaparece. Ver [`docs/04`](04-real-repo-calibration.md). |
| Querés silenciar algo a propósito | `specreview waive <fingerprint> --reason "…"` (queda en el repo, se revisa en el PR) o `disable_rules` en `specreview.toml`. |

## Y ahora
- **Dentro de la app:** Ayuda → *Para desarrolladores* (`/docs/developers`) tiene esta misma guía con selector de cliente MCP, snippets para copiar y las recetas con salida real; también se llega con `Ctrl/Cmd+K` → «desarroll…».
- **Qué podés lograr con esto, con casos concretos:** [`docs/29-developer-recipes.md`](29-developer-recipes.md).
- Todas las reglas: `specreview --rules`. Detalle del MCP y del plugin: [`docs/11`](11-mcp-and-plugin.md).
- El MCP **remoto** de Speco (la memoria de decisiones de tu empresa, también sólo lectura): [`docs/22`](22-speco-on-speco.md).
