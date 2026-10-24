# 30 · Planes y facturación (spec 024, `D-017`)

Un plan pago cambia **cuánto modelo puede usar una empresa**: da más créditos por período y un tope diario más alto. El cobro es **simulado** hasta que exista un proveedor real (hoy no se puede cobrar desde Argentina con Stripe); todo lo demás —planes, facturas, renovaciones, cancelación, gracia— es real y funciona igual con cualquier proveedor.

## Cómo se prende
Está **apagado por defecto**: sin proveedor no se vende nada y la app se comporta como en la spec 020 (el botón *Mejorar plan* solo registra el interés).

```
SPECO_BILLING_PROVIDER=simulated     # servicio y worker
```
Cualquier otro valor **frena el arranque** (un error de tipeo no debe prender ni apagar el cobro en silencio). **No lo prendas en un despliegue público**: con el proveedor simulado cualquier dueño se da un plan pago gratis.

## Los planes (tabla `plan_catalog`, se cambian sin desplegar)
| Plan | Precio | Créditos por período | Tope diario |
|---|---|---|---|
| `hobby` (gratis) | 0 | bienvenida + mensuales (spec 020) | `plan_settings.daily_cap` (40) |
| `pro` | 29 USD | 600 | 120 |
| `team` | 99 USD | 2400 | 480 |

Son supuestos para ajustar con uso real. Un crédito cuesta como mucho ~0,02 USD (`docs/24-growth-gtm.md`), así que Pro cuesta como máximo ~12 USD de modelo y Team ~48.
```sql
update public.plan_catalog set period_credits = 800 where plan = 'pro';
```

## Cómo se conecta con el uso de tokens (spec 020)
- Toda empresa se mide ahora: `reserve_credits` reserva, `settle_credits` cobra lo realmente usado. Una empresa paga **sin créditos de plan no tiene pase libre** (`no_credits`).
- Al aceptarse un cobro, `start_plan` otorga los créditos del plan (`credit_grants.source = 'plan'`) que **vencen al terminar el período más 3 días de gracia** (`plan_settings.billing_grace_days`). Los créditos se gastan primero los que antes vencen, igual que siempre.
- El tope diario sale del plan. El presupuesto mensual global (`monthly_budget`) protege **solo al plan gratis**.
- `GET /api/orgs/{id}/credits/status` y `/credits` dicen `billing` (si hay checkout) y `next_renewal`, que para una empresa paga es el **fin de su período**. El botón *Mejorar plan* de la píldora, del chat y de Uso lleva a *Ajustes → Planes*.
- Al mejorar de Pro a Team los créditos de Pro **no se quitan** (vencen solos); al volver al plan gratis, lo que quede del plan **termina** en ese momento.

## Qué pasa en cada caso
| Caso | Resultado |
|---|---|
| Subir de plan | Se cobra **primero**; solo si se acepta cambia el plan, abre un período nuevo desde ahora, escribe la factura y otorga los créditos (una función, todo o nada). |
| Subir desde un plan pago | Se cobra el precio nuevo **menos la parte sin usar** del período (por segundos), nunca menos de 0. |
| Pago rechazado | No cambia nada; queda una factura `failed`. |
| Mismo pedido dos veces | Se cobra y se otorga **una vez** (clave de idempotencia por empresa + última factura pagada; índice único). |
| Bajar o cancelar | Se **programa** para el fin del período (`subscriptions.scheduled_plan`; `hobby` = cancelar). Se puede deshacer pidiendo el plan actual. |
| Renovación | El worker (cada hora) cobra una vez, abre el período siguiente y otorga los créditos; lo que sobró del anterior termina. |
| Renovación rechazada | La empresa conserva el plan y sus créditos **3 días**, se reintenta **una vez por día**, se avisa a los dueños **una vez** (`payment_failed`); pasada la gracia vuelve al plan gratis (`plan_ended`). |
| Empresas que ya eran pagas | La migración les crea una suscripción `manual` con los créditos de su plan; renuevan sin cobro (aunque el cobro esté apagado). |

## API
| Ruta | Quién | |
|---|---|---|
| `GET /api/billing/plans` | cualquier persona con sesión | lista de precios; `enabled`, `simulated` |
| `GET /api/orgs/{id}/billing` | dueños y admins | plan, suscripción, `quotes` (qué cobraría hoy cada plan superior), facturas |
| `POST /api/orgs/{id}/billing/plan` `{plan, simulate?}` | dueños y admins | `upgraded` / `scheduled` / `resumed`; 402 `payment_declined`; 404 `billing_disabled`; 409 `same_plan` |

`simulate: "decline"` solo lo entiende el proveedor simulado (muestra una tarjeta rechazada). Las tablas las escribe solo el servicio; los dueños y admins las leen por RLS.

## El proveedor de pagos
Un proveedor es una clase con `name`, `simulated` y `charge(org_id, amount_cents, currency, key, description, outcome) -> Charge(ok, ref, failure)`; `key` es la clave de idempotencia (un proveedor real debe usarla). **Nunca se recibe ni se guarda un número de tarjeta**: la app no tiene formulario de tarjeta. `SimulatedProvider` acepta todo y rechaza si se lo piden o si la empresa está en `decline_orgs` (pruebas).

Para un proveedor real (Mercado Pago es el candidato obvio desde Argentina): una clase nueva con esa interfaz, un nombre en `provider_from_settings`, y un checkout alojado por el proveedor que confirme por webhook y llame a `start_plan` — el resto no cambia. Si `start_plan` falla después de un cobro aceptado, repetir el pedido usa la misma clave: el proveedor no cobra dos veces y el plan se aplica.

## Dar un plan a mano (operador)
```sql
select public.start_plan('<org>', 'pro', 'upgrade', 0, 'manual', null, false, null);
```
Crea la suscripción `manual` (renueva sin cobro) y otorga los créditos. Poner `organizations.plan = 'pro'` a mano **no alcanza**: sin créditos del plan la empresa queda en `no_credits`.

## Lo que falta (honesto)
- Cobro real, impuestos y comprobantes fiscales (las facturas son el registro del producto, no un documento fiscal).
- Un período es un mes calendario desde el día del cobro (el 31 pasa al 28 y se queda ahí).
- Si se apaga el cobro con suscripciones vivas, no se terminan ni se renuevan (solo siguen las `manual`).
- Reintentar el pago ahora mismo (sin esperar el reintento diario) todavía no tiene botón.
- No hay créditos sueltos para comprar fuera del plan: el camino es subir de plan.
