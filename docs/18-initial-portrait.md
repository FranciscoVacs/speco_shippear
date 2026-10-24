# 18 · Retrato inicial de reglas de negocio (spec 014)

Responde a «¿qué hace hoy nuestro software?» en **reglas de negocio** que una persona confirma, y avisa cuando un cambio posterior toca una regla ya
decidida. Es la garantía 1 de la tesis (`docs/16-thesis.md`): *lo decidido no cambia sin una decisión*. Objetivo `G-9`, decisión `D-009`:
**lo que propone una máquina es una propuesta; sólo una persona lo convierte en baseline.**

## El flujo
| Paso | Qué pasa | Quién |
|---|---|---|
| 1. Conectar | La GitHub App se instala (docs/17). El primer sync lee el HEAD del branch y guarda el **inventario** (archivos por tipo, sólo por nombre) | automático |
| 2. Proponer | El job `portrait` propone reglas desde (a) los requisitos de specs que dicen `Status: Implemented` y (b) **sólo con consentimiento**, desde un puñado de archivos de código vía un modelo | automático |
| 3. Verificar | Cada propuesta debe **citar textualmente** las líneas que la respaldan, en un archivo que exista en ese commit; si no, se descarta | automático |
| 4. Confirmar | Cola «Tu turno»: **confirmar / corregir / rechazar** (rechazar pide motivo). Queda en un registro append-only con quién, cuándo y qué cambió | approver, admin, owner |
| 5. Congelar | `freeze_baseline`: foto inmutable de las reglas **confirmadas** con el hash de sus líneas de evidencia, y un hash del conjunto | approver, admin, owner |
| 6. Vigilar | En cada sync se comparan los hashes de las líneas de evidencia. Cambió o desapareció ⇒ **hallazgo de drift** que nombra la regla; si las líneas sólo se movieron, se siguen sin avisar | automático |
| 7. Reconocer | Un decisor reconoce el hallazgo **con un motivo** («los dueños decidieron abrir las invitaciones») | approver, admin, owner |

## Garantías que hace cumplir la base (no sólo el código)
- El servicio **sólo puede insertar propuestas**: `status`, `decided_by` y la numeración no son columnas insertables, así que no puede crear una regla «confirmada».
- Una regla leída del código **nunca** tiene confianza `high` hasta que una persona la confirma (CHECK en la tabla).
- Las decisiones y los baselines son **append-only** (privilegios + triggers); ni el servicio ni el dueño de la tabla los reescriben.
- La misma regla (texto normalizado) no se crea dos veces por repo, ni siquiera si ya fue rechazada.
- El consentimiento para analizar código (`set_code_consent`) es de owner/admin, queda con quién y cuándo, y se puede retirar; sin él **ningún código sale hacia un modelo**.

## Qué se envía al modelo (NFR-001)
Sólo con consentimiento del repo, hasta **30 archivos / 300 KB**, elegidos por nombre (billing, payment, permission, limit, notify, refund…), nunca tests ni
`vendor`/`node_modules`. Los archivos se presentan como *datos* y la respuesta se valida; aun así, la inyección de prompts desde el repositorio se
**mitiga, no se elimina** (marco de datos + evidencia textual verificada + confirmación humana).

## API (todas con el token de Supabase; RLS decide qué ve cada quien)
`GET /api/orgs/{id}/inventory` · `GET /api/orgs/{id}/rules?status=` · `POST /api/rules/{id}/decision` · `POST|GET /api/orgs/{id}/baselines` ·
`GET /api/baselines/{id}` · `GET /api/orgs/{id}/drift` · `POST /api/drift/{id}/acknowledge` · `POST /api/repos/{id}/consent` · `POST /api/repos/{id}/portrait`.
Con el modelo opcional: `ANTHROPIC_API_KEY` (+ `SPECO_MODEL`) en el worker; sin él, el retrato igual sale de las specs implementadas.

## Límites honestos
- **No probado con un modelo real**: los tests usan uno falso que *miente* a propósito para probar las salvaguardas (cita inventada, archivo inexistente). La utilidad —recall, costo, calidad de redacción— está por medir en repos reales.
- Sólo se analizan los archivos que sugiere el nombre; una regla en un lugar inusual se pierde.
- El drift detecta que **cambiaron las líneas de evidencia**, no que cambió el comportamiento: una regla repartida por varios archivos puede cambiar sin tocar su evidencia. Es una señal para que alguien mire, no un veredicto.
- Falta la UI (cola de confirmación, baseline, drift) en la app web; hoy es sólo API.

## La pantalla (`/portrait`, spec 014 parte 3)
En la app web, **Más → Retrato inicial** (también en la paleta `Ctrl/Cmd+K` y como aviso en *Decisiones*: «6 reglas de tu software actual esperan tu confirmación»).
- **Primera vista:** cuatro números (esperan tu decisión · confirmadas · cambios sin decidir · línea base) y, arriba de todo si existen, los **cambios sin decidir** (una regla confirmada cuyo código cambió). Después **Tu turno**: una tarjeta por regla, de mayor a menor riesgo, con *dónde lo vimos* (archivo:línea y el código citado) y **Confirmar / Corregir / Rechazar**. Las deducidas del código llevan el aviso «es una hipótesis hasta que la confirmes».
- **A un clic (D-006):** Confirmadas, Rechazadas, Línea base (congelar, lista con hash) y Repositorios (inventario y el permiso para que un modelo lea el código, apagado por defecto).
- **Hoy es una demo en el navegador** (`src/portrait/demo.ts`, rotulada): mismas reglas que la base (rechazar pide motivo, una corrección no puede copiar otra regla, el mismo conjunto da el mismo hash, reconocer un cambio pide motivo). Falta el segundo backend que hable con la API de `cloud/`, que necesita el inicio de sesión de Supabase en la app.
- Verificado en navegador real con `web/scripts/verify-portrait.mjs`.
