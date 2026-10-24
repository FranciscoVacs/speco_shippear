# Afirmaciones públicas: qué se puede decir y qué no

Un solo lugar para todo lo que Speco dice de sí misma hacia afuera (pitch, demo, landing, post, email). Antes de decir algo que afirme un hecho, buscalo acá. Si no está, agregalo con su estado y su evidencia.

**Estados**
- `verificado`: es verdad hoy y tiene evidencia en el repo o en una prueba real.
- `con matiz`: se puede decir sólo con la salvedad indicada.
- `placeholder`: todavía no existe; en un guion va como `[PLACEHOLDER: ...]`.
- `no existe`: es falso hoy. No se dice.

Fecha de corte: **2026-10-21** (las filas «Circuito de decisión» son del 2026-10-24). Esta tabla DEBE actualizarse en el mismo PR que cambia el producto o consigue una prueba real.

## Motor y CLI

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| Revisa una spec de Spec Kit antes de que exista código: cobertura, calidad (EARS), contradicciones | verificado | `README.md`, `src/specreview/analyzers.py`, `pytest` contra `examples/invitations/expected.json` |
| `specreview demo` encuentra 2 bloqueantes en segundos, sin conexión y sin API key | con matiz | Verificado a mano el 2026-10-21: `CON001` (5.000 vs 10.000 USD) y `COV001` (requisito que nadie implementa), ejemplo `wire-transfers`. **En Windows falla** por `cp1252` hasta mergear PR #44. Requiere acceso al repo privado |
| Todo es determinista y offline por defecto; el modelo es opcional | verificado | `D-001`, `D-003`, `src/specreview/llm.py` |
| Lo que frena es explícito; lo inferido por texto es advertencia | verificado | `README.md` «Cómo funciona», `docs/04` |
| La precisión sobre prosa real sin modelo es alta | no existe | `docs/04-real-repo-calibration.md` dice lo contrario: sin `--llm` es limitada |
| Revisa contra objetivos y decisiones de producto (`PRD001-005`) | verificado | `docs/13`, `src/specreview/product.py` |
| Funciona con cualquier formato de spec | no existe | Sólo Spec Kit (`spec.md`/`plan.md`/`tasks.md`), `docs/30-product-manager-guide.md` §8 |

