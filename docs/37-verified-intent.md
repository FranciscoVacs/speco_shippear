# 37 · Intención verificada: de «qué construir» a «probar que lo construido es lo que pedimos»

Notas de dirección (octubre 2026). **No es una spec ni existe en el producto**: es hacia dónde va la tesis y qué se puede decir de eso hoy.
La tesis vive en [`docs/16`](16-thesis.md); la decisión propuesta es `D-019` en `product/decisions.md`.

> **Regla de lectura** (la de `docs/16` y `docs/31`): ✅ existe hoy · 🟡 parcial o sin verificar · ⬜ falta.
> Todo lo de este documento sobre verificación del código es ⬜. Se escribe en futuro o como «hacia dónde vamos», nunca en presente.

---

## 1. La idea en una frase

**Primero se decide qué construir, después se revisa que esa decisión sea coherente, y al final se prueba que el código hace exactamente eso.**

Hoy Speco cubre los dos primeros pasos. El tercero es la extensión natural de la tesis: si lo caro es decidir y mantener lo decidido, el
último eslabón es poder **demostrar** que lo que se construyó es lo que se había decidido, y no solo confiar en que el agente lo entendió.

| Capa | Pregunta | Quién responde | Estado |
|---|---|---|---|
| 1. Intención | ¿Qué decidimos construir? | La persona que aprueba | ✅ specs, decisiones, aprobaciones |
| 2. Coherencia | ¿Lo decidido es completo, no ambiguo y no se contradice? | Speco (`COV`, `QUA`, `CON`, `PRD`) | ✅ |
| 3. Prueba | ¿El código cumple, para toda entrada, lo decidido? | Un verificador, con la regla como fuente | ⬜ |

## 2. Qué significa «probar» (para no prometer de más)

Una regla de negocio se puede expresar como una **propiedad** sobre el comportamiento del código. Hay una escalera de evidencia, de más barata y débil a más cara y fuerte:

| Nivel | Qué garantiza | Costo | Aplica al stack de un cliente típico |
|---|---|---|---|
| Test por ejemplos | Esos casos concretos | Bajo | Sí |
| Propiedades (property-based testing) | Miles de entradas generadas contra una regla; probabilístico | Bajo-medio | Sí (Python, TypeScript) |
| Exploración exhaustiva de un modelo (model checking, contratos) | Todos los casos de un dominio acotado | Medio | Parcial |
| Verificación formal (Verus, Dafny, Lean) | Para **toda** entrada, con una demostración que revisa una máquina | Alto | Hoy casi solo Rust y Dafny |

La palabra **prueba** se reserva para el último nivel. Con propiedades se dice «verificado con N casos generados», nunca «demostrado».

Qué demuestra una prueba formal, exactamente: `{P} C {Q}`. Si la precondición `P` vale y el código `C` termina, vale la postcondición `Q`. Un solver
(en Verus, un SMT) comprueba las condiciones de verificación que salen de anotar el código.

## 3. Por qué no reemplaza a Speco: dónde se rompe la cadena

La prueba cierra un solo eslabón: **código ↔ regla formal**. La cadena completa tiene tres:

```
intención aprobada  →  regla formal  →  código
        (A)               (B)
```

- **(B) código cumple regla formal**: lo cierra un verificador.
- **(A) la regla formal es lo que la persona quiso**: no lo cierra ningún verificador. Una regla débil (`ensures true`) o mal traducida da una prueba válida de lo equivocado.

Por eso Speco no compite con la verificación, la precede. El valor está en que (A) quede **revisado y aprobado por una persona, en lenguaje de negocio**,
antes de que se traduzca. Una prueba verde sobre una spec que nadie revisó es la peor combinación: máxima confianza sobre algo que nadie decidió.

> La frase: *probar que el código cumple la spec es necesario; revisar que la spec sea la correcta viene antes, y sigue siendo trabajo de una persona.*

## 4. Cuándo sirve y cuándo un test común alcanza

Un test por ejemplos y una propiedad expresan lo mismo en una regla puntual. La diferencia está en:

