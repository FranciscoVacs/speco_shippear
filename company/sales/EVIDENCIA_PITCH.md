# Evidencia para el pitch: el flujo, los registros y los números

Material para armar slides y respuestas duras. Todo sale de corridas reales del 2026-10-24 (el repo, no maquetas), con la salvedad que le corresponde a cada pieza. Lo que se puede decir en voz alta vive en [`../positioning/AFIRMACIONES.md`](../positioning/AFIRMACIONES.md); si algo de acá no está allá, no se dice.

**Cómo regenerar las capturas:** `cd web && npm run build && node scripts/walkthrough.mjs` (necesita Chromium y `PYTHONPATH=src`). Levanta el servidor local sobre una copia del ejemplo `wire-transfers`, recorre el flujo y escribe las imágenes en [`flujo/`](flujo/).

## 1 · Qué mostrar y en qué orden (3 minutos)

La historia: *«un agente va a construir transferencias; nadie decidió cuál de dos límites manda»*. Los datos son los del ejemplo ficticio `wire-transfers` (límite de 5.000 contra 10.000 USD).

| # | Captura | Qué se ve | Qué decir | Salvedad |
|---|---|---|---|---|
| 1 | [`01-terminal-primer-resultado-demo`](flujo/01-terminal-primer-resultado-demo.png) | `specreview demo`: dos bloqueantes en ~0,1 s, sin repo, red ni clave | «El primer resultado tarda segundos y funciona sin conexión» | Es un ejemplo; sobre prosa real sin modelo la precisión es limitada (`docs/04`) |
| 2 | [`02-inicio-chat-vacio`](flujo/02-inicio-chat-vacio.png) | La app abre en un chat vacío: «¿Qué espera tu decisión hoy?» | «Quien decide pregunta, no configura» | La barra lateral (Acme, Alex Demo, plan Pro) es de demo |
| 3 | [`03-agente-tarjeta-de-revision-demo`](flujo/03-agente-tarjeta-de-revision-demo.png) | El agente responde con una tarjeta: bloqueantes, advertencias y los hallazgos más graves | «Le pedís una revisión y te devuelve qué arriesgás» | **Agente simulado** (rotulado «Modo demo: respuestas de ejemplo»). La tarjeta usa datos reales de una spec de ejemplo, pero no habla un modelo |
| 4 | [`04-tu-turno-decisiones-pendientes`](flujo/04-tu-turno-decisiones-pendientes.png) | «Tu turno»: las dos reglas que se contradicen y una tarea que nadie pidió | «Solo ves lo que solo vos podés resolver» | El aviso «6 reglas de tu software actual» viene de las muestras de la demo |
| 5 | [`05-revision-resumen-ejecutivo`](flujo/05-revision-resumen-ejecutivo.png), [`06-revision-completa`](flujo/06-revision-completa.png) | Resumen ejecutivo: «Necesita tu decisión»; «qué se arriesga»: el agente va a adivinar | «Hasta que decidas, el agente va a tener que adivinar» | Los 13 hallazgos son del motor determinista |
| 6 | [`07`](flujo/07-aprobaciones-sin-miembros.png) · [`08`](flujo/08-aprobaciones-viewer-solo-lectura.png) · [`09`](flujo/09-aprobaciones-aprobador-con-acciones.png) | Sin miembros no hay botones; un *viewer* lee; un *approver* decide | «Solo decide quien tiene permiso» | Identidad por token en el servidor local; en la nube, por la sesión |
| 7 | [`10`](flujo/10-aprobar-con-bloqueantes-rechazado.png) · [`11`](flujo/11-aprobar-con-override-y-motivo.png) · [`12`](flujo/12-aprobacion-registrada.png) | Aprobar con bloqueantes se rechaza; con override y motivo, se registra y queda marcado | «Se puede aprobar igual, pero queda dicho quién y por qué» | — |
| 8 | [`13-aprobacion-vieja-la-spec-cambio`](flujo/13-aprobacion-vieja-la-spec-cambio.png) | Cambió la spec: «hay que volver a decidir» | «Una aprobación no sobrevive a un cambio» | — |
| 9 | [`14-historial-de-decisiones`](flujo/14-historial-de-decisiones.png) | Quién decidió qué, cuándo y sobre qué versión | «Auditoría sin pedirle nada a nadie» | — |
| 10 | [`15`](flujo/15-registro-adulterado-en-la-app.png) · [`16`](flujo/16-terminal-registro-adulterado-detectado.png) · [`17`](flujo/17-terminal-no-se-construye-sobre-un-registro-roto.png) | Alguien edita el registro a mano: la app avisa, el CLI lo detecta y no se construye encima | «No se puede reescribir la historia sin que se note» | **Con un hueco:** borrar entradas del *final* no se detecta (`docs/37` §7, `FR-003` de la spec 010). No decir «no se puede borrar» |
| 11 | [`18-terminal-pr-que-mueve-un-umbral`](flujo/18-terminal-pr-que-mueve-un-umbral.png) | `specreview diff`: «FR-005 cambió: 10,000 USD → 15,000 USD» y `T004` sigue con el valor viejo | «Mirá qué cambia en el negocio, no qué líneas cambiaron» | Es el texto del comentario en la terminal; el comentario real en GitHub no se probó contra la App en producción (ver abajo) |

