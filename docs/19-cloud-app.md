# 19 · La app contra el servicio cloud (spec 015)

La misma app web funciona en dos modos, elegidos **al compilar**:

| | Demo pública | Modo cloud |
|---|---|---|
| Se activa con | nada (por defecto) | `VITE_CLOUD_URL`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (las tres) |
| Datos | simulados en el navegador, rotulados | de la base (Supabase) vía el servicio |
| Red | ninguna llamada a servicios | sólo al servicio y a Supabase |
| Librería de sesión | **no está en el bundle** (ni en el reporte exportado) | `@supabase/supabase-js`, cargada on demand |

`__CLOUD_BUILD__` (`vite.config.ts`) vale el literal `false` salvo que estén las tres direcciones, así el código de la librería se elimina del build. Verificado:
ni `dist/` ni `dist-single/` contienen GoTrue; `dist-cloud/` sí.

## Qué hace en modo cloud
1. **Entrar:** GitHub o un enlace por email (sin contraseñas). La librería guarda y renueva la sesión en su **propia clave** (`sb-speco-auth-token`, fija); la app sólo la lee. El token viaja en `Authorization: Bearer`, nunca en la URL ni en cookies.
2. **Empresa:** sin ninguna ⇒ «Creá tu empresa» (el servicio te hace owner). Con varias ⇒ el selector de workspace lista las reales.
3. **Conectar GitHub** (`/connect`): sólo owner/admin; la app pide el enlace de instalación, GitHub devuelve al servicio, que guarda instalación y repos, y la lista se refresca hasta que cada repo se lee. Luego «Armar el retrato inicial».
4. **Retrato** (`/portrait`): la misma pantalla de la spec 014, ahora leyendo y escribiendo en el servicio. Quien no puede decidir ve las reglas sin botones (y el servicio igual lo rechaza).
5. **Salir:** la app pasa a «sin sesión» al instante y borra la sesión local aunque Supabase no responda (supabase-js la conserva si no puede revocarla).

El resto de las pantallas (Revisiones, Decisiones, Reglas, ajustes) sigue mostrando datos de demostración, rotulados, hasta que su propia spec los mueva.

## Seguridad que se verificó
- El servicio sólo acepta llamadas del navegador desde el origen de la web (CORS); una página de otro origen **no puede leer la respuesta aunque tenga un token válido** (probado en navegador real).
- Se aceptan tokens HS256 (secreto compartido) y asimétricos (JWKS: ES256/RS256/EdDSA); cada clave sólo sirve para su familia (sin confusión de algoritmos ni `none`).
- El token sólo está en la clave de la librería; la persona y sus empresas reales **no** se escriben en el almacenamiento propio de la app.
- Un `401` del servicio cierra la sesión.

## Verificación
`web/scripts/verify-cloud.mjs` (43 chequeos): compila los dos modos, levanta el **servicio real** sobre un Postgres real descartable con un GitHub simulado y el worker corriendo
(`scripts/cloud_e2e_server.py`), y maneja la app en un navegador real: pantalla de entrada, primera empresa, la ida y vuelta de la instalación, el worker leyendo el repo,
el retrato con reglas propias, decidir/corregir/rechazar, congelar la línea base y que todo sobreviva a una recarga, permisos por rol (owner, approver, viewer), sesión inválida,
salir, CORS, y que la demo no cargue la librería ni haga ninguna llamada externa. Encontró y se arreglaron tres bugs reales de la app: un enlace directo rebotaba a Inicio,
cerrar sesión no se quedaba si Supabase no respondía, y la redirección de `/signed-out` ganaba la carrera contra el cierre.

## Qué NO está verificado
- **Contra un proyecto Supabase real**: el inicio de sesión (OAuth con GitHub, enlace por email, el redirect de vuelta) usa una sesión inyectada con un token firmado a mano. La **base** sí se probó en el proyecto real (migraciones, RLS y roles); la **autenticación** no (el entorno no llegaba a `supabase.co`).
- **Contra GitHub real**: la App, el instalado y los webhooks son simulados.
- Si el proyecto firma con claves asimétricas, falta `SUPABASE_URL` en el servicio para publicar el JWKS (ya soportado, probado con claves de prueba).

Desplegado en Vercel: ver `docs/35`.

## Configurar (resumen)
Servicio: `DATABASE_URL`, `SUPABASE_URL` (+ `SUPABASE_JWT_SECRET` si el proyecto usa HS256), `GITHUB_APP_ID/SLUG/PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `STATE_SECRET`, `APP_URL` (el origen de la web; es el único que acepta CORS).
Web: `VITE_CLOUD_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clave pública).
