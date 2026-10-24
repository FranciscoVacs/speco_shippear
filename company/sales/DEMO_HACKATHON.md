# Demo del hackatón: sábado 2026-10-24

Guion de la demo en vivo. Duración objetivo: **3 minutos** **[DECIDIR]** según el formato del hackatón (si son 5, usar el pitch de 5 minutos de `PITCH_Y_OBJECIONES.md` y meter esta demo en el beat 4).

Al 2026-10-24 no queda ninguna referencia sin verificar en este guion; lo que falta son **ensayos** (marcados «Ensayo pendiente»). Antes de subir, cada uno DEBE pasar a «probado» o el beat DEBE salir del guion y caer al plan B. Nada de esta demo se afirma fuera del escenario sin estar `verificado` en `../positioning/AFIRMACIONES.md`.

## La historia en una línea

Una persona de producto instala Speco desde GitHub, un agente abre un PR que cambia una regla de negocio, y en segundos Speco le dice, en su idioma, qué cambia y qué rompe.

## Escenario y datos

- **Repo de prueba:** privado, con la spec de `examples/wire-transfers/specs/006-wire-transfer-limits/` en `specs/` (límites de transferencias y revisión de fraude). **[DECIDIR]** nombre del repo. La cuenta da igual: la App no usa GitHub Actions.
- **El cambio del PR** (dos líneas de `spec.md`, como lo haría un agente):
  - `FR-005`: el umbral de revisión manual pasa de **10,000 a 15,000 USD**.
  - Se agrega `FR-012`: comisión de **1 %**, mientras `FR-001` dice **0.5 %**.