## Agentes (MCP, plugin, gate)

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| Los agentes consultan la spec antes de implementar vía MCP (`get_blockers`, `check_requirement`) | con matiz | `src/specreview/mcp.py`, `docs/11`. Probado sólo por stdio, nunca en un cliente real (`TODO.md` T-001) |
| En Claude Code, `/speckit.implement` se frena si hay bloqueantes | con matiz | `plugin/hooks/hooks.json`. Sin probar en Claude Code real (T-001) |
| Fuera de Claude Code hay instrucciones y un hook de git | con matiz | `specreview init --agents`, `gate --install-hook` (PR #41). Las instrucciones persuaden; sólo el hook obliga. Sin probar en clientes reales |
| Los agentes leen y proponen; sólo una persona decide | verificado | `D-012`; lo impone la base en modo cloud (`docs/22`) |

## Pull requests y GitHub

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| Una GitHub Action deja un comentario resumen en el PR, que se actualiza | con matiz | `action.yml` existe y lo hace. **Nadie de afuera la puede usar:** no existe el tag `@v1` y el repo es privado. Actions está bloqueado por billing en la cuenta del dueño |
| «Instalá la GitHub App en un clic» | con matiz | La App pública `speco-pr-review` está instalada y comentando en `speco-playground` desde el 2026-10-21 (PR #1; `POSICIONAMIENTO.md` §6), y el comentario lleva el enlace «Instalá Speco». La instalación es la pantalla de GitHub: elegir repo y confirmar, no literalmente un clic. El flujo de conexión de la app cloud (empresa ↔ repo, `cloud/speco_cloud/`) sigue sin desplegar. Decir «se instala desde GitHub en un minuto» |
| Speco comenta el PR en idioma de negocio: qué cambia (un valor pasa de X a Y), qué contradice, qué tareas y decisiones afecta | verificado | Handler en `cloud/speco_cloud/pr_review.py` (spec 026). Probado en el PR #1 de `agustindelmonti/speco-playground` el 2026-10-21 (ver «Tesis de valor» abajo). PRs desde forks sin probar |
| El comentario llega en segundos | con matiz | Medido una vez: 3,4 s en el PR #1 de `speco-playground` (2026-10-21; `POSICIONAMIENTO.md` §6). N = 1: decir «en segundos», no una cifra |
| Funciona con Bitbucket | no existe | El proveedor es simulado (`cloud/speco_cloud/providers/bitbucket.py`). Se puede decir «diseñado para varios proveedores» (`D-013`), no «funciona con Bitbucket» |

## App y servicio cloud

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| Hay una demo pública de la app | con matiz | Existe en Vercel y es **100 % simulada** (agente en el navegador, sesión y facturación de ejemplo). Decir «demo con datos de ejemplo» |
| Te registrás y conectás tu repo hoy | no existe | El servicio no está desplegado en ningún lado. El login con Supabase nunca se probó de verdad (`docs/19`, T-010) |
| Retrato inicial: las reglas que tu software cumple hoy | con matiz | Código en `specs/014-initial-portrait`, `docs/18`. Nunca probado con un modelo real ni con GitHub real; precisión sin medir |
| Aviso de *cambio sin decidir* después del merge | con matiz | Mira si cambiaron las líneas de evidencia, no el comportamiento (`docs/18`). Sin GitHub real |
| Aprobaciones auditables con hashes encadenados | verificado | `src/specreview/approvals.py`, `specreview approvals verify`, `docs/14` |
| La app avisa si el registro de aprobaciones fue editado a mano | verificado | `web/scripts/verify-approvals-server.mjs` (2026-10-24): aviso con el id de la entrada, en el historial y en el panel de la feature. Hueco conocido: borrar entradas del **final** de la cadena no se detecta (`docs/37`) |
| Slack y Jira | con matiz | Probados contra servidores falsos, nunca contra un workspace real (`docs/14`) |
| Cada empresa aislada de las demás | con matiz | Diseño con RLS en Postgres (`D-008`, `docs/17`). Sin despliegue real ni auditoría externa |
| Registro con teléfono verificado | con matiz | Spec 017, probado con el proveedor simulado de Supabase. **Prueba manual pendiente:** un SMS real (necesita credenciales de Twilio u otro proveedor en Supabase). Hasta entonces, no decirlo en público |

## Circuito de decisión en la nube (`docs/38`, specs 027 y 016)

Todo esto está probado con una base real y un GitHub **falso**, y en un navegador real contra el servicio. Nada se probó contra GitHub real ni está desplegado: las migraciones y el permiso de la App faltan (`docs/38`, «Desplegarlo»).

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| «Tu turno» en la app cloud muestra las features de los repositorios de la empresa | con matiz | Antes mostraba las muestras de la demo (`web/src/data.ts` no pedía nada al servicio). Verificado en `tests/cloud/test_decision_loop.py` y `verify-cloud.mjs`. Sin desplegar |
| Una decisión tomada en la app queda en un registro encadenado en la base, con quién y sobre qué versión | con matiz | Mismo respaldo. El rechazo a *viewers* y a tokens de agentes lo impone la base. Sin desplegar |
| El comentario del PR enlaza a decidir en la app y el PR lleva un check que la decisión resuelve | con matiz | `tests/cloud/test_decision_bridge.py` con GitHub falso. Falta el permiso *Checks* en la App y un PR real. Solo en repositorios que la empresa conectó; el repo de prueba del QR no tiene empresa |
| El check puede impedir un merge | con matiz | Solo si el repositorio lo exige en la protección de rama. Speco informa, no mergea |
| El comentario y el check no nombran a quien decidió ni repiten su motivo | verificado | `test_deciding_in_the_app_resolves_the_check_and_the_comment_without_naming_anyone` |
| Quien no tiene código cuenta lo que quiere, decide una pregunta por vez y se lleva un texto para su herramienta de IA | con matiz | `tests/cloud/test_ideas.py` y el navegador. Preguntas deterministas, sin modelo. Falta comparar lo construido con lo decidido (spec 016, historia 4) |
| Un agente sin revisión toma solo decisiones de negocio y las avisa únicamente al final de su respuesta | con matiz | 3 corridas, un modelo, una feature (`EXPERIMENTO_RETRABAJO.md`). Acertó el límite las tres veces. **No decir** que dio respuestas distintas: eligió lo mismo |
| Speco da el mismo resultado cada vez que revisa la misma spec | verificado | Tres corridas de `specreview examples/wire-transfers -f json` dan el mismo hash (2026-10-24). No es una afirmación sobre un modelo: el motor base no usa ninguno |
| «Speco detecta si lo que construyó tu herramienta de IA contradice lo que decidiste» | no existe | Historia 4 de la spec 016, sin construir |

## Negocio

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| Plan gratis con créditos | con matiz | Diseñado e implementado en el servicio (`docs/25`), sin despliegue |
| Precios: Pro 29 USD, Team 99 USD | con matiz | `docs/30-billing.md` los llama «supuestos para ajustar». El cobro es **simulado**. **[DECIDIR]** si se dicen en público |
| Se puede pagar hoy | no existe | Cobro simulado; sin proveedor real (Stripe no opera desde Argentina) |
| Instalable con `pip install specreview` | no existe | No está en PyPI (`TODO.md` T-003) |
| Open source / con licencia | no existe | No hay `LICENSE` (T-002). **[DECIDIR]** licencia |
| Clientes que usan Speco | placeholder | Ninguno. `[PLACEHOLDER: cliente real, con permiso]` |
| Testimonios, logos, casos, prensa | placeholder | Ninguno. No fabricar |
| Resultados medidos (bugs evitados, horas ahorradas) | placeholder | Sin datos. `docs/27`: con menos de 30 empresas un porcentaje es una anécdota |
| Speco se usa sobre su propio repo | con matiz | `G-12`, `specs/` revisadas con `specreview` (dogfooding de la CLI). La conexión cloud del propio repo no está desplegada |
| YC pidió un «Cursor para product managers» | con matiz | Figuraba como primer ítem de la *Request for Startups* de **primavera 2026** (febrero), según varias fuentes secundarias ([TechStartups, 4-feb-2026](https://techstartups.com/2026/02/04/y-combinator-is-out-with-its-2026-request-for-startups/), [Builder.io](https://www.builder.io/blog/cursor-for-product-managers)). La página actual de YC (<https://www.ycombinator.com/rfs>) muestra la lista de otoño 2026 y ya no lo tiene. Decir «YC lo pidió en su lista de primavera 2026»; no citar texto textual ni nombrar al partner (las fuentes no coinciden: Diana Hu o Andrew Miklas) |
| «Detectamos cualquier cambio de comportamiento» | no existe | Garantía 1 parcial (`docs/16` §3). Decir «lo decidido no se pisa en silencio» |
| «Si cambio esta regla, ¿qué se rompe?» (impacto sobre un grafo de intención) | no existe | Visión, `docs/31` §4 (PR #43). Se presenta como hacia dónde vamos, nunca en presente |

## Intención verificada (`docs/37`)

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| Si un agente edita el test que verifica una regla, esa verificación deja de contar y Speco nombra el test editado | verificado | Spec 032, `tests/test_strength.py`. En el ledger (CLI, MCP, app), en `specreview diff` y, si el repo activa `[pr] review_tests = true`, en el comentario del bot de GitHub (sin eso el bot no lee tests). Mira el código del test, no sus helpers |
| Speco dice si la evidencia de cada regla son ejemplos o casos generados, y nunca dice «probada» | verificado | Spec 032 (`D-019`). Reconoce Hypothesis, fast-check, jqwik, `forAll`, `proptest!` |
| Un porcentaje de requisitos que son invariantes («el X % se puede verificar formalmente») | no existe | Hay una primera medición heurística sin revisar a mano (`docs/37` §7 paso 1). No decir la cifra |
| Speco prueba matemáticamente que el código cumple lo decidido | no existe | No hay ninguna verificación del código. Decir «hacia dónde vamos» |
| Speco detecta regresiones de reglas de negocio en el código | no existe | Solo detecta contradicciones y cambios de spec (garantía 1 parcial, `docs/16` §3) |
| Hacia dónde vamos: probar que lo construido es lo que se pidió | con matiz | Es visión (`D-019` propuesta, `docs/37`). Siempre en futuro. Sin prototipo ni medición |
| Una prueba formal solo vale si la regla que prueba es la correcta, y eso lo revisa una persona con Speco | verificado | Es un hecho de la verificación formal (`docs/37` §3), no una capacidad del producto: se puede decir como argumento |
| `specreview verification` lista qué requisitos cita algún test, propiedad o prueba, y marca referencias rotas | con matiz | Existe y tiene tests (`tests/test_verification.py`). Solo reconoce etiquetas `verifies[nivel]: 010/FR-003` en archivos de test; citar no es verificar. Lo trae `specreview diff`, no el comentario de la GitHub App |
| Las propiedades detectan más bugs que los tests de ejemplo | no existe | Medido con `mutmut` el 2026-10-24 (998 mutantes, 4 módulos): propiedades 61 %, ejemplos 73 %. Decir «complementan»: los ejemplos más las propiedades matan 81 % contra 73 % de los ejemplos solos, con propiedades afinadas contra esa misma medición. `docs/37` §7 |
| Los flujos locales de cada persona (desarrollador, producto, aprobador, agente, CI, ingeniería) cumplen lo prometido | verificado | `tests/test_user_flows.py` los recorre sobre un repo git de ejemplo. No cubre el servicio cloud, la GitHub App real ni el cobro (sin desplegar) |
| Los flujos del servicio cloud funcionan contra un Postgres real | con matiz | `tests/cloud` 261/261 y `verify-cloud.mjs` 127/127 (2026-10-24), con sesión firmada a mano y un GitHub falso. **No** contra Supabase alojado ni GitHub real; no decir «funciona en producción» |
| La base de producción está viva y al día | verificado | Consulta de solo lectura (2026-10-24): el proyecto Supabase `speco-db` está `ACTIVE_HEALTHY` y tiene aplicadas las 15 migraciones de `main` (hasta `20261022000001_github_identity`). Los avisos de seguridad de Supabase: 12 tablas con RLS y sin políticas (acceso solo del servicio, a propósito), 8 funciones `SECURITY DEFINER` ejecutables por usuarios con sesión (las RPC del producto; **[VERIFICAR]** que cada una valide membresía adentro) y protección contra contraseñas filtradas desactivada. No prueba que el login ni la GitHub App funcionen |
| Las propiedades encontraron un bug real en el propio Speco | verificado | Un motivo con `U+0085`/`U+2028` dejaba ilegible el registro de aprobaciones; arreglado. `tests/test_approvals_properties.py`, `docs/37`. Una sola instancia: no es una tasa |
| Speco compite con la verificación formal | no existe | Es la capa previa; se complementan |
| GitHub / Microsoft Research anunciaron PDD Kit, que prueba el código contra una spec formal en Verus que aprueba una persona | con matiz | Anuncios oficiales en X de GitHub Next, GitHub y Microsoft Research (~21-oct-2026), research preview, solo Rust. Sin repo ni documentación pública: decir «anunciaron», con fecha. Links en `EVIDENCIA_DEL_PROBLEMA.md` §5 |
| Verus es una herramienta real de verificación de código Rust | verificado | Microsoft Research y colaboradores; premio de artefacto en SOSP 2024 |
| Anthropic y Theorem probaron con Claude que 123 librerías open source no crashean, en unas pocas semanas | verificado | Post de Anthropic del 2026-10-22. Siempre «para inputs de hasta 64 MB» y «no significa que no tengan bugs» (lo dice el post). `EVIDENCIA_DEL_PROBLEMA.md` §1 |
| Anthropic dice que lo difícil para verificar a escala es conseguir una spec completa y sin ambigüedad, y que un verificador no sabe si la spec es la correcta | verificado | Citas textuales en `EVIDENCIA_DEL_PROBLEMA.md` §1. Se dice como validación del **problema**, nunca como aval de Speco |
| Anthropic: «To prove that a piece of software is correct, we must first state what "correct" even means» y «Most software is riddled with bugs, which AI can now easily find and exploit» | verificado | Textuales del post del 2026-10-22 (la segunda es su resumen). Que en reglas de negocio lo «correcto» lo decide una persona es inferencia nuestra: decirla como nuestra (`EVIDENCIA_DEL_PROBLEMA.md` §1) |
| Theorem ofrece verificación formal gratis a proyectos open source (OSS Verify) | verificado | theorem.dev/oss-verify; la spec es un fuzz test. `EVIDENCIA_DEL_PROBLEMA.md` §2 |
| Otros equipos llegan al mismo principio: «LLMs propose. Deterministic checks and humans decide.» | con matiz | Cita de la visión de `nicholls-inc/crosscheck`; repo chico (1 estrella). Señal de dirección, no de mercado (`EVIDENCIA_DEL_PROBLEMA.md` §3) |
| El 20-oct-2026 se publicaron 53 vulnerabilidades de OpenJDK en una sola actualización, la mayor cantidad en más de una década | verificado | Azul y el advisory de OpenJDK (`EVIDENCIA_DEL_PROBLEMA.md` §4). No decir que las encontró una IA |
| Unas 100 vulnerabilidades críticas de Java, reportadas el mismo día, ocultas hace 17 años | no existe | No hay fuente. Lo más probable es que se mezclara con PHP2Shell (`EVIDENCIA_DEL_PROBLEMA.md` §4) |
| El miércoles 21-oct-2026 salió PHP2Shell: una falla crítica de PHP (CVSS 9,2–9,8; watchTowr: 10), presente desde PHP 5.4 (2012), encontrada con IA, en un lenguaje que usa ~70 % de la web | verificado | Wikipedia, Help Net Security, CNN, Daily Caller (`EVIDENCIA_DEL_PROBLEMA.md` §4). «17 años» no: unos 14 |
| Anthropic pasó de ~2.500 a más de 30.000 cambios mergeados por día (mayo → septiembre 2026) y migró su monorepo de git a un sistema propio (Scion) | verificado | Post de Anthropic Engineering del 2026-10-13 (`EVIDENCIA_DEL_PROBLEMA.md` §6). Son merges, no PRs; no es «su propio GitHub» |
| En el equipo de Scion, las personas revisan «the *intent* of the change as opposed to reading every line of code» y su rol fue muchas veces «to tell Claude "no."» | verificado | Textuales del mismo post. Lo dice ese equipo sobre su sistema, no toda Anthropic. Que la intención tenga que estar escrita es inferencia nuestra |
| «Anthropic hace 20.000 PRs por día» | no existe | Sin fuente. Decir «más de 30.000 merges por día» |
| El miércoles 21-oct-2026: dos RCE críticas en PHP con embargo roto, gobiernos pidiendo sacar sitios de línea, y una CA (eMudhra) con una clave privada que valía 4 | verificado | Prensa citada en `EVIDENCIA_DEL_PROBLEMA.md` §7. El resto del tweet «Anyway, it's Wednesday» se verificó fila por fila en §7. Autor: @fiveoutofnine (Daily Caller); sin link directo al post |
| Speco se integra con Theorem, crosscheck o Rocq, o Anthropic avala a Speco | no existe | No hay relación ni integración |

## Tesis de valor (`PROPUESTA_DE_VALOR.md`)

| Afirmación | Estado | Salvedad / evidencia |
|---|---|---|
| En cada PR que cambia una spec, Speco comenta qué regla de negocio cambia y qué tarea quedó con el valor viejo | verificado | PR #1 de `agustindelmonti/speco-playground`, 2026-10-21, 3,4 s; spec 026. PRs desde forks sin probar |
| Ningún cambio de regla llega al código sin que alguien lo vea | con matiz | Solo si la regla está en una spec y la App está instalada (o el gate). Reglas que viven solo en el código: garantía 1 parcial (`docs/16` §3) |
| Una spec revisada reduce el retrabajo o los tokens del agente | no existe | Medido el 2026-10-21 (`EXPERIMENTO_RETRABAJO.md`): sin diferencia (−2,7 % de costo, dentro del ruido; N = 3, un modelo, una feature). No decir ninguna cifra de ahorro |
| Sin revisión, un agente decide solo reglas de negocio y requisitos que no construye, y lo avisa al final | con matiz | 3 de 3 corridas en `EXPERIMENTO_RETRABAJO.md`: eligieron el límite e ignoraron FR-007 (fraude). Decir siempre «3 corridas, un modelo, una feature», y que acertaron el límite |
| Speco marca antes del código los lugares donde el agente después decide solo | con matiz | 4 de 5 decisiones unilaterales del experimento coincidieron con un hallazgo previo; la quinta (FR-011) solo a medias. `EXPERIMENTO_RETRABAJO.md`. Siempre con «3 corridas, una spec, un modelo» |
| Speco te dice qué ideas merecen construirse | no existe | Speco evalúa si una idea está bien decidida, no si vale la pena en el mercado. Decir «podá en la spec, no en el código» |
| La revisión no necesita mandar el código a un modelo externo | verificado | Motor determinista y offline por defecto (`D-001`, `D-003`); el modelo es opcional |
| Bancos o fintech usan Speco | no existe | Ninguna conversación todavía (`../sales/SEGMENTO_REGULADOS.md`) |
| Speco corre sobre Spec Kit, no lo reemplaza | verificado | `docs/34` |

