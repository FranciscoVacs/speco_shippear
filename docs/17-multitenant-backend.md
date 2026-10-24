# 17 · Backend multi-tenant (spec 013)

Capa de datos para que muchas empresas usen el producto a la vez **sin ver los datos de las otras** (`G-8`, `D-008`). Postgres sobre
Supabase; el motor de revisión (`src/specreview`) sigue sin dependencias y no sabe de esto.

## Principio
**El aislamiento se hace cumplir en la base de datos** (RLS), no sólo en la API: un bug del servicio no puede filtrar filas de otra empresa.
Las FKs son compuestas `(org_id, x_id)`, así que una fila de la empresa A no puede apuntar a una de la B ni escribiendo directo con el rol de servicio.

## Modelo
| Tabla | Qué guarda | Quién la lee | Quién la escribe |
|---|---|---|---|
| `organizations`, `memberships` | empresas, personas y rol (`owner` `admin` `approver` `member` `viewer`) | miembros | `create_organization()`; owners/admins gestionan membresías |
| `github_installations`, `repositories`, `features` | lo que instala GitHub y las features de `specs/` | miembros | sólo `service_role` (webhooks/worker) |
| `spec_snapshots`, `reviews` | cada versión de la spec y su revisión | miembros | sólo `service_role` |
| `approvals` | decisiones encadenadas por hash (como `.specreview/approvals.jsonl`) | miembros | owners, admins y approvers, sólo como ellos mismos; **append-only** |
| `webhook_events` | entregas de GitHub, únicas por `delivery_id` | nadie con sesión | `service_role` |

## Reglas que garantiza la base
- Quien crea una empresa es su `owner`; una empresa **nunca queda sin owner**; sólo un owner entrega o quita ese rol.
- Rechazar, aprobar con condiciones o delegar **exige motivo**; aprobar con bloqueantes abiertos (`override`) también. Se delega sólo en quien puede aprobar.
- Cada decisión toma su posición y el hash de la anterior bajo un lock por empresa. **No se edita ni se borra** (ni siquiera con `service_role`; el dueño de la tabla lo frena un trigger).
- `select * from verify_approvals('<org>')` recorre la cadena y devuelve la primera posición que no coincide.
- Las entregas repetidas de GitHub se ignoran con `on conflict (delivery_id) do nothing`; sus payloads no son legibles con sesión.

## El servicio (`cloud/`, Python)
Paquete aparte (`speco-cloud`: FastAPI, psycopg, httpx, pyjwt); el motor `specreview` sigue sin dependencias (`D-008`).

| Endpoint | Para qué |
|---|---|
| `POST /webhooks/github` | Verifica la firma (`X-Hub-Signature-256`), guarda la entrega **antes** de procesarla y la marca hecha **después**: si falla, el reintento de GitHub la vuelve a correr; si ya estaba hecha, es un no-op |
| `POST /api/github/install-url` | Un owner/admin pide el enlace de instalación; lleva un `state` firmado y con vencimiento (10 min) que ata empresa + persona |
| `GET /github/setup` | Vuelta de GitHub: valida el `state`, confirma que esa persona sigue siendo owner/admin, consulta la instalación como App y guarda instalación + repos. Una instalación ya ligada a otra empresa da 409 |
| `GET/POST /api/orgs`, `GET /api/orgs/{id}/repositories` | La app web. La conexión se abre **como la persona** (`authenticated` + sus claims), así que RLS decide; quien no es miembro recibe 404 |

- **Eventos:** `installation` (suspender/borrar), `installation_repositories` (alta/baja de repos), `push` al branch por defecto (guarda el SHA y, si toca `specs/`, **encola un solo job** por repo aunque lleguen varios pushes). Los eventos de una instalación aún no ligada se guardan como `unlinked` y no se aplican.
- **Mínimo privilegio:** cada conexión baja a un rol antes de trabajar: `service_role` para el trabajo propio (no puede editar aprobaciones aunque el código tuviera un bug), `authenticated` para lo de las personas.
- **Credenciales:** GitHub App (JWT RS256 de 9 min) + token de instalación de 1 hora; no se guarda ninguna credencial de larga vida por cliente. Supabase: sólo se *verifica* su token (HS256 con `SUPABASE_JWT_SECRET`).
- **Cola:** `jobs` en Postgres, `claim_job()` con `FOR UPDATE SKIP LOCKED`; varios workers conviven sin pisarse.

Variables: `DATABASE_URL`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_PRIVATE_KEY`, `SUPABASE_JWT_SECRET`, `STATE_SECRET`, `APP_URL`.
Arranque: `uvicorn --factory speco_cloud.main:create`.

## El worker (`speco_cloud.worker`)
`python -m speco_cloud.worker` toma un job `sync_repo` (`claim_job()`), baja **sólo** `specs/<feature>/{spec,plan,tasks,data-model}.md` y
`product/{goals,decisions}.md` del commit empujado (GitHub API con el token de instalación), corre `specreview` **como librería** y guarda un
`spec_snapshot` + un `review` por versión de cada feature.
- **Idempotente:** el hash del snapshot es el mismo que usa la CLI para las aprobaciones (`approvals.spec_hash`), así que mismo contenido ⇒ no se guarda de nuevo, y una aprobación apunta a la misma versión en ambos lados.
- **Repos no confiables:** sólo se *lee* texto y se parsea markdown; no se clona, instala ni ejecuta nada. Rutas con regex estricta, ≤ 512 KB por archivo, ≤ 200 features, ≤ 1000 archivos.
- **Fallas:** vuelve a la cola con espera creciente (2, 4, 8, 16 min), a los 5 intentos queda `failed`; si ya hay un push más nuevo en cola, el viejo se descarta como `superseded`. Instalación suspendida o repo borrado ⇒ se saltea.
- La red y el parseo ocurren **fuera** de cualquier transacción de base.

## Correr
```bash
supabase start && supabase db reset                         # stack local con las migraciones de supabase/migrations
pip install -e '.[dev]' ./cloud && pytest tests/cloud       # Postgres temporal con los roles de Supabase simulados
```
Sin Postgres o sin las dependencias de `cloud/`, esos tests se saltan y la suite del motor corre igual.

## Qué falta (próximas partes)
Invitaciones por email; endpoints de lectura de features/reviews/aprobaciones para la app web; `main.py` de arranque; migrar la demo de `localStorage` a esta base. **No verificado contra un proyecto Supabase real ni
contra GitHub real** (GitHub es un transporte simulado en los tests).