- **Lo que Speco comenta** (salida real del bot sobre este cambio, `docs/32`; contra GitHub real ya comentó el PR #1 de `speco-playground` el 2026-10-21, en 3,4 s):
  > **Speco · qué cambia en el negocio** — Esta PR cambia la intención de 1 feature e introduce 1 bloqueante. *Espera una decisión.*
  > - **FR-005 cambió: 10,000 USD → 15,000 USD**. Afecta a `T004`, `P2`.
  > - ⚠️ `T004` todavía dice «10,000 USD»: actualizarla antes de implementar.
  > - **FR-012 nuevo** (comisión 1 %). Afecta a `T001` *(inferido)*.
  > - **Bloqueante que trae esta PR:** `CON001` FR-001 + FR-012: «0.5%» vs «1%». Decidir cuál vale.
- El remate es `T004`: **el agente iba a construir la regla vieja** y nadie lo hubiera visto leyendo el diff.
- Todos los datos son de ejemplo. En pantalla DEBE decirlo («repo de demo»).

## Beats

| # | Tiempo | Qué se dice | Qué hay en pantalla | Estado |
|---|---|---|---|---|
| 1 | 0:00–0:25 | «Con agentes escribiendo el código, construir es barato. Lo caro es decidir qué construir y que siga siendo cierto. Un agente no aclara: adivina.» | Slide con la frase. Nada más | listo |
| 2 | 0:25–0:50 | «Soy de producto. Instalo Speco en mi repo privado. Un clic.» | `<URL>` del bot en Vercel → «Conectar un repositorio de GitHub» → elegir el repo → vuelve a «Listo: Speco está conectado» | Plan A: instalar la App pública `speco-pr-review` desde GitHub (probado en `speco-playground`). El flujo «Conectar» de la app cloud sigue sin desplegar: no mostrarlo. **Ensayo pendiente** |
| 3 | 0:50–1:15 | «Un agente abre un PR. Cambió una línea de la spec. Para un revisor de código es nada.» | El PR abierto, diff de dos líneas: `10,000` → `15,000` y la comisión nueva | **Ensayo pendiente:** dejar la rama y el PR listos antes de subir |
| 4 | 1:15–1:50 | (silencio unos segundos mientras llega) «Esto es lo que ve producto.» Leer el comentario en voz alta: qué cambia, la tarea que quedó con el valor viejo, la contradicción, quién decide | Comentario de Speco en el PR | Probado contra GitHub real (PR #1 de `speco-playground`, 3,4 s). **Ensayo pendiente** en el repo de la demo |
| 5 | 1:50–2:10 | «No dice si el código está bien. Dice si hace lo que decidimos. Y el agente no puede decidir por vos: propone, vos aprobás.» | Mismo comentario, resaltar «Espera una decisión» | listo (`D-012`) |
| 6 | 2:10–2:45 | «Esto es el principio. Lo que Cursor hizo con el código, lo hacemos con la intención: un grafo de specs, decisiones y reglas. La pregunta que nadie responde hoy: si cambio esta regla, ¿qué se rompe?» | Slide: grafo de intención (nodos spec/decisión/regla, aristas) y la tabla código ↔ producto | visión, no producto: decirlo en futuro |
| 7 | 2:45–3:00 | «Escaneen esto. En un minuto, desde el celular, cambian una regla y ven a Speco revisarla. Speco: el Cursor para producto.» | **QR grande** al repo de prueba + logo. Dejarlo en pantalla durante las preguntas | ⬜ ver «Cierre con QR» |

## Qué cambió el 2026-10-24 (antes de subir, leer)

El circuito de decisión (`docs/38`) existe en el código y está probado con un GitHub **falso**. Para mostrarlo en vivo falta, en este orden: aplicar las dos migraciones nuevas, darle a la App el permiso **Checks: Read and write**, desplegar `speco-api` y mergear la web. Si no se hace, la demo del beat 4 sigue igual que antes (comentario sin enlace ni check) y la página de decisiones de la web **no** debe abrirse: el repo de prueba del QR no pertenece a ninguna empresa, así que ahí el comentario conserva la invitación a instalar.

- [ ] Migraciones aplicadas (`docs/38`, paso 1) y `speco-api` redesplegado
- [ ] Permiso *Checks* aceptado en la instalación que se va a mostrar
- [ ] En un repo **conectado a una empresa**: abrir un PR, ver el check pendiente, decidir en la app y ver el check en verde. Anotar acá cuánto tardó
- [ ] Si no llega a probarse, el beat 5 se dice como hasta ahora y el circuito va en el beat 6, en futuro

## Checklist antes de subir (sábado, T-60 min)

- [ ] Bot en Vercel respondiendo: `<URL>/healthz` da `{"ok":true}` (`docs/32` pasos 1-3)
- [ ] La Webhook URL de la App apunta a `<URL>/webhooks/github`, no a un túnel de una prueba local
- [ ] GitHub App instalada en el repo de prueba; si el beat 2 se hace en vivo, **desinstalada** antes para reinstalar en escena
- [ ] Rama del PR preparada y pusheada (sin abrir el PR); el PR se abre en vivo
- [ ] Un PR de ensayo abierto y cerrado en la última hora: el comentario llegó, el texto es el esperado, se midió el tiempo
- [ ] Variables cargadas: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY_PATH`. No hace falta `ANTHROPIC_API_KEY`: el comentario es determinista
- [ ] Video de respaldo grabado de punta a punta (beats 2–5), abierto en una pestaña, sin sonido de notificaciones
- [ ] Terminal con `specreview demo` probado en **esta** máquina (en Windows: con el fix de PR #44 o `PYTHONIOENCODING=utf-8`)
- [ ] Wifi del lugar probado; hotspot del celular como segunda red
- [ ] Pestañas en orden: slide 1, GitHub (instalación), PR, slide grafo, slide cierre. Notificaciones del sistema apagadas
- [ ] Zoom del navegador y de la terminal a 150 % o más

## Beat opcional: «¿por qué no se lo pido a Claude Code?»

45 segundos, con datos reales del experimento. Va entre los beats 5 y 6, o se guarda para la ronda de preguntas. Guion, lámina y lo que no se puede decir: `BEAT_COMPARACION.md` y `beat-comparacion.html`.

## Plan B

| Si falla | Qué hacer | Qué decir |
|---|---|---|
| La instalación de la App (beat 2) | Saltar: la App ya está instalada en un segundo repo. Seguir en el beat 3 | «Ya la tengo instalada acá.» |
| El comentario no llega en 45 s (beat 4) | Pasar al video de respaldo desde el beat 3 | «Les muestro la corrida de hace una hora.» |
| Se cae el bot o Vercel | Video de respaldo completo | Igual que arriba. Sin explicar la falla |
| No hay internet | Terminal: `specreview demo`. Muestra 2 bloqueantes: `CON001` (5.000 vs 10.000 USD) y `COV001` (requisito que nadie implementa), sin red y sin API key | «Esto es el motor, offline: la misma contradicción, antes de que exista código.» |
| Todo falla | Slides + el comentario objetivo como imagen, rotulado «así se ve» | Decir que es una captura. No presentarla como en vivo |

## Cierre con QR (objetivo: la mejor tracción posible)

**Objetivo:** que la sala termine la charla usando Speco, no anotando un link.
Quien escanea DEBE ver su primer resultado en 60 segundos, desde el celular, sin instalar nada.
Detalle técnico y checklist completo: `docs/33-playground-and-qr.md`.

- **El QR apunta al README de un repo público de prueba**, no a la app ni al bot. Esa URL de GitHub no cambia.
- En el README: «editar la regla» → cambiar 10,000 por 15,000 → *Propose changes*. GitHub crea fork y PR solos. Speco comenta en ~30 s.
- El comentario termina con «¿Lo querés en tus repositorios? Instalá Speco». **Esa instalación es la inscripción.** GitHub hace de login.
- Métrica del día: PRs abiertas en el repo de prueba (gente que lo probó) e instalaciones nuevas de la App (gente que se lo llevó). Anotarlas acá el domingo.

Antes del sábado:
- [ ] Bot desplegado en Vercel (`docs/32` pasos 1-3); si el build falla, Railway o Render con el Dockerfile (`docs/33` opción B); como mínimo, la laptop con túnel (`docs/32` anexo)
- [ ] App pública (*Make public*)
- [ ] Repo público de prueba con la spec y el README de `docs/33`; App instalada ahí
- [ ] PR de prueba **desde otra cuenta y desde un celular** (fork): el comentario llega
- [ ] QR en `company/sales/qr-playground.png` (o `.svg` para la slide): apunta a `https://github.com/agustindelmonti/speco-playground`. Probarlo con dos celulares distintos
- [ ] Slide final: QR grande, URL corta debajo, una frase: «Cambiá una regla. Mirá qué rompe.»

## Después de la demo

- Si preguntan «¿lo puedo probar?»: el QR. Ya.
- Preguntas probables y respuestas: `PITCH_Y_OBJECIONES.md`, «Preguntas duras».
- Anotar en este archivo qué falló y cuánto tardó el comentario de verdad.
