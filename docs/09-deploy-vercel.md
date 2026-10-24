# Desplegar la demo en Vercel

> Desde 2026-10-21, `speco-app` y `speco.ia` compilan en **modo cloud**: tienen las variables `VITE_*` (`docs/35`). Esta guía sigue valiendo para un proyecto sin esas variables.

La demo es un sitio **estático** (Vite + React): no necesita servidor propio ni variables de entorno. Sesión, workspaces, miembros,
API keys, facturación y notificaciones son simulados, y el agente corre en el navegador con respuestas de ejemplo.
**La demo pública nunca llama a un modelo de lenguaje**: un endpoint público que lo hiciera gastaría tus tokens con cualquier visitante.

## Pasos

1. En Vercel: **Add New… → Project** e importá el repositorio (rama `main`, o la rama del PR para una vista previa).
2. **No hace falta tocar nada más.** El `vercel.json` de la raíz fuerza un build estático de `web/`
   (`cd web && npm ci`, `npm run build`, salida `web/dist`). Si preferís poner **Root Directory = `web`**, también funciona:
   en ese caso Vercel usa `web/vercel.json`.
3. Deploy. No hay variables de entorno que configurar.

O desde la terminal: `npx vercel` (preview) y `npx vercel --prod`.

### Si falla con «No python entrypoint found»

La raíz del repo es un proyecto Python (`pyproject.toml`, el motor de análisis), así que Vercel autodetecta el preset
**Python/FastAPI** y busca un `app.py` que no existe. El `vercel.json` de la raíz lo evita con `"framework": null` y un build
estático explícito; un test (`tests/test_vercel_config.py`) vigila que siga así. Si ves ese error:

- confirmá que el commit desplegado **contiene `vercel.json` en la raíz** (si desplegás una rama vieja, no lo tiene);
- en *Settings → Build & Deployment*, el *Framework Preset* debería ser **Other** o **Vite**, no Python, y *Root Directory*
  vacío o `web`.

## Qué hace `web/vercel.json`

- `rewrites`: cualquier ruta que no sea un archivo existente sirve `index.html`, así los enlaces directos (`/reviews/003-team-invitations`,
  `/settings/members`…) funcionan al abrirlos o recargar. Vercel sirve primero los archivos reales (`/assets/*`, `/samples/*`).
- Cache inmutable para `/assets/*` (nombres con hash) y cabeceras básicas de seguridad.

## Datos de la demo

`web/public/samples/` se genera **solo con contenido de este repositorio** (`python scripts/gen_samples.py`): dos ejemplos con defectos
plantados (`examples/`) y las specs propias del producto. Un test (`tests/test_samples.py`) falla si quedan desactualizados.

## Verificación local sin cuenta de Vercel

`vercel build` ejecuta el mismo pipeline que el despliegue. El script reproduce **los dos modos de importar** el repo, con la
misma versión del CLI que usa Vercel, y falla si el resultado deja de ser estático o si el repo vuelve a detectarse como Python:

```bash
scripts/verify_vercel.sh            # sobre el commit actual (HEAD); acepta otra referencia git
```
1. raíz del repo con el proyecto marcado como preset `python` (lo que Vercel autodetecta por el `pyproject.toml`);
2. Root Directory = `web`.

`node web/scripts/verify-shell.mjs` sirve `dist/` imitando las reglas de `vercel.json` y abre cada ruta directamente.

## Con un modelo real

Para probar el asistente con un modelo de verdad usá el servidor local: `specreview <repo> --serve --llm anthropic`.
Una demo pública con modelo real necesitaría un endpoint con autenticación y límites de uso; no está incluido a propósito.
