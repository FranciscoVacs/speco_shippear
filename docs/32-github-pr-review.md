# 32 · La GitHub App que comenta las PRs (spec 026)

Cada PR que cambia una spec recibe **un** comentario que dice qué cambia en el negocio:
qué requisitos cambian, qué valores se movieron («10,000 USD → 15,000 USD»), qué tareas quedaron con el valor viejo y qué bloqueantes trae.
Antes de los requisitos responde lo que pregunta quien decide: qué resuelve (las historias), cómo se va a medir (los criterios de éxito), qué queda abierto (casos borde sin respuesta y supuestos), cuánto tiene tareas y en qué estado dice estar la spec. Un cambio solo de estado («Draft» → «Partially implemented») también se reporta. Arriba, una sección **Producto** lista los objetivos y las decisiones que la PR agrega o reescribe en `product/`, y las decisiones que cambian de estado (`proposed → accepted`); cada feature dice a qué objetivos responde y qué decisiones cita.
El comentario se edita en cada push. Las PRs que no tocan `specs/` ni `product/` no reciben nada.

Cuando el repositorio pertenece a una empresa que lo conectó, el comentario además enlaza a decidir esa versión en la app y el PR lleva el check «Speco · decisión» (`docs/38`). Hay dos formas de correrlo:

| Forma | Qué necesita | Para qué |
|---|---|---|
| **Bot** (`speco_cloud.prbot`) | Solo la App: id, clave privada, secreto | Lo que usa esta guía. Sin base, sin login, sin estado. |
| Servicio completo (`speco_cloud.main`) | Postgres/Supabase, login, worker (`docs/19`) | Producción multiempresa. Revisa PRs con el mismo código. **Desde 2026-10-21 la App `speco-pr-review` apunta acá** (`docs/35`); el bot queda de respaldo |

