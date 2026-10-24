# TODO: hallazgos del onboarding para desarrolladores (CLI + MCP)

Cola **FIFO**: el agente que la lee toma el **primer ítem con `Estado: pendiente`**, lo termina (o lo parte en ítems nuevos al final),
cambia su estado a `hecho` con el link al PR, y sigue con el siguiente. No saltear ni reordenar sin motivo escrito acá.
Cada ítem es autocontenido: lo que sigue alcanza para abrir una task sin volver a esta conversación.

Origen: sesión que escribió `docs/28-developer-quickstart.md`, `docs/29-developer-recipes.md` y `specreview demo` (PR #37).
Todo lo de abajo se **encontró y se dejó afuera a propósito** de ese PR.

Formato: `T-NNN · título` · **Estado** · **Qué pasa** (con evidencia) · **Hecho cuando**.

---

## T-001 · Verificar el MCP, el plugin y el hook en clientes reales
**Estado:** pendiente
**Qué pasa:** el MCP sólo se probó a mano por stdio (JSON-RPC por `printf | specreview mcp`) y `gate --hook` simulando el stdin del hook. Nunca se probó en un cliente real. Quedan **sin verificar**: (a) el plugin de Claude Code (`/plugin marketplace add agustindelmonti/speco.ia` + `install`), (b) que el hook `UserPromptSubmit` dispare y muestre los bloqueantes, (c) los snippets de `docs/28` para Cursor (`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`), Claude Desktop y Codex (`~/.codex/config.toml`), (d) el bucle de la receta 1 de `docs/29` (el agente arregla la spec y repite `get_blockers`), descrito a partir de `plugin/commands/review-spec.md`, no observado.
**Hecho cuando:** cada cliente de `docs/28` se probó de punta a punta y la config corregida donde falló; `docs/29` receta 1 refleja lo observado; el texto de receta 2 («Resultado de la iteración…», un ejemplo ilustrativo) o se reemplaza por una salida real o se rotula como ilustrativo.

## T-002 · Elegir y agregar un `LICENSE`
**Estado:** pendiente (decisión del dueño)
**Qué pasa:** el repo no tiene licencia (`docs/10-adoption.md`: «Pendiente del dueño»). Un desarrollador en una empresa normalmente no puede adoptar ni recomendar una herramienta sin licencia.
**Hecho cuando:** hay `LICENSE` en la raíz, `license` en `pyproject.toml` y el README la menciona. Si el dueño no decidió, el agente **no elige**: deja la pregunta documentada y pasa al siguiente ítem.

## T-003 · Publicar en PyPI
**Estado:** pendiente (bloqueado por T-002 y por dar de alta el proyecto en PyPI, que hace el dueño)
**Qué pasa:** `pip index versions specreview` → «No matching distribution». Todo se instala con `uvx --from git+https://github.com/agustindelmonti/speco.ia`, que exige `git` y red y compila en cada uso. `.github/workflows/publish.yml` ya existe (trusted publishing, tag `v*`).
**Hecho cuando:** `uvx specreview demo` y `uvx specreview mcp .` funcionan; los snippets de `docs/28`, `docs/29`, `docs/11`, `README.md`, `plugin/hooks/hooks.json` y el README usan `uvx specreview` en vez de `--from git+…` (buscar con `grep -rn "from git+"`).

## T-004 · Medir y acotar la latencia del hook del plugin
**Estado:** pendiente
**Qué pasa:** `plugin/hooks/hooks.json` ejecuta `uvx --from git+https://github.com/agustindelmonti/speco.ia specreview gate --hook …` en cada prompt que contiene `speckit.implement` o `/implement`. No se midió cuánto tarda con `uvx` resolviendo git (puede ser segundos y requiere red), ni qué pasa offline. El patrón `*/implement*` también puede coincidir con prompts que no piden implementar (por ejemplo una ruta `src/implement/`); el `gate` los deja pasar si no hay bloqueantes, pero igual paga el costo.
**Hecho cuando:** hay una medición (con y sin caché de `uvx`, con y sin red) y, según el resultado: el hook usa el binario instalado si existe (`command -v specreview`) con `uvx` como fallback, y/o el patrón se ajusta, y/o se fija una versión/tag. Que falle sin red **nunca bloquee** al usuario (hoy `gate` ya devuelve 0 ante errores del propio gate; verificar el caso «uvx no pudo bajar el paquete»).

## T-005 · `specreview mcp` sin argumento debería encontrar el repo solo
**Estado:** pendiente
**Qué pasa:** `specreview mcp .` resuelve `.` contra el directorio desde donde el cliente lanza el proceso. En Claude Desktop (y a veces en otros) ese directorio no es el repo, y el servidor responde «0 features» sin explicar por qué; `docs/28` lo documenta como troubleshooting, pero es una trampa evitable.
**Hecho cuando:** `specreview mcp` sin argumento, o con una variable `SPECREVIEW_ROOT`, sube desde el cwd hasta encontrar `specs/` o `.specify/`; cuando no encuentra nada, el servidor lo dice en `instructions` del `initialize` y en la respuesta de `list_features` (con la misma pista que `no_features_hint`). Test en `tests/test_mcp.py`.

## T-006 · Que `specreview init` deje listo el MCP del cliente
**Estado:** pendiente
**Qué pasa:** hoy conectar el MCP exige copiar un JSON/TOML a mano desde `docs/28`, distinto por cliente. Es el paso con más fricción después de instalar.
**Hecho cuando:** `specreview init --mcp {claude-code|cursor|vscode|codex}` escribe o fusiona (sin pisar lo existente) la config del cliente, con ruta absoluta cuando el cliente la necesita, e imprime cómo comprobarlo. Test con un `.cursor/mcp.json` preexistente. Depende de T-001 para saber que los formatos son los correctos.

## T-007 · Enforcement y guía para agentes que no son Claude Code
**Estado:** hecho (https://github.com/agustindelmonti/speco.ia/pull/41): `specreview init --agents` escribe el bloque en `AGENTS.md`, `.cursor/rules/specreview.mdc` y `.github/copilot-instructions.md` (idempotente, entre marcas); `specreview gate --install-hook pre-commit|pre-push`; documentado en `docs/28`. Sigue sin verificarse en clientes reales (T-001)
**Qué pasa:** el gate que frena `/speckit.implement` y la skill `spec-review` existen sólo en el plugin de Claude Code. En Cursor/VS Code/Codex el agente tiene las herramientas MCP pero **nada le dice que las use antes de implementar**: queda a criterio del modelo.
**Hecho cuando:** hay un fragmento listo para copiar en `AGENTS.md` / `.cursor/rules` / `.github/copilot-instructions.md` (equivalente a `plugin/skills/spec-review/SKILL.md`), documentado en `docs/28`, y `specreview init` puede escribirlo (ver T-006). Para enforcement duro fuera de Claude Code: documentar `specreview gate` como pre-commit/pre-push hook.

## T-008 · Más ejemplos en `specreview demo`
**Estado:** pendiente
**Qué pasa:** `demo` incluye sólo `wire-transfers` (copia de `examples/wire-transfers/specs`, vigilada por `test_bundled_demo_matches_the_repo_example`). No hay demo de la capa de producto (`examples/subscriptions`, reglas `PRD00x`) ni del caso con más ruido (`examples/invitations`: contradicción + scope colado + EARS).
**Hecho cuando:** `specreview demo --example {wire-transfers|invitations|subscriptions}` (default sin cambios), cada ejemplo empaquetado y con su test de sincronía; el de `subscriptions` incluye `product/` y la salida de `docs/29` receta 6 sale del demo, no de un clon. Ojo: `package-data` en `pyproject.toml` hoy sólo incluye `demo_data/**/*.md`.

## T-009 · Quickstart en inglés
**Estado:** pendiente (la página `/docs/developers` ya está en inglés desde el PR #37; falta `docs/28` y el bloque del README)
**Qué pasa:** toda la documentación y los mensajes de la CLI están en español. Un desarrollador que no lee español no puede hacer el onboarding de `docs/28`.
**Hecho cuando:** existe una versión en inglés de `docs/28` (y el bloque del README), con los mismos comandos probados. Alcance de los mensajes de la CLI (i18n) es otro ítem: **no** incluirlo acá; si hace falta, agregar un T-nuevo al final.

## T-010 · No hay un endpoint público del MCP remoto para probar
**Estado:** pendiente (decisión de producto)
**Qué pasa:** `docs/22-speco-on-speco.md` y `docs/29` hablan del MCP remoto (`POST {SERVICIO}/mcp`, OAuth, sólo lectura) con `<servicio>` como placeholder; no hay URL pública ni una forma de probarlo sin desplegar el servicio. `docs/19-cloud-app.md` también aclara que el login real contra Supabase y GitHub nunca se probó. Tampoco se corrió `tests/cloud` en la sesión del PR (requiere Postgres): sólo `pytest --ignore=tests/cloud` (284 passed, 1 skipped).
**Hecho cuando:** hay una instancia de prueba documentada (o un `docker compose` local) y `docs/29` «Más allá del repo» apunta a un comando real; se corrió `tests/cloud` en CI o localmente y el resultado queda anotado.

## T-011 · Detalles menores de la CLI que vale revisar
**Estado:** pendiente
**Qué pasa:** (a) `specreview examples --all` ahora sugiere la ruta correcta, pero el mensaje base sigue diciendo `…en examples/specs` (conserva `searched` porque `tests/test_all_mode.py::test_no_features_exits_2_naming_the_directory` lo exige; puede confundir). (b) `serverInfo.version` del MCP remoto es `0.1.0` mientras el paquete es `0.2.0`. (c) `specreview demo` deja la copia en `/tmp/specreview-demo-*` sin limpiar (a propósito, para que el usuario la explore); no hay `specreview demo --clean`. (d) `demo` y las pistas de `no_features_hint` asumen rutas POSIX en el ejemplo de salida; no se probó en Windows.
**Hecho cuando:** cada punto se arregló o se descartó con una línea de motivo debajo del ítem.

## T-012 · La página de la app y los docs del repo duplican el contenido
**Estado:** hecho (PR #37): la página lee todo de `web/src/developers/content.json` (código una vez, prosa en es y en en) y `tests/test_developer_docs.py` falla si un comando de la página no está en `docs/28`/`docs/29` o si una salida mostrada ya no es la que imprime la CLI. Pendiente menor: los `.md` siguen escritos a mano (el test vigila, no genera).
**Qué pasa:** `web/src/developers/content.ts` (la página `/docs/developers`) repite a mano comandos, snippets de cada cliente MCP y salidas de `docs/28-developer-quickstart.md` y `docs/29-developer-recipes.md`. Si cambia un comando de la CLI, hay tres lugares para actualizar y nada avisa si divergen. La UI tampoco puede mostrar que un snippet se probó en el cliente real (T-001).
**Hecho cuando:** una sola fuente (por ejemplo, `content.ts` se genera desde los `.md`, o los `.md` se arman desde `content.ts`) o un test que compare los comandos clave entre ambos; `scripts/gen_samples.py` ya genera datos de la demo y es el lugar natural.

## T-013 · Onboarding de la app en inglés y sin spec propia
**Estado:** hecho (PR #37): el cuerpo de `/docs/developers` existe en inglés (sin el aviso «content is in Spanish») y hay `specs/023-developer-onboarding/` revisada con `specreview` (0 hallazgos). Queda fuera, y sigue en T-009: `docs/28` y `docs/29` en inglés, y los mensajes de la CLI (i18n).
**Qué pasa:** el cuerpo de `/docs/developers` está sólo en español (igual que `Guide.tsx`; en inglés la app muestra el aviso «The guide content is in Spanish»); sólo el título, el índice y los enlaces de menú están traducidos. Además el repo se dogfoodea con una spec por feature (`specs/NNN-*`), y este cambio de UI no tiene `specs/023-*` ni pasó por `specreview`.
**Hecho cuando:** el cuerpo existe en inglés (ver T-009) y hay una spec corta de la página (FR de navegación, accesibilidad y snippets válidos) revisada con `specreview`.

## T-014 · La página no distingue modo demo, local y cloud
**Estado:** pendiente
**Qué pasa:** `/docs/developers` es igual en la demo pública de Vercel, con `specreview --serve` y en modo cloud, salvo un enlace a `/agents` cuando hay cloud. En la demo pública, los comandos `uvx --from git+…` dependen de que `main` ya tenga `specreview demo` (hasta mergear el PR #37 no lo tiene). No hay forma de probar la CLI desde la propia app (por ejemplo, un botón «ver la salida de `specreview demo` en la app»).
**Hecho cuando:** se decide si la página muestra algo distinto por modo (p. ej. con `--serve`, apuntar al repo que está sirviendo) y, si sí, se implementa y se agrega a `verify-developers.mjs`.

## T-015 · `web/scripts/test-demo-agent.mjs` ya falla en `main`: cuenta features a mano
**Estado:** pendiente
**Qué pasa:** el chequeo `list: 16 features in 6 repos from the real index` (línea 68) tiene los números fijos; el índice real de `web/public/samples/index.json` ya tenía 28 features en 7 repos en `main` antes del PR #37 (ahora 29 por `specs/023-*`), así que falla desde antes y cada spec nueva lo vuelve a romper. No se tocó en este PR por no ser parte del onboarding.
**Hecho cuando:** el chequeo compara contra el largo y los repos del propio `index.json` en vez de constantes, y `node scripts/test-demo-agent.mjs` pasa completo.

---

# Billing y cobro internacional (por decidir / diseñar)

Origen: PR de billing simulado (`specs/024-billing/`, `docs/30-billing.md`). El cobro hoy es **simulado**; estos ítems quedaron **sin decidir ni diseñar** a propósito.
Los marcados «decisión del dueño» no los elige el agente: deja las opciones documentadas y pasa al siguiente.

## T-016 · Elegir cómo cobrar a EE.UU., Europa y LATAM
**Estado:** pendiente (decisión del dueño)
**Qué pasa:** el dueño vive en Argentina y Stripe pide domicilio/entidad fuera de Argentina. Opciones evaluadas (sin verificar precios ni países soportados; confirmar con cada proveedor y con un contador):
(A) **Merchant of Record** (Paddle, Lemon Squeezy, Polar, FastSpring): sin entidad propia, resuelve IVA/VAT y sales tax, comisión mayor (~5 % + 0,50 USD), a verificar cómo se le paga al dueño en Argentina (Payoneer/PayPal/transferencia).
(B) **Entidad en EE.UU. (Stripe Atlas, Delaware C-corp) o UE (e-Residency de Estonia) + Stripe**: cobro directo pleno; costos anuales, obligaciones fiscales y tributación en Argentina de lo que se retira.
(C) **Cobro local LATAM** (Mercado Pago, dLocal, Ebanx): Pix, boleto, cuotas, precios en moneda local; dLocal/Ebanx suelen pedir volumen.
Recomendación provisoria: A para validar, B + C con tracción, facturación local sólo si un cliente grande la exige.
**Hecho cuando:** el dueño eligió (con la razón escrita en `product/decisions.md` como D-018) y se abrieron los ítems de implementación que correspondan (T-017 en adelante).

## T-017 · Diseñar el adaptador de un proveedor real (checkout alojado + webhooks)
**Estado:** pendiente (depende de T-016)
**Qué pasa:** la interfaz de `cloud/speco_cloud/billing.py` (`PaymentProvider.charge`) asume que **nosotros iniciamos el cobro** y que el worker renueva (`renew_due`). Un MoR, las suscripciones de Stripe y las de Mercado Pago funcionan al revés: el proveedor aloja el checkout, maneja renovaciones/reintentos y avisa por webhook. Las funciones SQL (`start_plan`, `record_failed_payment`, `schedule_plan`, `end_subscription`) ya sirven para eso.
**Hecho cuando:** hay una spec (`specs/025-*`) con: crear la sesión de checkout, endpoint de webhook con firma verificada e idempotencia por id de evento, traducción evento → función SQL (pago, pago fallido, cancelación, cambio de plan), qué pasa con `renew_due` para suscripciones gestionadas por el proveedor (no cobrar dos veces), y pruebas con el sandbox del proveedor elegido.

## T-018 · Precios en más de una moneda
**Estado:** pendiente (decisión de producto, depende de T-016)
**Qué pasa:** `plan_catalog` guarda un precio por plan, sólo en USD. Vender en LATAM/Europa con precios locales (ARS, BRL, MXN, EUR) exige precio por plan y moneda, y decidir si el precio local se fija a mano o se deriva de una cotización. Las facturas ya guardan `currency`, el cálculo de prorrateo y la UI (`money()`) no asumen USD.
**Hecho cuando:** se decidió el criterio (precio fijo por moneda vs. conversión) y `plan_catalog` / `billing.plans()` / la página de planes lo reflejan, con test del prorrateo en otra moneda.

## T-019 · Impuestos y comprobantes fiscales
**Estado:** pendiente (decisión del dueño, con un contador)
**Qué pasa:** las facturas de `invoices` son el registro del producto, **no un documento fiscal**. Falta decidir quién emite el comprobante y quién liquida IVA/VAT/sales tax según el camino de T-016 (con un MoR lo hace el MoR; con Stripe, Stripe Tax y registros propios; en Argentina, factura electrónica ARCA para clientes locales).
**Hecho cuando:** hay una decisión escrita por región y, si corresponde, el dato fiscal del cliente (razón social, tax ID) se pide en el checkout y queda en la factura.

## T-020 · Reintentar un pago ahora, sin esperar el reintento diario
**Estado:** pendiente
**Qué pasa:** una renovación rechazada se reintenta una vez por día durante la gracia (3 días). La persona que arregla su medio de pago no tiene un botón para reintentar ya (`docs/30-billing.md`, «Lo que falta»).
**Hecho cuando:** hay un endpoint y un botón en *Ajustes → Planes* (sólo dueños/admins, sólo con la suscripción en `past_due`) que reintenta el cobro una vez, con la misma garantía de no cobrar dos veces y test.

## T-021 · Qué pasa con las suscripciones vivas si se apaga el cobro
**Estado:** pendiente
**Qué pasa:** con `SPECO_BILLING_PROVIDER` vacío, `renew_due` no renueva ni termina las suscripciones que no sean `manual`; sus créditos vencen y la empresa queda con plan pago pero sin créditos (`no_credits`).
**Hecho cuando:** se decidió el comportamiento (congelar el período, terminar la suscripción y volver a gratis, o impedir apagar el cobro con suscripciones vivas) y hay test.

## T-022 · Créditos sueltos y dónde termina Team
**Estado:** pendiente (decisión de producto)
**Qué pasa:** el único camino al tener más uso es subir de plan; Team es el techo (2400 créditos/480 diarios). No hay compra de créditos extra ni plan a medida, y los precios y créditos de Pro/Team son **supuestos** (un crédito cuesta como mucho ~0,02 USD; `docs/24-growth-gtm.md`) que hay que contrastar con uso real y con el precio vigente del modelo.
**Hecho cuando:** se decidió si hay packs de créditos o un plan superior/contacto, y los números de `plan_catalog` se revisaron contra costo real por crédito (con margen explícito).

## T-023 · Un período no debería derivar (31 → 28) y falta decidir el ciclo anual
**Estado:** pendiente
**Qué pasa:** el período es «+1 mes» desde el día del cobro: una suscripción que empieza el 31 pasa al 28 en febrero y se queda ahí. Tampoco hay ciclo anual con descuento.
**Hecho cuando:** el día de cobro se ancla (por ejemplo, al día original con tope al fin de mes) y se decidió si hay plan anual; con test de fechas de borde.

## T-024 · Detectar contradicciones entre features paralelas (`CON003` / `CON004`)
**Estado:** pendiente (prioridad alta: es el límite más relevante para trabajar con agentes en paralelo, `docs/30` §8)
**Qué pasa:** `CON001` compara requisitos dentro de una feature y `PRD003` contra `product/decisions.md`; dos specs de features distintas que fijan valores o polaridad opuestos para lo mismo, sin citar una `D-n` común, no se detectan. Hoy sólo lo mitiga la receta B de `docs/30` (elevar el concepto a decisión antes de paralelizar).
**Hecho cuando:** (a) `CON003`: `find_candidates()` (`src/specreview/contradictions.py`) corre entre los requisitos de features distintas (agrupando antes por tema para no pagar O(n²) sobre todo el repo); si ninguna de las dos cita la misma `D-n` emite WARNING (BLOCKER si ambas están en curso) con el arreglo «elevar a decisión y citarla en ambas»; en `rules.py`, `decision.py` (`DECISION_RULES`) y `--explain`. (b) `CON004`, preventiva: dos features que tocan el mismo concepto compartido (límite, plan, permiso) sin `D-n` común avisan *antes* de que haya contradicción, para usarla al lanzar agentes en paralelo. Tests con dos features en `make_repo`, con y sin decisión común; actualizar `docs/30` §8 y la receta B; medir falsos positivos sobre `examples/`.

## T-025 · Drift por símbolo, no por línea de evidencia
**Estado:** pendiente
**Qué pasa:** `cloud/speco_cloud/portrait/drift.py` marca «cambio sin decidir» cuando cambian las líneas de evidencia de una regla confirmada, no cuando cambia el comportamiento: una regla repartida en varios archivos puede moverse sin tocar su evidencia (`docs/30` receta E y §8, `docs/18`).
**Hecho cuando:** la evidencia se ancla a un símbolo (función o constante, con AST/tree-sitter) y el drift compara el cuerpo normalizado; opcionalmente se registran como evidencia secundaria los archivos que la regla consulta. Fuera de alcance acá: tests de caracterización generados desde la regla (más caro; abrir ítem aparte si se quiere). Medir ruido sobre un repo real antes de dejarlo activo.

## T-026 · Speco como extensión de Spec Kit (hook `before_implement`)
**Estado:** pendiente
**Qué pasa:** Spec Kit permite enganchar comandos antes y después de `/speckit-implement` con `.specify/extensions.yml`. Un hook obligatorio lo corre el agente, sea cual sea el cliente. Hoy el freno de Speco antes de implementar solo existe como hook de Claude Code (`plugin/hooks/hooks.json`) e instrucciones (`specreview init --agents`). Análisis completo en `docs/34-speckit-hooks-and-gates.md`.
**Hecho cuando:** (a) se confirmó en la documentación de Spec Kit cómo se publica e instala una extensión; (b) existe un comando `speckit.speco.gate` que corre `specreview gate` y sale con error ante bloqueantes; (c) `specreview init --speckit` agrega el `before_implement` obligatorio a `.specify/extensions.yml` sin pisar lo existente, con test; (d) se probó con `/speckit-implement` en al menos dos agentes y `docs/34` refleja lo observado.


## T-027 · Un error del entorno no debería registrar una regla como «rota»
**Estado:** hecho (spec 030): una corrida sin tests queda como `error` y no cambia el estado
**Qué pasa:** en el experimento de `docs/40`, `specreview ledger . --verify 001/FR-007` registró **ROTA** porque `python -m pytest` no estaba instalado (`No module named pytest`), no porque el software fallara. Quedó en `verifications.jsonl` como una regresión de producto.
**Hecho cuando:** una corrida que no llegó a ejecutar ningún test (sin `passed_pattern` ni un patrón de fallo de test en la salida, o el ejecutable no existe) se registra como `error` y no cambia el estado de la regla; test en `tests/test_ledger.py`.

## T-028 · Que el agente proponga las vinculaciones de números (`[values]`)
**Estado:** hecho (spec 030): `--suggest-values` y la herramienta MCP `suggest_values`
**Qué pasa:** la spec 029 exige que una persona escriba cada vinculación en `specreview.toml`. Es el costo de entrada: nadie va a vincular 400 reglas a mano. Las reglas con número son pocas (en este repo, ~1 de cada 4) y casi siempre el número está en una constante o un setting.
**Hecho cuando:** una herramienta MCP `propose_values` (o `specreview ledger --suggest-values`) busca, para cada regla con número, las líneas del código que tienen ese número cerca de una palabra de la regla, y devuelve el bloque TOML para revisar en el PR. No escribe nada sola. Medir precisión en este repo.

## T-029 · Verificación continua: correr la suite una vez y registrar todas las reglas
**Estado:** hecho (spec 030): `--junit`, `--verify-all` y el paso de CI que nombra las reglas rotas
**Qué pasa:** «verificada» es la última corrida de cada regla, y una corrida vieja no se invalida cuando cambia el código (sólo cuando cambia el texto). Hoy cada regla dice hace cuántos commits corrió (`run_age`, spec 029), pero los números derivados (200 = 10 × 20) sólo se detectan corriendo los tests.
**Hecho cuando:** `specreview ledger . --verify-all --junit report.xml` toma **una** corrida de la suite (JUnit), mapea cada test a las reglas que cita y registra el resultado de todas en el commit actual; un job de CI de ejemplo lo corre en cada push a `main` y el PR muestra «reglas que este PR rompe».