1. **Cuántos casos cubre.** Sirve en los **invariantes** («el descuento total nunca supera el 30 %», «una invitación expirada nunca se acepta»). Las combinaciones no pensadas son donde los tests por ejemplos fallan.
2. **De dónde nace la verificación.** De la **spec revisada**, no de lo que el agente decidió testear. Si el mismo agente escribe código y tests, ambos pueden fallar igual.
3. **Trazabilidad.** `REQ-id → propiedad → resultado`: se puede preguntar «¿qué requisitos no tienen ninguna verificación?».

No sirve para reglas del tipo «si A entonces B» ya bien cubiertas por tests, ni para lo no formalizable («el mensaje debe ser claro»). **Antes de construir nada, contar** qué fracción de los
requisitos de specs reales son invariantes. Si es baja, la inversión no se paga.

## 5. Lo que ya está hecho y sirve de base

- Requisitos en EARS y reglas `QUA`: un requisito ambiguo o no testeable ya se marca. Eso es la **precondición** para poder compilarlo a propiedad.
- Aprobaciones con hash encadenado: la regla aprobada queda atada a una versión de la spec.
- Gate y MCP: ya frenan al agente cuando hay bloqueantes. El mismo punto puede exigir verificación antes de dar algo por «lista para construir».
- Comentario en el PR: ya dice qué regla cambió. Podría decir también «y esta regla sigue verificada / quedó sin verificar».

## 6. Panorama externo

### 6.1 Fuente primaria del marco teórico: Anthropic + Theorem (verificado)

**Referencia de cabecera para cualquier narrativa sobre intención verificada:** Anthropic (Frontier Red Team, con Theorem), *«LLMs are making formal software verification feasible at a much larger scale»*,
22 de octubre de 2026, <https://www.anthropic.com/research/formal-verification>. Hechos, cifras y citas con su salvedad: `company/positioning/EVIDENCIA_DEL_PROBLEMA.md` §1.

Qué sostiene del marco de este documento:
- **El tramo (B) de §3 ya se automatiza a escala:** Claude probó que 123 librerías (239 puntos de entrada) no crashean para inputs de hasta 64 MB, en semanas, con pruebas que chequea Rocq y que nadie lee.
- **El tramo (A) sigue abierto, dicho por ellos:** «The difficulty of obtaining a comprehensive and unambiguous spec is a significant obstacle to verifying software at a larger scale» y «a proof checker can't tell you whether your spec matches reality».
- **La escalera de §2:** la propiedad que escala es genérica («no crashea», con el fuzz test como spec). Las reglas de negocio no salen de un fuzz test: necesitan una spec que alguien decidió.
- **Por qué una persona aprueba el enunciado:** el agente podía volver demostrable cualquier teorema reescribiendo el programa para que nunca crashee (nota 6 del post). Lo que se confía incluye «the theorem statements».
- **Por qué ahora:** pronostican que la verificación formal será pronto «as practical as fuzzing is today». Si probar se abarata, lo escaso es decidir qué probar.

Al citarlo: es validación del problema, no de Speco. No hay relación ni integración con Anthropic ni con Theorem.

### 6.2 PDD Kit (anunciado, sin documentación pública)

GitHub anunció (tweet, octubre 2026) **PDD Kit**, de Microsoft Research, integrado con **Chopin** de GitHub Next: convierte un plan en una spec formal en Verus y prueba que el código la cumple, con
tests y agentes de uso de computadora como respaldo donde la prueba no es posible. Funciona sobre Rust.

