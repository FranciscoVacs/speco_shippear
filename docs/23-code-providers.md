# 23 · Proveedores de código: GitHub y Bitbucket Cloud

> Spec 019 · `G-13` · `D-013`. El servicio le pide a un proveedor de código solo cuatro lecturas (resolver una rama, listar los archivos de un commit,
> leer un archivo, leer un archivo que puede no existir). Reseñas, retrato y cambios son los mismos para cualquiera.

## Cómo conecta una empresa su Bitbucket Cloud

1. **Un administrador del workspace** crea un *OAuth consumer*: Workspace settings → *OAuth consumers* → *Add consumer*.
   - Marcá **This is a private consumer** (así se puede usar el grant de credenciales de cliente, sin pantalla de autorización).
   - Permisos: **Repositories: Read** y **Webhooks: Read and write** (Speco crea un webhook del workspace, solo para `push`). **Nada de Write ni Admin**:
     un consumer que pueda escribir es rechazado y no se guarda.
   - Callback URL: cualquiera (por ejemplo la URL de la web); no se usa.
2. En Speco: **Conectar repositorios → Conectar Bitbucket** (`/connect`, solo dueños y administradores), y pegá el *slug* del workspace, la *Key* y el *Secret* del consumer.
3. Speco lista **todos** los repositorios del workspace como *disponibles* y **no lee ninguno**. Elegí los que querés que lea; recién ahí se hace la primera
   reseña y se propone el retrato. Podés cambiar la elección cuando quieras.
4. **Actualizar** busca repositorios nuevos y pone al día los elegidos cuya rama principal avanzó sin que llegara el webhook.

## Lo que guarda Speco y cómo
- La *Key* y el *Secret* se **cifran** antes de llegar a la base con `CREDENTIALS_KEY` (una clave Fernet que solo tiene el servicio) y viven en `connection_secrets`,
  una tabla sin ninguna política ni permiso para personas. Ninguna llamada de la API los devuelve.
- No se guarda ningún acceso: cada lectura canjea la key y el secret por un acceso de 2 horas (`client_credentials`) que queda en memoria.
- Al desconectar se borran las credenciales y se elimina el webhook.
- Generar la clave: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Si se pierde, hay que volver a conectar los workspaces.

## Variables del servicio para Bitbucket
`CREDENTIALS_KEY` (obligatoria para Bitbucket) y `PUBLIC_URL` (la URL pública del servicio: de ahí sale la dirección del webhook, `PUBLIC_URL/webhooks/bitbucket/<connection>`).
Opcionales: `bitbucket_api`/`bitbucket_auth` solo existen para pruebas.

## Qué NO está verificado
- Nada corrió contra un Bitbucket real: la API se simula con respuestas con la forma documentada. Lo más probable de ajustar al primer uso real:
  la forma exacta de las páginas del árbol (`src` con `max_depth`), el nombre del encabezado de firma del webhook (`X-Hub-Signature`) y que un workspace
  acepte crear su webhook con ese consumer. Si el webhook no se puede crear, la conexión igual funciona y la pantalla lo avisa: **Actualizar** pone todo al día.
- Los límites de pedidos de Bitbucket: un `429` hace fallar el trabajo con una demora y el worker lo reintenta (2, 4, 8, 16 minutos); un repositorio de
  más de 30.000 archivos se rechaza en vez de leerse a medias.
- Bitbucket Data Center/Server es otra API y no está incluido.

## Verificación
`tests/cloud/test_bitbucket.py` (17 tests, esquema real y Bitbucket simulado) y la sección «spec 019» de `web/scripts/verify-cloud.mjs`, que maneja la pantalla en un
navegador real contra el servicio real: credencial que puede escribir y workspace inexistente rechazados con un motivo claro, tres repositorios disponibles y ninguno
leído, el secreto desaparece de la página y no queda en el navegador, búsqueda, elegir dos, dejar de leer uno, actualizar y desconectar.
