# 35 · La versión cloud en Vercel

La app web, el servicio completo y la GitHub App, desplegados y conectados.
Reemplaza a la demo estática de `docs/09` en los dos proyectos web.

| Proyecto Vercel | URL | Qué es |
|---|---|---|
| `speco-app` | <https://speco-app.vercel.app> | La web en modo cloud (`docs/19`). Es `APP_URL`: GitHub vuelve acá después de instalar |
| `speco.ia` | <https://specoia.vercel.app> | La misma web en modo cloud. Su origen está en `CORS_ORIGINS` |
| `speco-api` | <https://speco-api.vercel.app> | El servicio (`speco_cloud.main`): API, webhooks, MCP remoto, jobs |
| `speco-prbot` | <https://speco-prbot.vercel.app> | El bot sin base (`docs/32`). Queda de respaldo, **sin tráfico** |

La base y el login son **Supabase**, provisionado desde el Marketplace de Vercel (`speco-db`) y conectado a `speco-api`.
La GitHub App es `speco-pr-review`: su webhook y su Setup URL apuntan a `speco-api`.

## Cómo corre sin un worker

Vercel no tiene procesos permanentes. El servicio corre los jobs **en el mismo request que los encola** (`Settings.inline_jobs`, que se activa solo con `VERCEL=1`):

- un `push` que toca `specs/` encola `sync_repo` y el webhook lo corre antes de responder;
- la vuelta de la instalación (`/github/setup`) lee cada repo nuevo antes de redirigir, con un tope de 20 s;
- un `pull_request` se revisa en el request (lo que hacía el bot). Funciona con cualquier instalación, esté o no ligada a una empresa;
- un cron diario llama a `/internal/tick` con `CRON_SECRET`: créditos mensuales, renovaciones y los reintentos que vencieron.

Un job que falla se reintenta con espera creciente. En Vercel, ese reintento corre con el próximo webhook o con el cron diario.
Fuera de Vercel, `python -m speco_cloud.worker` sigue funcionando igual.

## Conectar GitHub en un clic

Quien entra con GitHub no necesita volver a GitHub para conectar lo que ya instaló:

1. Justo después del login, la sesión trae el token de GitHub de esa persona (`provider_token`, una sola vez: un refresh lo borra).
2. La app se lo pasa al servicio (`POST /api/github/installations`). El servicio pregunta a GitHub, **como esa persona**, qué instalaciones de Speco ve. El token no se guarda.
3. Una instalación en la **cuenta personal** de esa persona vuelve con un `claim` firmado (10 min). Al crear la empresa se ofrece conectarla en el mismo clic, y en `/connect` es un botón (`POST /api/orgs/{id}/github/link`).
4. Una instalación en una **organización** no trae `claim`. Cualquier miembro la ve en GitHub, pero sus repos los elige solo un admin. El botón lleva directo a la pantalla de esa cuenta en GitHub (`target_id`), sin el selector de cuentas.

Una instalación ya ligada a otra empresa no se ofrece. Un `claim` no sirve como `state` de instalación, ni al revés.

## Desplegar

Las webs están conectadas a git: un push a `main` las recompila en modo cloud.
El servicio **no** (un proyecto conectado a git compilaría la web en su lugar): lo despliega `.github/workflows/deploy-api.yml` en cada push a `main` que toca `cloud/`, `src/`, `supabase/migrations/` o `deploy/vercel-api/`.
El workflow corre los tests de cloud, aplica las migraciones pendientes, despliega y comprueba que cada `GET` de `app.py` exista en el servicio (`scripts/smoke_api.py`: un 404 es un servicio más viejo que el código).
Necesita, en el environment `production` del repo, los secretos `VERCEL_TOKEN`, `VERCEL_SCOPE` (el slug del equipo dueño de `speco-api`) y `POSTGRES_URL_NON_POOLING`.

A mano, lo mismo:

```bash
python scripts/configure_cloud_env.py     # variables de los tres proyectos, sin mostrar valores (solo lo que falta; --force rota los secretos)
python scripts/apply_migrations.py        # las migraciones pendientes, con POSTGRES_URL_NON_POOLING (--check: solo listarlas)
scripts/deploy_api.sh                     # el servicio, desde lo commiteado en HEAD
python scripts/smoke_api.py https://speco-api.vercel.app
```

Las variables solo valen para despliegues nuevos: después de cambiarlas, redesplegá.

Migraciones: se aplican en orden desde `supabase/migrations`, con `POSTGRES_URL_NON_POOLING`. El registro de las aplicadas está en `public._speco_migrations`, con RLS y sin acceso para `anon` ni `authenticated`.
`scripts/apply_migrations.py` corre cada una en su transacción junto con su registro, y se niega a correr si el esquema existe pero el registro está vacío.
Una migración tiene que poder convivir con el servicio anterior durante el deploy (agregar, no renombrar ni borrar en el mismo paso): la web y el servicio nuevos llegan unos segundos después que ella.
El servicio usa el pooler de transacciones (puerto 6543) y por eso no usa prepared statements (`db._connect`).

## Pasos manuales que faltan

Estos pasos no tienen API o necesitan tu sesión:

1. **Login con GitHub en Supabase.** En la App (*General*), generá un **client secret**. En el dashboard de Supabase (desde Vercel → *Storage* → `speco-db` → *Open in Supabase*):
   - *Authentication → Providers → GitHub*: el client ID y el secret de la App.
   - *Authentication → URL Configuration*: Site URL `https://speco-app.vercel.app`. En Redirect URLs, agregá `https://speco-app.vercel.app/**` y `https://specoia.vercel.app/**`.
2. **La App** (`github.com/settings/apps/speco-pr-review`):
   - *Homepage URL*: `https://speco-app.vercel.app`.
   - *Callback URL*: `https://stwyyoenddghollaqlnh.supabase.co/auth/v1/callback`.
   - *Permissions & events*: suscribir **Push**. Sin ese evento, `main` no se relee después de un merge.
   - `python scripts/create_github_app.py --check` dice qué sigue difiriendo.

3. **El circuito de decisión** (`docs/38`): darle a la App el permiso **Checks: Read and write**. Las migraciones `20261024000001` y `20261024000002` y el servicio los aplica el workflow de deploy.

## Verificado (2026-10-21)

- `/healthz`, `/api/orgs` sin token → 401, `/internal/tick` sin secreto → 401, una firma falsa → 401.
- Un `ping` firmado se guarda en `webhook_events`: el servicio escribe en Supabase desde Vercel.
- Una entrega real de `pull_request` reenviada desde GitHub llegó al servicio. El servicio leyó los dos árboles con el token de instalación y respondió `no_spec_changes`.
- Las dos webs sirven el bundle cloud y el servicio les acepta el preflight CORS.
- La suite de `tests/cloud` (255 tests) pasa en `cloud/Dockerfile.test`, con un Postgres descartable.

## Sin verificar

- El login de punta a punta: depende del paso manual 1.
- La primera empresa, `/connect` y el retrato contra GitHub real.
- El cron: Vercel lo programa recién después del primer despliegue con `crons`.

## Correr los tests de cloud con Docker

```bash
docker build -f cloud/Dockerfile.test -t speco-test . && docker run --rm speco-test
```

La imagen trae PostgreSQL. Cada corrida crea un cluster en un directorio temporal y lo borra al terminar (`tests/cloud/cluster_fixture.py`).
No toca la base de producción.