**Actualización 2026-10-24:** el anuncio es oficial: [GitHub Next](https://x.com/GitHubNext/status/2112936525457740139), [GitHub](https://x.com/github/status/2112938664959562081) y
[Microsoft Research](https://x.com/MSFTResearch/status/2112987215496093979), como research preview. Una persona aprueba la spec en Verus; el verificador prueba el código. Sigue sin repo
ni documentación pública, y Chopin figura como prototipo en <https://githubnext.com/projects/>. Verus sí es real y público
(Microsoft Research y colaboradores, premio de artefacto en SOSP 2024). Revisar después de GitHub Universe (28-29 de octubre).

Lectura estratégica, provisional:
- **Valida la tesis:** «los ingenieros revisan especificaciones en vez de código» es nuestra categoría, dicha por GitHub y Microsoft Research.
- **Complementa:** ellos parten de una spec aprobada y prueban el código. Nosotros decidimos si esa spec es la correcta. Pipeline posible: Speco → formalización y prueba (PDD Kit u otro).
- **Riesgo:** si Chopin crece hacia planificación colaborativa con revisión y aprobación, pisa nuestra capa. Hoy no hay datos para decirlo. Seguir de cerca.
- **No depender de uno:** la capa de Speco debe quedar agnóstica del verificador (Verus, Dafny, propiedades), igual que `D-013` lo es del proveedor de código.

## 7. Plan mínimo (en orden, cada paso decide si sigue el siguiente)

1. **Contar invariantes.** Sobre las specs reales de `specs/` y `examples/`, clasificar cada requisito: invariante, condicional, no formalizable. Salida: un porcentaje con su N.
   🟡 **Primera medición (2026-10-24, `specreview ledger . --shape`, spec 032):** en `specs/` de este repo, N = 389 requisitos funcionales:
   17,5 % invariantes, 49,9 % condicionales, 32,6 % no formalizables. En los seis repos de `examples/`, N = 43: 39,5 % invariantes,
   39,5 % condicionales, 20,9 % no formalizables. La clasificación es una **heurística** determinista (presentar algo o ser vago → no formalizable;
   disparador When/If/Where → condicional; lo demás → invariante) y no se revisó a mano: es un orden de magnitud, no un dato para decir en público.
   Lectura provisional: las specs de producto de negocio (`examples/`) tienen el doble de invariantes que las de una herramienta, y un condicional
   «cuando A, B» también es una propiedad comprobable; el paso 2 sigue teniendo de dónde partir.
2. **Prototipo con propiedades** sobre `examples/invitations`: traducir 3-4 requisitos EARS a propiedades ejecutables (Hypothesis). Medir cuánto de la traducción hace un modelo bien y cuánto necesita corrección humana.
3. **Trazabilidad en el PR:** el comentario lista requisitos con verificación, sin ella y rotos. Sin tocar cómo se verifica.
   🟡 Desde la spec 032, una verificación queda atada al código del test que corrió (si el test cambia, deja de contar) y `specreview diff` avisa
   cuando un cambio toca el test de una regla. Cada regla dice si su evidencia son ejemplos o casos generados.
4. **Solo si 1-3 dan resultado:** abrir la puerta a verificación formal para las reglas críticas (dinero, permisos, estados), vía un verificador externo.

### Resultado del paso 1 (hecho el 2026-10-24)

Se clasificaron los **301 requisitos `FR-NNN`** de las 25 specs de `specs/` que los tienen (la 011 no usa ese formato). Una sola persona-modelo clasificó, **sin segunda opinión**: tomar las cifras como orden de magnitud.

| Clase | Qué es | Requisitos | % de 301 |
|---|---|---|---|
| **Invariante** | Algo que vale siempre: `MUST NOT`, «como máximo una vez», «nunca por debajo de cero», cadena de hashes, aislamiento por empresa | **99** | 33 % |
| **Condicional** | «When X, el sistema Y»: un test por ejemplo o por tabla alcanza | 121 | 40 % |
| **No formalizable** | UI, navegación, textos, teclado, enlaces, estilo | 81 | 27 % |

Lectura:
1. **Un tercio son invariantes**, no una minoría despreciable. Es suficiente para justificar el prototipo.
2. **Pero el sitio donde viven importa más que la cifra.** De esos 99, unos **63 están en specs cuya lógica corre en Postgres** (013 multi-tenant, 014, 017–021, 024), no en Python: los créditos, los referidos y la facturación son funciones SQL (`supabase/migrations/…credits.sql`, `…billing.sql`) que `credits.py` y `billing.py` solo llaman. Hypothesis no las prueba tal cual. Se necesitaría probar contra una base real o reimplementar la regla en Python.
3. **Los invariantes de Python puro son unos 36**, sobre todo del motor: `approvals.py` (cadena de hashes, aprobación vieja), huella de un hallazgo estable al mover líneas (006), «no modifica el repo» (001), «no usa red sin modelo» (001), fusión de reportes (002), `--diff` (026).
4. **Por spec, las que más rinden:** 010 aprobaciones (5 de 7 son invariantes), 019 proveedores (9 de 12), 013 multi-tenant (14 de 20), 020 créditos (8 de 17), 024 facturación (7 de 16). Las de interfaz (004, 005, 015, 023) casi no tienen.

**Limitaciones:** clasificación subjetiva y de una sola mano; «invariante» mide *forma* del requisito, no que sea fácil de probar; no se leyó el código de cada requisito para ver dónde vive (los 63/36 son por spec, aproximados). Para citar en público habría que repetirla con una segunda persona y medir acuerdo.

**Consecuencia para el paso 2:** empezar por `approvals.py` (Python puro, 5 invariantes claros, ya tiene `verify`). Los créditos y la facturación quedan para después, y exigen decidir antes si la regla se prueba en SQL (pgTAP) o se espeja en Python.

**Criterio de éxito del paso 2:** la propiedad generada detecta una regresión de regla que los tests por ejemplos existentes no detectan, en una corrida reproducible. Si no, no seguir.

### Resultado del paso 2 (hecho el 2026-10-24)

Prototipo en `tests/test_approvals_properties.py`: 10 propiedades (Hypothesis) sobre `approvals.py`, cada una atada a un requisito de la spec 010 (`FR-001`…`FR-005`). `hypothesis` pasó a las dependencias de desarrollo.

**1. Encontró un bug real que los tests existentes no veían.** Un motivo de aprobación con `U+0085` o `U+2028` (texto pegado de un documento, por ejemplo) dejaba el registro ilegible: `read_log` usaba `splitlines()`, que corta en esos caracteres, y `json.dumps(ensure_ascii=False)` los deja crudos. Resultado: `verify` fallaba y **no se podía registrar ninguna decisión más**. Arreglado con `split("\n")` (una línea) y cubierto por `test_fr001_any_reason_text_leaves_a_readable_log`.

**2. Dejó un hueco documentado, sin arreglar.** `FR-003` dice «una edición o un borrado se detecta». Borrar entradas **del final** no se detecta: una cadena de hashes sola no ve que falta la cola. Hace falta un ancla externa (el hash de la cabeza o el conteo, guardado fuera del archivo). Queda como `xfail(strict)` con la razón; si alguien lo arregla, el test avisa. **[DECIDIR]** cómo anclar.

**3. Mutaciones (el criterio de éxito).** Se introdujeron 8 bugs a propósito en `approvals.py` y se corrió la suite de ejemplos completa (sin las propiedades) contra las propiedades:

| Bug introducido | Tests de ejemplo | Propiedades |
|---|---|---|
| El hash de la entrada ignora `reason` (editar el motivo no se nota) | **no detecta** | detecta |
| Un motivo en blanco cuenta como motivo | **no detecta** | detecta |
| El override solo vale para `approved`, no para `approved_with_conditions` | **no detecta** | detecta |
| `verify` no controla el enlace `prev` | detecta | detecta |
| `status` ignora archivos nuevos | detecta | detecta |
| Solo `viewer` queda excluido de aprobar | detecta | detecta |
| El hash se trunca | detecta | detecta |
| `record` agrega aunque el log esté roto | detecta | detecta |

**Las propiedades detectaron 8 de 8; los ejemplos, 5 de 8.** El criterio se cumple. _Ojo: esta cifra no se sostuvo con una medición sistemática; ver «Resultado del paso 2 bis» abajo._

**Límites, para no sobrevender:** N = 8 mutantes, elegidos por la misma mano que escribió las propiedades (sesgo: se buscó lo que se sabía probar); un solo módulo; Hypothesis es probabilístico, no una prueba (60 casos por propiedad). Es evidencia de que la vía funciona, no una cifra para publicar. Para decir «detecta K de L» en público habría que repetirlo con mutantes generados automáticamente (por ejemplo `mutmut`) y sobre más módulos.

### Resultado del paso 2 bis: medición sistemática con `mutmut` (2026-10-24)

Se repitió con mutantes **generados automáticamente** (`mutmut` 3.8), no elegidos a mano: 998 mutantes en `approvals.py`, `suppress.py`, `members.py` y `models.py`. Cada mutante se corrió contra (a) la **suite de ejemplos completa** (sin las propiedades, 380 tests) y (b) solo las **propiedades** (21 tests).

| Módulo | Mutantes | Los ejemplos matan | Las propiedades matan | Solo propiedades | Solo ejemplos | Ninguno |
|---|---|---|---|---|---|---|
| approvals | 416 | 319 (76 %) | 217 (52 %) | 0 | 102 | 97 |
| members | 219 | 150 (68 %) | 103 (47 %) | 1 | 48 | 68 |
| models | 93 | 78 (83 %) | 18 (19 %) | 1 | 61 | 14 |
| suppress | 270 | 191 (70 %) | 155 (57 %) | 8 | 44 | 71 |
| **Total** | **998** | **738 (74 %)** | **493 (49 %)** | **10 (1 %)** | 255 | 250 |

**Lectura honesta: esto corrige el «8 de 8 contra 5 de 8».**
1. **Las propiedades no sustituyen a los tests de ejemplo.** Matan menos (49 % contra 74 %), y solo **10 mutantes de 998** (1 %) los mata una propiedad y ningún ejemplo. Unirlas suma un punto: 738 → 748 (75 %).
2. **La comparación no es pareja a favor de las propiedades:** 21 tests contra 380, y las propiedades se escribieron solo para los invariantes de unas pocas specs, no para todo el comportamiento del módulo (mensajes de error, formato, valores por defecto).
3. **Por qué el experimento a mano dio distinto:** los 8 bugs que yo elegí eran justo del tipo que una propiedad ve (cadena, motivo, override). `mutmut` genera cambios de otro tipo (textos, constantes, argumentos), que ninguna de las dos suites vigila.
4. **250 mutantes sobreviven a ambas.** Muchos son equivalentes (el programa no cambia de comportamiento) o tocan mensajes y formato; `mutmut` no los filtra, así que 74 % es un piso. `record` (68), `write_baseline` y `add_waiver` (22 cada una) concentran los sobrevivientes: es donde mirar primero.

**Lo que sí se sostiene:** las propiedades encontraron un bug real (el del registro ilegible) que ninguna suite veía, y documentaron dos huecos (el final de la cadena y la colisión de la huella). Su valor medido es **encontrar fallas de invariantes**, no subir la tasa de mutantes muertos. No se debe decir «las propiedades detectan más bugs que los tests».

**Cómo repetirlo:** copiar el repo a una carpeta temporal, instalar `mutmut`, agregar a `pyproject.toml` un `[tool.mutmut]` con `source_paths` (los 4 módulos), `also_copy` (todas las carpetas de la raíz) y `pytest_add_cli_args` que ignore `tests/cloud` y las propiedades (corrida de ejemplos) o `pytest_add_cli_args_test_selection` apuntando a los dos archivos de propiedades (corrida de propiedades); `mutmut run` y `mutmut results --all true` en cada una, y cruzar los resultados por nombre de mutante. Quedaron fuera los módulos de `cloud/` (créditos, facturación): necesitan Postgres y `psycopg`, que este entorno no tiene.

### Resultado del paso 2 ter: propiedades para los sobrevivientes y medición repetida (2026-10-24)

Los sobrevivientes de `record`, `write_baseline` y `add_waiver` eran, casi todos, de dos clases: el **código y el texto de cada rechazo** (el CLI y la API ramifican por `bad_request`, `forbidden`, `blocked`, `tampered`) y el **formato de los archivos** que el equipo commitea y revisa en la PR (`baseline.json`, `waivers.json`: versión, campos, orden, indentación, texto sin `\uXXXX`). Se escribieron propiedades para ambas (`tests/test_approvals_properties.py`, `tests/test_properties_files.py`) y se repitió `mutmut` sobre los mismos 998 mutantes:

| Módulo | Mutantes | Ejemplos | Propiedades (antes) | Propiedades (ahora) | Solo propiedades | Ejemplos + propiedades |
|---|---|---|---|---|---|---|
| approvals | 416 | 319 (76 %) | 217 (52 %) | 306 (73 %) | 36 | 355 (85 %) |
| members | 219 | 150 (68 %) | 103 (47 %) | 110 (50 %) | 3 | 153 (69 %) |
| models | 93 | 78 (83 %) | 18 (19 %) | 17 (18 %) | 1 | 79 (84 %) |
| suppress | 270 | 191 (70 %) | 155 (57 %) | 183 (67 %) | 33 | 224 (82 %) |
| **Total** | **998** | **738 (73 %)** | **493 (49 %)** | **616 (61 %)** | **73 (7 %)** | **811 (81 %)** |

Lectura: con propiedades dirigidas a lo que los ejemplos no miraban, **73 mutantes que ningún ejemplo mataba** pasan a morir, y la suma sube de 74 % a 81 %. Es una mejora real y es la forma honesta de decirlo: **complementan** a los ejemplos en lo que estos no vigilan (contratos de error, formato de archivos persistidos); no los reemplazan. Mismas salvedades: cuatro módulos, mutantes de `mutmut` (incluye equivalentes), y propiedades escritas mirando los sobrevivientes —se afinaron contra esta misma medición, así que el 61 % es optimista como estimación fuera de muestra.

### Flujos de usuario de punta a punta (2026-10-24)

Para ver si la app cumple lo que promete, se recorrieron los flujos reales de cada persona, a mano y ahora como tests (`tests/test_user_flows.py`, una prueba por persona sobre una copia git del ejemplo de transferencias):

| Persona | Flujo | Resultado |
|---|---|---|
| Desarrollador | `specreview demo`, sin repo, red ni clave | 2 bloqueantes (`CON001`, `COV001`) en ~0,1 s; `G-7` pide 5 min |
| Product manager | PR que sube un umbral de 10.000 a 15.000 | El comentario dice «10,000 USD → 15,000 USD» y avisa que `T004` sigue con el valor viejo |
| Product manager | PR que agrega una contradicción | Sale con 1 y nombra `CON001` + `FR-012` |
| Aprobador | Viewer rechazado; aprobar con bloqueantes exige override y motivo; motivo con `U+2028`; spec editada después queda `stale`; registro editado a mano se detecta y no se sigue construyendo sobre él | Todo cumple (el caso `U+2028` falla con el código anterior al arreglo) |
| Agente | `get_blockers` por MCP y el gate frena `/speckit.implement` | Cumple |
| Equipo en CI | Baseline: la deuda vieja no frena, solo el bloqueante nuevo (exit 1) | Cumple |
| Ingeniería | `specreview verification` y la nota en el diff | Cumple |

**Interfaz web** (Playwright, ruta real en Chromium): `verify-shell` 683/683, `verify-activation` 55/55, `verify-simple` 33/33, `verify-agent` 181/182, `verify-decisions` 59/59, `verify-developers` 32/32 más un error de arranque. Los dos fallos de `verify-agent` y `verify-developers` **ya ocurren igual en `main`** (el build de archivo único incluye el agente simulado; el enlace de la guía de desarrolladores no aparece). `verify-decisions` falló una vez con la máquina cargada por la medición de mutantes y pasó dos veces seguidas después: parece sensible a tiempos, no una regresión.

**Flujos alojados (servicio cloud), corridos localmente con Postgres 16 real:** `tests/cloud` 261/261 (esquema multi-tenant con RLS, créditos, referidos, facturación, aprobaciones, MCP remoto, worker, revisión de PR contra un GitHub falso) y `web/scripts/verify-cloud.mjs` 127/127: la app compilada en un navegador real contra el servicio real, con sesión firmada con el secreto del servicio y un GitHub falso. Cubre registrarse con empresa, conectar repositorios, decidir una regla, congelar la línea base, aislamiento entre empresas y que la demo no hable con ningún servicio.

**Qué NO se probó:** lo que exige terceros reales. **Supabase** alojado (login de verdad por correo, GitHub o SMS: la sesión se inyecta firmada a mano), la **GitHub App real** (instalación, webhooks, comentario en una PR de verdad: todo contra un GitHub falso) y el **cobro** (simulado a propósito, `D-017`). Eso sigue siendo el punto ciego: el servicio no está desplegado (`AFIRMACIONES.md`), así que "te registrás y conectás tu repo hoy" sigue sin poder afirmarse.

### Resultado del paso 3: trazabilidad (2026-10-24)

`specreview verification [ruta]` (`src/specreview/verification.py`) lista qué requisitos cita algún test. Convención: una línea de comentario sobre el test, en cualquier lenguaje:

```
# verifies[property]: 010/FR-003, FR-005      # nivel: test (por defecto) | property | formal
```

- Informa por feature cuántos requisitos tienen **prueba formal, propiedad, solo tests o nada**, y apunta los que están redactados como invariante («nunca», «como máximo») y no tienen propiedad (heurística sobre el texto: orientativa).
- **Referencias rotas** (una feature o un requisito que no existe, un nivel desconocido) hacen que el comando salga con 1: una traza que se pudre es peor que ninguna.
- `specreview diff` agrega al comentario de la PR, bajo cada requisito que cambió, «Verificado por: …» (con el aviso de revisar que siga comprobando lo nuevo) o «Ningún test, propiedad ni prueba cita este requisito». **Solo si el repositorio usa las etiquetas**: si no, no dice nada, para no meter ruido.
- No dice nunca que un requisito está «probado»: dice qué clase de verificación lo cita y dónde.

Estado en este repo (dogfooding): 27 requisitos citados de las specs 006, 007, 010, 023, 026 y 040 (la 040 es la spec de esta propia función); el resto no tiene etiqueta, y el comando lo muestra.

**Límites:** (a) el comentario de la **GitHub App no lo incluye**: el servicio solo lee los archivos de Spec Kit y `product/` (`FR-019` de la spec 013), no los tests; sí lo trae `specreview diff` y la Action; (b) citar no es verificar: una etiqueta puede estar sobre un test débil o vacío, y la herramienta no lo juzga; (c) hoy solo reconoce requisitos `XX-nnn` de la spec, no los criterios de éxito.

**Siguiente:** extender las etiquetas a las demás specs; mutantes sobre `cloud/` (ahora que hay Postgres en el entorno); desplegar el servicio y repetir los flujos alojados contra Supabase y GitHub reales; decidir cómo anclar el final de la cadena de aprobaciones y si se arregla la huella (que invalida baselines y waivers).

## 8. Reglas de honestidad para hablar de esto

1. Presente: «Speco revisa que lo decidido sea coherente antes de construir». Futuro: «estamos explorando probar que el código cumple lo decidido». Nunca mezclar.
2. **No decir** «probamos matemáticamente» ni «garantizamos que el código es correcto» mientras no exista. Ni siquiera con propiedades: ahí es «verificado con casos generados».
3. **No decir** que Speco reemplaza o compite con la verificación formal. Es la capa previa.
4. PDD Kit y Chopin se nombran como **anuncio** (fecha y links de §6.2), nunca como producto que probamos. El post de Anthropic (§6.1) sí se puede citar, textual y con su fecha.
5. Toda cifra (porcentaje de invariantes, regresiones detectadas) lleva su N, como en `D-016`.
