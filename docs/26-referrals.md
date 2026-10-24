# 26 · Referidos (spec 021, `D-015`)

Cada persona tiene un enlace `/r/<código>`. Cuando alguien invitado llega a su **primer resultado** (su primer retrato o su primera revisión registrada), las dos empresas reciben créditos (spec 020).

## El recorrido
1. **Enlace.** `public.my_referral_code()` crea un código al azar de 12 caracteres, estable por persona. *Ajustes → Uso* lo muestra con un mensaje listo para copiar.
2. **Página pública** `/r/:code` (`ReferralLanding`): dice que alguien invitó, **nunca quién**, y guarda el código 30 días en el navegador.
3. **Alta.** Tras el primer inicio de sesión la app entrega el código al servicio (`POST /api/referrals/claim`) **antes** de crear la empresa. El servicio lo registra como *pendiente* solo si la cuenta es **nueva** (creada hace menos de 24 h y sin ninguna empresa), no es la misma persona ni comparte teléfono, y nunca fue invitada antes. La hora en que se abrió el enlace viene del navegador y no se usa.
4. **Premio.** Al primer retrato o primera revisión guardada, el worker llama `referral_activate(org)`: 20 créditos a la empresa invitada y 20 a la primera empresa de quien invitó, **una sola vez** (cada concesión tiene una causa única). Se avisa a quien invitó.

## Reglas contra el abuso
| Intento | Qué lo frena |
|---|---|
| Invitarse a sí mismo | Misma cuenta o mismo teléfono → no se registra |
| Cuentas vacías | No hay premio hasta el primer resultado |
| Cuenta existente que abre un enlace | No se registra (debe ser nueva y sin empresa) |
| Fábrica de créditos | Tope de 10 premios por mes y persona (200 créditos); los créditos de referido son de la empresa que los recibe, no se transfieren, no se canjean y **vencen a los 6 meses** |
| Abuso en curso | `referrals_enabled = 0` frena nuevos registros; lo ya debido se sigue pagando |

Con el tope alcanzado la empresa invitada **igual recibe** su premio.

## Sin empresa todavía
Si quien invitó no tiene empresa cuando el premio vence, queda **retenido** y se entrega a la primera que cree en los siguientes 12 meses.

## Configuración (`plan_settings`)
`referral_reward` 20 · `referral_monthly_cap` 10 · `referral_expiry_months` 6 · `referral_window_hours` 24 · `referral_held_months` 12 · `referrals_enabled` 1.

## Privacidad
Las tablas están cerradas: nadie puede leer quién invitó a quién. La persona ve solo **cuántos** se registraron y cuántos llegaron al primer resultado, los créditos ganados y los premios que le quedan este mes (`referral_summary`).

## Qué no verifica
- El **teléfono verificado** (spec 017) todavía no está implementado en el servicio: el control de "mismo teléfono" usa `auth.users.phone` cuando existe y la unicidad del proveedor de inicio de sesión.
- Una segunda cuenta con **otro** número real puede llegar a invitar: lo acotan el tope mensual, el primer resultado y el vencimiento, no se evita por completo.
- El premio en el navegador no se recorre de punta a punta (conectar un repositorio de la persona invitada); el worker y los saldos se prueban con Postgres real en `tests/cloud/test_referrals.py`.
