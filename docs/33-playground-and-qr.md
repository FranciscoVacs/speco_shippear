# 33 · Del QR al primer resultado: el repo de prueba (playground)

Objetivo: alguien escanea un QR en una charla y **en 60 segundos, desde el celular, ve a Speco revisar un cambio de negocio**.
Después se lo lleva a sus propios repos con un clic.

## Por qué un repo de prueba y no «instalá la App»

- Casi nadie tiene un repo con specs de Spec Kit. Si el primer paso es instalar en su repo, la mayoría no ve nada.
- En el repo de prueba la App ya está instalada y la spec ya existe.
- Cualquiera con cuenta de GitHub puede proponer un cambio desde el navegador del celular. GitHub crea el fork y la PR solo.
- La inscripción es instalar la App en un repo propio. GitHub hace de login; no hace falta otro.

## El recorrido

```
QR ─▶ README del repo de prueba ─▶ «Editar la regla» (editor web de GitHub)
   ─▶ cambiar 10,000 por 15,000 ─▶ Propose changes ─▶ Create pull request
   ─▶ ~30 s: comentario de Speco en la PR
   ─▶ al pie: «¿Lo querés en tus repositorios? Instalá Speco» ─▶ instala en su repo
```

## Qué hace falta

| # | Qué | Quién | Estado |
|---|---|---|---|
| 1 | Bot corriendo con URL fija: `https://speco-prbot.vercel.app` | Claude | ✅ desplegado; faltan las credenciales reales (punto 2 de `docs/32`) |
| 2 | App pública: *Settings → Advanced → Make public*, para que otros la instalen | dueño | ⬜ |
| 3 | Repo **público** de prueba con `specs/006-wire-transfer-limits/` y el README de abajo | dueño (o Claude con permiso) | ⬜ |
| 4 | App instalada en ese repo | dueño | ⬜ |
| 5 | Probar una PR **desde un fork** y desde el celular | dueño | ⬜ sin verificar: los tests no cubren forks |
| 6 | QR al README del repo de prueba, en la última slide | dueño | ⬜ |
| 7 | Contar instalaciones y PRs después de la charla | dueño | ⬜ GitHub muestra las instalaciones en la página de la App |

**El QR apunta al repo de prueba en GitHub, no al bot.** La URL de GitHub nunca cambia. Si el bot se cae, el QR sigue funcionando y el comentario llega cuando el bot vuelve.

### Opción A: Vercel (recomendada)

Ya desplegado en `https://speco-prbot.vercel.app` con `scripts/deploy_prbot.sh`. Falta cargar las credenciales de la App: `docs/32`, pasos 2 y 3.

### Opción B: cualquier host de contenedores

Alcanza cualquier host que corra un contenedor 24/7 con HTTPS y una URL fija. **No** sirve un plan gratis que duerma el servicio: GitHub corta el webhook a los 10 segundos y el arranque en frío tarda más.

```bash
docker build -f cloud/Dockerfile.prbot -t speco-prbot .
# variables: GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_WEBHOOK_SECRET, GITHUB_PRIVATE_KEY (el .pem completo), SPECO_STATUS_TOKEN, PORT
```

Después de desplegar, cambiar en la App la *Webhook URL* a `https://<host>/webhooks/github` y la *Setup URL* a `https://<host>/github/setup`.

Plan mínimo si no se despliega: el bot en la laptop con `cloudflared` durante la charla (`docs/32`, anexo). Sirve para la demo, pero quien instale después no recibe comentarios mientras la laptop esté apagada.

## Riesgos

- **PRs desde forks:** el bot lee el commit del fork con el token del repo de prueba. GitHub lo permite, pero no está verificado. Probarlo antes del sábado (punto 5).
- **Spam en el repo público:** cerrar las PRs después de la charla. El bot es determinista: no gasta créditos de modelo.
- **Muchas PRs a la vez:** cada revisión hace ~15 llamadas a la API. El límite de una instalación es 5000 por hora: alcanza para cientos de PRs.

## README del repo de prueba

Copiar tal cual, cambiando `OWNER/REPO`:

```markdown
# Probá Speco en 60 segundos

Speco revisa la **intención** de cada cambio antes de que alguien escriba código.
Este repo tiene la spec de un banco ficticio: límites de transferencias y revisión de fraude.

## Probalo (funciona desde el celular)

1. Abrí la spec para editarla: **[editar la regla](https://github.com/OWNER/REPO/edit/main/specs/006-wire-transfer-limits/spec.md)**
2. Buscá **FR-005** y cambiá `10,000 USD` por `15,000 USD`.
3. *Commit changes…* → *Propose changes* → *Create pull request*.

En unos 30 segundos Speco comenta en tu PR qué cambia en el negocio y qué tarea quedó con el valor viejo.

¿Querés ver una contradicción? Agregá esta línea debajo de FR-010:

    - **FR-012**: When a verified customer confirms a wire, the system MUST charge a fee of 1% of the amount, with a minimum of 2.00 USD

## ¿Lo querés en tus repos?

[Instalá Speco](https://github.com/apps/SLUG/installations/new). Cada PR que cambie una spec recibe esta revisión.

_Los datos de este repo son de ejemplo._
```