**Qué NO está en estas capturas:** registrarse, conectar un repo con la GitHub App y recibir el comentario en una PR real. Existe una base de producción sana y migrada (se comprobó con una lectura), pero el recorrido necesita una persona haciendo el login y la instalación; no se verificó (`AFIRMACIONES.md`).

## 2 · Los registros (para mostrar que es auditable)

¿Hacen falta en el pitch? **Uno solo, y como apéndice.** El de aprobaciones respalda «auditable» (garantía 3 de `docs/16`); el de baseline respalda «se adopta sin frenar el equipo» y se cuenta mejor con una frase. Los dos son reales, de `wire-transfers`.

**Registro de aprobaciones** (`.specreview/approvals.jsonl`, dos entradas encadenadas; `hash` y `spec_hash` son SHA-256):

| Campo | Entrada 1 | Entrada 2 |
|---|---|---|
| `id` | `a_000001` | `a_000002` |
| `decision` | `approved` | `rejected` |
| `by` | Ana · approver · cli | Ana · approver · cli |
| `reason` | «Lo decidió compliance (ticket 123): sale detrás de un flag» | «Falta resolver FR-003 contra FR-004» |
| `override` | **true** (aprobó con 2 bloqueantes abiertos) | false |
| `verdict` / `open` | `needs_decision` · 2 bloqueantes | `needs_decision` · 2 bloqueantes |
| `files` | hash de `spec.md`, `plan.md`, `tasks.md` | los mismos (misma versión) |
| `prev` | `genesis` | `8db279fa…0a6a` (el `hash` de la 1) |
| `hash` | `8db279fa7c0c…ee0a6a` | `847abae9d76d…8883c2` |

Lo que enseña: quién, cuándo, **qué versión** de la spec (si cambia, la aprobación queda vieja) y **con qué bloqueantes abiertos** decidió. Si alguien edita la entrada 1, su `hash` ya no coincide y la entrada 2 deja de enlazar.

**Baseline** (`.specreview/baseline.json`, 13 hallazgos registrados): cada entrada es `fingerprint` + feature + regla + ids + archivo, por ejemplo `440a708123d9 · 006-wire-transfer-limits · CON001 · FR-003, FR-004 · spec.md`. La huella **no usa el número de línea**, así que mover texto no la invalida. Efecto: desde ese día solo se reporta lo nuevo.

## 3 · Los números

### 3.1 · Qué requisitos admiten una propiedad: invariante, condicional, no formalizable

Se clasificaron los **301 requisitos `FR-NNN`** de las specs de `specs/` (25 de 26; la 011 no usa ese formato).

| Clase | Qué es | Ejemplo real | Requisitos | % |
|---|---|---|---|---|
| **Invariante** | Algo que vale siempre: «nunca», «como máximo», cadena de hashes, aislamiento | «The system MUST reward each referral **at most once**» (021/FR-006) · «a balance MUST NOT go below zero» (020/FR-012) | **99** | 33 % |
| **Condicional** | «When X, el sistema Y»: un test por ejemplo alcanza | «When a reworded requirement contains a number whose value changed, the system MUST show the old and the new value» (026/FR-002) | 121 | 40 % |
| **No formalizable** | Interfaz, navegación, textos, teclado | «The system MUST let the user operate the introduction with the keyboard alone» (004/FR-010) | 81 | 27 % |

**Para qué sirve en el pitch:** responde «¿no es esto un test?». Un tercio de lo que se decide son invariantes, y esas son las que un test por ejemplos vigila peor. **Salvedades obligatorias:** la clasificación es de una sola mano y sin segunda opinión (orden de magnitud, no cifra para citar); mide la *forma* del requisito, no qué tan fácil es probarlo; y unos 63 de los 99 invariantes viven en funciones de Postgres (créditos, referidos, facturación), no en Python.

### 3.2 · Mutantes: qué atrapan los tests de ejemplo y qué las propiedades

Con `mutmut` se generaron **998 mutantes** (cambios automáticos al código) en cuatro módulos (`approvals`, `suppress`, `members`, `models`) y se vio cuáles detecta cada suite.

