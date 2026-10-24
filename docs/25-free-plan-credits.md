# 25 · Plan gratis con créditos (spec 020, `D-014`)

Lo que cuesta un modelo se mide en **créditos**; lo determinista (revisar specs, reglas, decisiones, aprobaciones, MCP de lectura) **nunca** pasa por acá.

## Cómo funciona
1. Una empresa nueva recibe **20 créditos de bienvenida** (vencen a los 30 días) y **30 mensuales** (vencen a fin de mes, no se acumulan).
2. Antes de llamar al modelo el servicio **reserva** el costo máximo (`reserve_credits`); al terminar **cobra lo realmente usado** y devuelve el resto (`settle_credits`). Si la llamada falla, libera todo.
3. Se gastan primero los créditos que **antes vencen**. El saldo nunca baja de cero y dos pedidos simultáneos para un saldo que paga uno se atienden en fila (la fila de la empresa se bloquea).
4. En cero el modelo se pausa y todo lo demás sigue: el retrato igual se arma con las reglas de las specs (`code_analysis: "paused: no_credits"`).

Un crédito son 10 000 tokens y la salida pesa 5 veces la entrada. Un retrato con modelo reserva como máximo **10 créditos** (30 archivos / 300 KB); un turno del asistente, **5**.

## Los topes (en la tabla `plan_settings`, se cambian sin desplegar)
| Clave | Por defecto | Qué hace |
|---|---|---|
| `welcome_credits` / `welcome_days` | 20 / 30 | Bienvenida |
| `monthly_credits` | 30 | Mensual, para empresas del plan gratis |
| `daily_cap` | 40 | Créditos que una empresa puede usar por día (UTC) |
| `monthly_budget` | 5000 | Tope de **todo** el plan gratis por mes; al agotarse se pausa el modelo **solo en gratis** (`CR003`) |

```sql
update public.plan_settings set value = 3000 where key = 'monthly_budget';
```
Las reservas liberadas no cuentan. Las empresas de planes pagos **sí se miden** desde la spec 024 (`docs/30-billing.md`): con los créditos y el tope diario de su plan y sin este presupuesto, que protege solo al plan gratis.

Los montos por corrida (`SPECO_PORTRAIT_CREDITS`, `SPECO_TURN_CREDITS`) son variables del servicio.

## Una empresa gratis por persona
`free_plan_claims` guarda quién ya usó su plan gratis, aunque después borre la empresa. La segunda empresa de la misma persona se crea igual pero **sin créditos gratis** (`organizations.free_plan = false`).

## Códigos de rechazo (`credits.CreditsRefused`)
`CR001` no alcanzan los créditos · `CR002` tope diario · `CR003` presupuesto mensual del plan gratis.

## Qué ve la gente
- `GET /api/orgs/{id}/credits` (solo dueños y administradores): saldo, de dónde vienen, próxima renovación, usos recientes. La base lo impone con RLS.
- `GET /api/notices`: avisos de la persona. Cuando queda menos de un quinto de lo otorgado, los dueños reciben **un** aviso por mes (`low_credits`).
- Pantalla *Ajustes → Uso* en modo cloud.

## Operación
El worker corre `grant_monthly_credits()` cada hora (idempotente: una concesión por empresa por mes).

## El asistente de la empresa
`POST /api/orgs/{id}/assistant` (cuerpo `{messages, feature?, focus?}`) responde un turno por SSE (`{delta}`, luego `{done}` o `{error}`), igual que el asistente local.
- **Contexto:** sin `feature`, lo que la empresa tiene esperando una decisión (reglas propuestas, cambios sin decidir, features bloqueadas), como datos y no como instrucciones. Con `feature`, su última revisión y sus archivos.
- **Quién:** dueños, admins, aprobadores y miembros. Un *viewer* recibe 403, quien no es miembro 404, un token de agente 403.
- **Cobro:** reserva 5 créditos **antes** de llamar al modelo (402 con `no_credits`, `daily_cap` o `budget` y nada se envía al modelo); después cobra los tokens que el proveedor informó. Si el proveedor falla, se cobra lo que ya había producido (nada si no produjo nada); si la persona se va a mitad, paga lo ya generado.
- **Tamaño (FR-007):** un turno nunca envía más de 40 000 tokens de entrada (estimación pesimista de 3 caracteres por token): primero se descartan los mensajes más viejos, después los datos. Respuesta de hasta 2000 tokens.
- `GET /api/assistant` dice si el servicio tiene modelo (`ANTHROPIC_API_KEY`); sin él, el chat de la app vuelve al simulado.
- En la app (modo cloud) el chat de Inicio y el panel usan este asistente; el feature y el foco de las pantallas de demostración no se envían.
- Una reserva que quedó abierta por una caída se libera sola a los 30 minutos (`release_stale_reservations`, la corre el worker cada hora).

