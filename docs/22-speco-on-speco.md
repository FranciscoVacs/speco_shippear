# 22 · Speco sobre Speco (spec 018)

Objetivo `G-12`: el repositorio de Speco es la **primera empresa** que se conecta a Speco, y los agentes que construyen Speco (Claude) consultan a Speco
mientras lo construyen. Todo lo que hacemos se prueba primero sobre nosotros.

## El MCP remoto
`POST {SERVICIO}/mcp` — Model Context Protocol sobre HTTP (JSON-RPC 2.0), **solo lectura**. Descubrimiento y autorización:

```
cliente (Claude)            Speco (servicio)                      Supabase Auth (servidor OAuth 2.1)
  │ POST /mcp sin acceso ─────▶ 401 + WWW-Authenticate: resource_metadata=…/.well-known/oauth-protected-resource/mcp
  │ GET metadata ─────────────▶ { authorization_servers: ["https://<ref>.supabase.co/auth/v1"] }
  │ GET /.well-known/oauth-authorization-server/auth/v1 ─────────────────────────────▶ endpoints, registro dinámico
  │ POST registro dinámico (Claude se registra solo) ────────────────────────────────▶ client_id
  │ navegador ▶ /oauth/authorize ─────────────────────────────────────────────────────▶ redirige a  {APP}/oauth/consent?authorization_id=…
  │                       persona: inicia sesión, ve qué puede/no puede el agente, «Permitir» ──▶ código (PKCE)
  │ POST /oauth/token ────────────────────────────────────────────────────────────────▶ access token (JWT con client_id)
  │ POST /mcp  Authorization: Bearer <token> ▶ tools/list, tools/call …  (corre COMO la persona)
```

### Qué puede y qué no puede un agente (D-012)
| Herramienta | Qué hace |
|---|---|
| `pending_decisions` | Qué espera una decisión: reglas propuestas, cambios a reglas confirmadas, features que necesitan decisión o están bloqueadas. **Leerla antes de implementar.** |
| `list_rules` · `list_features` · `get_review` · `list_baselines` · `list_drift` · `list_organizations` | Leer lo que la persona lee |
| `check_spec` | Revisar un **borrador** de spec (con plan y tasks opcionales) antes de implementarlo. No guarda nada |

**No hay ninguna herramienta que decida**, y no es solo una convención: la base **rechaza toda decisión** si el acceso lleva `client_id`
(`private.is_agent()`, migración `20261016000002`): `decide_rule`, `freeze_baseline`, `acknowledge_drift`, `set_code_consent`, `create_organization` y las
escrituras directas en miembros, organizaciones y aprobaciones. Supabase da a estos tokens el mismo alcance que la sesión de la persona (aún no hay
scopes propios), así que el límite lo ponemos nosotros, en la base. La API web también rechaza el acceso de un agente (`403`).
Verificado en un Postgres real y en el proyecto real de Supabase.

## Conectarlo a tu Claude (lo hacés vos: una sesión no puede agregarse un conector a sí misma)
1. **Supabase → Authentication → OAuth Server:** habilitado ✔. Configurá **Authorization Path** = `/oauth/consent` y **Site URL** = el origen de la web. Activá **Dynamic client registration** (así Claude se registra solo; revisá periódicamente los clientes registrados y que los redirect URIs sean confiables).
2. **Firma de JWT asimétrica** recomendada (Authentication → JWT Signing Keys). El servicio acepta HS256 y asimétrico; con `SUPABASE_URL` configurada valida además el **emisor** (`iss`).
3. Desplegá el servicio con `SUPABASE_URL`, `PUBLIC_URL` (la URL pública del servicio: va en la metadata) y `APP_URL`.
3b. **Dentro de la app:** la página «Conectar un agente» (`/agents`, menú «Más») muestra la dirección exacta para copiar y estos pasos, y lista los agentes ya conectados con «Quitar acceso».
4. **claude.ai → Settings → Connectors → Add custom connector:** `https://<servicio>/mcp`. Se abre el navegador en `…/oauth/consent`: iniciás sesión y tocás **Permitir**.
5. **Claude Code:** `claude mcp add --transport http speco https://<servicio>/mcp` y `/mcp` para autenticar.
6. Revocar: en `/oauth/consent` (sección «Agentes conectados») o desde el dashboard de Supabase. Al revocar se invalidan sus sesiones y refresh tokens.

Mientras tanto, para probar el ciclo **sin la nube**, el MCP local (`specreview mcp`, docs/11) sirve el mismo propósito sobre un checkout.

## El ciclo «Speco primero» para construir Speco
1. **Antes:** el agente llama `pending_decisions` y `check_spec` con el borrador de `specs/NNN-…/spec.md`. Las preguntas que haría adivinar a un agente se resuelven *antes*.
2. Implementa. El CI ya corre `specreview` en cada PR.
3. **Después del merge:** el worker lee `specs/`, el retrato propone reglas nuevas y, si una regla **confirmada** de Speco movió sus líneas de evidencia, aparece como *cambio sin decidir*.
4. Una persona decide. Los cambios a `product/` (objetivos, decisiones) los aprueba una persona; ningún agente los decide.

## Conectar el repo de Speco a Speco (para vos)
Instalá la GitHub App en `agustindelmonti/speco.ia` desde `/connect` de la empresa «Speco». El primer sync trae el inventario y propone el retrato; confirmá y congelá la
línea base de Speco: es el punto de comparación de todo lo que cambiemos después (`SC-003`).

## Qué NO está verificado
- Contra el **servidor OAuth real de Supabase** (registro dinámico, `/oauth/authorize`, canje del código, refresh): la prueba en navegador simula sus tres endpoints (`supabase-js` → `getAuthorizationDetails`, `consent`, `grants`) y los tokens se firman a mano con las claims documentadas.
- Contra **Claude** como cliente (el flujo del conector y la renovación de tokens).
- El endpoint implementa lo necesario del protocolo (initialize, ping, tools/list, tools/call; sin streaming de servidor) y no se probó con otros clientes MCP.