| Módulo | Mutantes | Tests de ejemplo | Propiedades | Solo propiedades | Ejemplos + propiedades |
|---|---|---|---|---|---|
| approvals | 416 | 319 (76 %) | 306 (73 %) | 36 | 355 (85 %) |
| suppress | 270 | 191 (70 %) | 183 (67 %) | 33 | 224 (82 %) |
| members | 219 | 150 (68 %) | 110 (50 %) | 3 | 153 (69 %) |
| models | 93 | 78 (83 %) | 17 (18 %) | 1 | 79 (84 %) |
| **Total** | **998** | **738 (73 %)** | **616 (61 %)** | **73 (7 %)** | **811 (81 %)** |

**Cómo contarlo:** *«los tests de ejemplo atrapan el 73 %. Sumando propiedades sube al 81 %: hay 73 cambios al código que ningún ejemplo veía y una propiedad sí.»* **No decir** que las propiedades detectan más que los ejemplos: no es así (61 % contra 73 %), y la primera medición a mano (8 de 8 contra 5 de 8) **no se sostuvo** con mutantes automáticos (`docs/37`). Tampoco se ve en este número lo mejor que hicieron: **encontraron un bug real**, un motivo de aprobación con `U+0085`/`U+2028` que dejaba ilegible el registro y bloqueaba toda decisión posterior (ya arreglado). Un caso, no una tasa.

**Salvedades:** cuatro módulos; los mutantes incluyen equivalentes (el 81 % es un piso); las propiedades se afinaron mirando los sobrevivientes de esta misma medición, así que el 61 % es optimista fuera de muestra; los módulos de la nube no entran (necesitan Postgres).

### 3.3 · Qué verifican los flujos de usuario

| Persona | Flujo verificado (`tests/test_user_flows.py`) |
|---|---|
| Desarrollador | `demo` sin repo, red ni clave: 2 bloqueantes en < 5 s |
| Product manager | PR que sube un umbral (avisa la tarea con el valor viejo); PR con una contradicción (sale con 1) |
| Aprobador | Viewer rechazado; aprobar con bloqueantes exige override y motivo; aprobación vieja tras editar la spec; registro editado a mano |
| Agente | `get_blockers` por MCP y el gate frena `/speckit.implement` |
| Equipo en CI | Con baseline, la deuda vieja no frena; un bloqueante nuevo sí |
| Ingeniería | `specreview verification` y la nota en el diff de la PR |

Más: 261 tests del servicio contra un Postgres real y 127 chequeos de la app compilada en un navegador real contra ese servicio (con sesión firmada a mano y un GitHub falso).

## 4 · Qué pasó al recorrer el flujo (hallazgos)

1. **La app no avisaba si el registro de aprobaciones estaba roto** (la captura 15 antes mostraba «Aprobada» como si nada; solo lo detectaba el CLI). **Corregido en este cambio:** un aviso con el id de la entrada, en el historial y en el panel de aprobación, con test.
2. **El mensaje de error del diálogo de aprobar queda en pantalla** después de tildar el override («marcá la casilla…»). No bloquea, pero confunde. Sin corregir.
3. **El agente del servidor local en modo demo** (`--llm demo`) responde con un eco genérico, no con la tarjeta de revisión. Para mostrar la tarjeta se usó la app sin servidor (agente simulado y rotulado). Con un modelo real (`--llm anthropic`) responde de verdad; **no se probó en este recorrido**.
4. **La barra lateral de la demo** (Acme Product, Alex Demo, plan Pro) es de ejemplo: no mostrarla como si fuera un cliente.
5. El test `verify-decisions.mjs` fallaba una de cada tres veces por una carrera en la tabla de historial; se corrigió la espera (4 de 4 corridas verdes).

## 5 · Qué se puede y qué no se puede decir con esto

| Se puede decir | No se puede decir |
|---|---|
| «Revisa la intención antes de construir y frena al agente si hay bloqueantes» | «Garantiza que el código hace lo que se pidió» (no hay verificación del código; es dirección, `docs/37`) |
| «Cada aprobación queda con quién, cuándo, qué versión y si había bloqueantes; un cambio en la spec la deja vieja» | «El registro es inviolable» (el final de la cadena puede cortarse sin que se note) |
| «Un tercio de los requisitos de nuestras propias specs son invariantes» (con «clasificación propia, 301 requisitos») | «Las propiedades atrapan más bugs que los tests» |
| «Sumar propiedades a los tests subió de 73 % a 81 % los cambios detectados, en cuatro módulos» | «81 % de cobertura de bugs» (son mutantes, no bugs) |
| «Lo probamos de punta a punta en local y contra un Postgres real» | «Funciona en producción: te registrás y conectás tu repo hoy» (sin verificar) |