## Modelo y esfuerzo por turno (composer del chat)
El composer deja elegir **qué modelo** responde y **cuánto piensa** (bajo / medio / alto). Lo decide quien opera el servidor, no el navegador:
- **Se activa a propósito:** `SPECO_MODELS=claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5` (servicio cloud) o `--models` / `SPECO_MODELS` (servidor local, solo con `--llm anthropic`). Sin eso `GET /api/assistant` no trae `models`, el chat muestra un solo modelo y todo funciona como antes. Un id que no está en el catálogo (`specreview/models.py`) falla al arrancar.
- **Qué se acepta:** el cuerpo del turno puede traer `model` y `effort`. Un modelo que no se ofreció, o un esfuerzo que no existe, se **rechaza con 400** (nunca se reemplaza en silencio: la persona tiene que saber quién respondió). Un esfuerzo que el modelo no tiene se descarta. Sin `model` ni `effort`, el turno es idéntico al de antes (modelo por defecto, 2000 tokens de respuesta, reserva de 5).
- **Espacio de respuesta:** el pensamiento cuenta contra `max_tokens`, así que sube con el esfuerzo: 4 000 (bajo), 8 000 (medio), 16 000 (alto).
- **Cuánto cuesta:** el crédito se calibró con un modelo de 2 USD por millón de tokens de entrada; cada modelo gasta créditos según su precio relativo (`weight`): Haiku 5.5 ×0,05, Sonnet 5.5 ×1, Opus 5.5 ×2. Se cobra `ceil(tokens ponderados × weight / 10 000)`, mínimo 1 si se usó algo.
- **Reserva:** con elección, lo máximo que ese turno puede gastar: `(40 000 + 5 × max_tokens) × weight / 10 000`. Sonnet con esfuerzo medio reserva 8; Opus con esfuerzo alto, 24; Haiku con esfuerzo bajo, 1. Si el saldo no alcanza para esa reserva, 402 `no_credits` sin llamar al modelo (un saldo chico puede pagar Haiku pero no Opus en esfuerzo alto).
- Los precios del catálogo son una suposición, como el costo por crédito: verificarlos contra la lista vigente.

## Indicadores y avisos en la app (modo cloud)
- **Píldora en la barra superior** (`CreditsPill`): saldo, barra y color (normal / amarillo / rojo). Al abrirla: cuántos créditos de cuántos otorgados, **cuándo se renuevan** (`Se renuevan el 1 nov (en 16 días)`), *Mejorar plan*, *Invitar y ganar créditos* y *Ver detalle*. La ven dueños, admins, aprobadores y miembros; un *viewer* no. Se actualiza sola con cada respuesta del asistente y al volver a la pestaña.
- **Avisos en el chat** (`CreditsBanner`, sobre el composer de Inicio y del panel):
  - *Estás llegando a tu límite* (amarillo, se puede cerrar): queda menos de una quinta parte de lo otorgado.
  - *Llegaste a tu límite* (rojo, no se cierra): no alcanza para otra respuesta, o el último turno fue rechazado. Variantes para el tope del día, la pausa del plan gratis y la empresa sin créditos gratis. Siempre dice cuándo vuelven y que revisar, decidir y aprobar siguen funcionando.
- **`GET /api/orgs/{id}/credits/status`** (cualquiera que pueda usar el asistente) devuelve `balance`, `granted`, `level` (`ok | near | full`), `next_renewal`, `can_upgrade`. El detalle (de dónde vienen, usos) sigue siendo solo de dueños y admins. Cada respuesta del asistente termina con un evento `{credits: ...}` con el mismo resumen **ya cobrado**.
- **Nivel:** `near` si queda menos de 1/5 de lo otorgado; `full` si lo que queda no paga un turno (un turno reserva 5).
- **Mejorar plan:** todavía no hay cobro, así que el botón (solo dueños y admins) **registra el interés** en `upgrade_interest` (una vez por lugar y día: `pill`, `chat_warning`, `chat_limit`, `usage`) y avisa a la persona. Es la medida del experimento E7 de `docs/24-growth-gtm.md`. Si se define `VITE_UPGRADE_URL`, además abre esa dirección. Con el cobro prendido (spec 024, `SPECO_BILLING_PROVIDER`) el botón lleva a *Ajustes → Planes*.
- *Ajustes → Uso* muestra la misma barra, el reinicio y el botón.

```sql
-- cuántos pidieron mejorar, y desde dónde
select source, count(*) from public.upgrade_interest group by 1 order by 2 desc;
```

## Lo que falta (honesto)
- El costo por crédito es una suposición: verificarla contra el precio vigente del modelo.
- El indicador (`turn_cost`, nivel `full`) sigue hablando de la reserva por defecto (5): con un modelo o un esfuerzo caros, una respuesta puede ser rechazada con saldo `ok`; el rechazo lo explica en el chat. Falta que el indicador conozca la elección de la persona.
- Los costos reales por crédito dependen de que el cliente de modelo informe el uso (`take_usage` en el retrato, el `usage` del turno); un cliente que no informe se cobra completo.
- Si la persona cierra la pestaña a mitad de un turno, el cobro se hace cuando el servidor cierra el stream; si el proceso muere antes, la liberación automática devuelve los créditos.