Esta guía despliega el bot en **Vercel**. Tiempo estimado: 20 minutos la primera vez.
Para correrlo en tu máquina mientras desarrollás, ver el [anexo](#anexo-correrlo-en-tu-máquina-con-un-túnel).

En toda la guía, `<URL>` es la dirección del bot en Vercel: **`https://speco-prbot.vercel.app`**.

## 1. El proyecto en Vercel

**Ya existe:** `speco-prbot`, con URL de producción `https://speco-prbot.vercel.app`. Para recrearlo en otra cuenta: `npx vercel@latest project add speco-prbot` y después el script del paso 3.

Es un proyecto **aparte** de la demo pública. El contrato de la demo (`docs/09`, `tests/test_vercel_config.py`) es que **no tiene funciones de servidor ni secretos**.

No se conecta a git con una Root Directory. Vercel solo sube la carpeta que despliega, y el bot necesita el motor (`src/`) y el paquete de cloud.
`scripts/deploy_prbot.sh` arma esa carpeta desde lo commiteado y despliega con la CLI de Vercel.

## 2. Registrar la App en GitHub

**En un clic (recomendado).** Desde la raíz del repo:

```bash
python scripts/create_github_app.py
```

Abrí <http://127.0.0.1:8790> en el navegador donde tenés GitHub abierto → *Continuar en GitHub* → revisá el nombre → *Create GitHub App*.
El script manda a GitHub el manifiesto versionado en `deploy/github-app/manifest.json`, con todos los campos de la tabla de abajo.
GitHub le devuelve el App ID, el slug, la clave privada y el secreto del webhook.
El script los guarda en `~/.speco/github-app-<slug>.json` y los carga en las variables de Vercel (paso 3), sin mostrarlos.
Si el nombre está tomado, GitHub te deja cambiarlo en esa misma pantalla.
Después, solo falta `scripts/deploy_prbot.sh`.

**A mano.** Si preferís llenar el formulario vos:

1. Entrá a <https://github.com/settings/apps/new>. Para una organización: *Settings → Developer settings → GitHub Apps → New*.
2. Completá:

| Campo | Valor |
|---|---|
| GitHub App name | `Speco <tu nombre>`: tiene que ser único en GitHub. Define el **slug** |
| Homepage URL | `<URL>` |
| Setup URL | `<URL>/github/setup` y marcá **Redirect on update** |
| Webhook → Active | sí |
| Webhook URL | `<URL>/webhooks/github` |
| Webhook secret | una cadena larga al azar, por ejemplo `python -c "import secrets;print(secrets.token_hex(32))"` |

3. **Permisos de repositorio:**
   - *Contents*: Read-only.
   - *Pull requests*: Read and write.
   - *Metadata*: Read-only (es obligatorio).
4. **Eventos:** *Pull request*.
5. **¿Dónde se puede instalar?** *Any account*, para que cualquiera la instale desde el QR (`docs/33`). Para probar en privado, *Only on this account*.
6. *Create GitHub App*. En la página que se abre:
   - Anotá el **App ID** y el **slug**: es la última parte de la URL pública, `github.com/apps/<slug>`.
   - *Generate a private key* descarga un `.pem`. **No lo subas al repo.**

## 3. Cargar las variables y desplegar

Cargá las variables en el proyecto `speco-prbot`, para *Production*. Hay dos formas: en el dashboard (*Settings → Environment Variables*) o con la CLI (`npx vercel@latest env add <NOMBRE> production`).

| Variable | Valor |
|---|---|
| `GITHUB_APP_ID` | el App ID del paso 2 |
| `GITHUB_APP_SLUG` | el slug del paso 2 |
| `GITHUB_WEBHOOK_SECRET` | el secreto del paso 2 |
| `GITHUB_PRIVATE_KEY` | el contenido completo del `.pem`, con `-----BEGIN…` y `-----END…` |
| `SPECO_STATUS_TOKEN` | otra cadena al azar: muestra las últimas revisiones en `<URL>/?token=…` |

Después desplegá desde la raíz del repo, con Git Bash:

```bash
scripts/deploy_prbot.sh            # lo commiteado en HEAD, a producción
scripts/deploy_prbot.sh origin/main
```

Las variables solo se aplican a despliegues nuevos: si cambiás una, volvé a correr el script.

Comprobá:
- `<URL>/healthz` responde `{"ok":true}`.
- `<URL>` muestra el botón **Conectar un repositorio de GitHub**.
- En la App → *Advanced → Recent Deliveries*, *Redeliver* el `ping`: responde 200.

En Vercel el bot **revisa antes de responder**: Vercel define `VERCEL=1` y una función puede congelarse apenas responde.
Una revisión tarda pocos segundos. Si alguna pasa los 10 s, GitHub marca la entrega como *timeout*, pero el comentario igual se publica.

## Cambiar la App más adelante

`deploy/github-app/manifest.json` es la fuente de verdad: un cambio a la App empieza como un PR que cambia ese archivo.
GitHub no tiene una API para aplicar un manifiesto a una App que ya existe, así que se aplica en dos partes:

| Qué cambia | Cómo se aplica |
|---|---|
| Webhook URL, SSL verification | `python scripts/create_github_app.py --sync-webhook` |
| Permisos, eventos | En la página de la App (*Permissions & events*). Si suben los permisos, cada instalación tiene que aceptarlos |
| Nombre, descripción, Homepage URL, Setup URL, visibilidad | En la página de la App |

```bash
python scripts/create_github_app.py --check        # qué difiere entre la App real y el manifiesto; sale con 1 si algo difiere
python scripts/create_github_app.py --deliveries   # las últimas entregas del webhook y su respuesta
```

Ambos firman como la App con la clave de `~/.speco/github-app-<slug>.json` y necesitan PyJWT (`pip install "pyjwt[crypto]"`, ya está en el entorno de `cloud/`).
La Setup URL y la visibilidad no se pueden leer por API: `--check` no las compara.

## 4. Conectar un repositorio (lo que ve un usuario nuevo)

1. En `<URL>`, **Conectar un repositorio de GitHub** → elegí el repo (puede ser privado) → *Install*.
2. GitHub vuelve a `<URL>/github/setup`: «Listo: Speco está conectado» y el siguiente paso.
   La página no lista los repos: el `installation_id` de la URL no prueba quién la abre.

## 5. La primera PR

En el repo conectado tiene que haber una feature de Spec Kit en `specs/`.

**Lo más rápido:** instalá la App en el repo de prueba [`speco-playground`](https://github.com/agustindelmonti/speco-playground) y seguí su README desde el navegador.
Es lo mismo que va a hacer quien escanee el QR (`docs/33`).

**En un repo propio,** con el ejemplo de este repo:

```powershell
# en tu repo, sobre main
Copy-Item -Recurse <speco.ia>\examples\wire-transfers\specs .\specs
git add specs; git commit -m "Add wire transfer limits spec"; git push
git switch -c raise-review-threshold
# editar specs/006-wire-transfer-limits/spec.md: en FR-005 cambiar 10,000 USD por 15,000 USD
git commit -am "Raise the manual review threshold"; git push -u origin raise-review-threshold
gh pr create --fill
```

En segundos aparece el comentario de Speco:
- `FR-005 cambió: 10,000 USD → 15,000 USD`.
- `T004 todavía dice «10,000 USD»`: la tarea construiría la regla vieja.

Cada push nuevo edita el mismo comentario.

**Tests editados (opcional, spec 032).** Por defecto la App sólo lee specs y archivos de producto. Si querés que el comentario avise cuando una PR
edita el test que verifica una regla (un agente que debilita un assert para que «pase»), activalo en el repo:

```toml
# specreview.toml
[pr]
review_tests = true
```

Con eso la App lee, además, las dos versiones de los tests cuyo contenido cambió en la PR, y nada más.
Para ver qué pasó: los logs del proyecto en Vercel (*Logs*), o `<URL>/?token=<SPECO_STATUS_TOKEN>`.
Esa página solo muestra lo que revisó la instancia que te atiende; los logs muestran todo.

## Sin GitHub: la misma revisión en la terminal

```bash
specreview diff                  # contra origin/main, incluye lo que todavía no commiteaste
specreview diff main -f markdown # el comentario exacto que publicaría la App
specreview diff main -f json     # para scripts
```

Sale con 1 si el cambio trae bloqueantes nuevos: sirve como gate antes de abrir la PR.

## Problemas comunes

| Síntoma | Causa |
|---|---|
| `<URL>` responde 500 y los logs dicen `missing: GITHUB_APP_ID…` | Falta una variable del paso 3, o no se volvió a correr el script después de cargarlas |
| El script dice que la CLI está desactualizada | Usa `npx vercel@latest`; si falla, borrá la caché de npx o instalá `vercel@latest` |
| El botón de `<URL>` lleva a `github.com/apps/speco-preview`, que no existe | El despliegue tiene las credenciales de prueba del 2026-10-21: cargá las reales (paso 3) y corré el script |
| *Recent Deliveries* muestra 405 con cuerpo vacío, y `<URL>/healthz` devuelve HTML | El proyecto `speco-prbot` quedó conectado a git y un push publicó la demo estática en su lugar. `scripts/deploy_prbot.sh` lo desconecta y vuelve a publicar el bot; después, reenviá la entrega (`--deliveries` muestra cuál) |
| *Recent Deliveries* muestra 401 | `GITHUB_WEBHOOK_SECRET` no coincide con el secreto de la App |
| *Recent Deliveries* muestra 404 | La Webhook URL no termina en `/webhooks/github`, o apunta a otro proyecto |
| *Recent Deliveries* muestra *timeout* pero el comentario aparece | Normal si la revisión pasó los 10 s (paso 3) |
| Los logs dicen `error` con `403` | A la App le falta *Pull requests: Read and write*. Después de cambiar permisos, el dueño del repo tiene que **aceptarlos** en *Settings → Integrations → GitHub Apps* |
| `no_spec_changes` | La PR no toca `specs/<feature>/{spec,plan,tasks,data-model}.md` ni `product/{goals,decisions}.md` |

Si el build en Vercel no funciona, el mismo bot corre en cualquier host de contenedores con `cloud/Dockerfile.prbot` (`docs/33`, opción B).

## Anexo: correrlo en tu máquina con un túnel

Para desarrollar sin desplegar. GitHub tiene que poder llegar a tu máquina, así que hace falta un túnel.

```powershell
uv venv .venv; uv pip install -p .venv -e . -e ./cloud      # una vez
winget install Cloudflare.cloudflared                       # una vez
cloudflared tunnel --url http://localhost:8787               # imprime https://<algo>.trycloudflare.com
```

En otra terminal, con las mismas variables del paso 3:

```powershell
$env:GITHUB_APP_ID = "123456"
$env:GITHUB_APP_SLUG = "speco-tu-nombre"
$env:GITHUB_WEBHOOK_SECRET = "<el secreto de la App>"
$env:SPECO_STATUS_TOKEN = "<otra cadena al azar>"
$env:GITHUB_PRIVATE_KEY_PATH = "C:\ruta\a\speco.private-key.pem"
.venv\Scripts\uvicorn --factory speco_cloud.prbot:create --port 8787
```

En la App, cambiá la *Webhook URL* a `https://<algo>.trycloudflare.com/webhooks/github`. La *Setup URL* puede ser `http://localhost:8787/github/setup`: la abre tu navegador.
La URL del túnel **cambia cada vez que reiniciás `cloudflared`**. Si la reiniciás, actualizá la Webhook URL.
Acordate de volver a poner `<URL>/webhooks/github` cuando termines: la App tiene una sola Webhook URL.

Localmente el bot responde primero y revisa después. Para imitar Vercel: `$env:SPECO_REVIEW_INLINE = "1"`.

## Qué falta para producción

- El servicio completo (`docs/19`) no maneja el evento `pull_request`. Sumarlo es encolar un job que llame a `pr_review.review_pull_request` con el mismo código.
- Las revisiones no quedan guardadas: el bot no tiene base. El historial está en los logs de Vercel y en los comentarios de las PRs.
- Probado en Vercel (2026-10-21): `/healthz`, la home, `/github/setup` y un `ping` firmado responden en `https://speco-prbot.vercel.app`; una firma falsa da 401.
- **Sin probar contra GitHub real:** instalar la App y recibir una PR. Los tests usan un GitHub falso (`tests/cloud/test_pr_review.py`).
