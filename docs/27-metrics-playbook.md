# 27 · Playbook de métricas (listo antes del primer cliente)

> Estado: **definiciones y herramienta listas; datos: cero**. Spec: `022-product-metrics`. Objetivo `G-16`, decisión `D-016`.
> Complementa `docs/24-growth-gtm.md` (la estrategia); este documento es **cómo se mide** y **cuándo creerle a un número**.

## 0. La regla que ordena todo

Con pocas empresas, un porcentaje es una anécdota. El reporte imprime siempre el tamaño de muestra y marca «no concluyente» por debajo de **30**. Antes de eso, lo que vale es **hablar con cada cliente**, no leer métricas.

| Cuántas empresas | Qué hacer |
|---|---|
| 0–10 | Entrevistas, mirar cada sesión. Los números sirven sólo para detectar bugs de embudo |
| 10–30 | Cohortes a ojo, TTV (mediana), primeras lecturas de retención. Nada de decisiones por porcentaje |
| 30–100 | Activación, retención sem. 1/4 y Sean Ellis empiezan a ser leíbles. Primera lectura de CAC |
| 100+ | Churn, LTV (si hay cobro), K-factor, comparar canales y puertas |

## 1. Qué pasa en el código y qué no

| Tema | ¿Código? | Dónde |
|---|---|---|
| Activación, TTV, retención, churn, hábito, costo de modelo | **Derivado** de tablas que ya existen | vistas `metrics.*` (migración `20261019000001`) |
| De dónde vino cada persona (canal, puerta) | Captura en la app | `?utm_source=` → `POST /api/acquisition` → `acquisition` |
| Test de Sean Ellis | Tarjeta en la app | `GET .../pmf-survey/due` y `POST .../pmf-survey` → `pmf_responses` |
| CAC (gasto de marketing) | Carga a mano | tabla `marketing_spend` |
| Buyer persona, journey, GTM por puerta | **Documento**, no código | secciones 2 y 3 de este archivo |
| Visitas y conversión de la página | Herramienta web aparte (analítica de la landing) | no está acá: nadie tiene cuenta todavía |
| Cobro, MRR, LTV real | **No existe** (sin facturación) | LTV sólo como escenario |

**Captura en la app (hecha):**
- Al abrir cualquier enlace con `?utm_source=` (o `?src=`, opcional `&utm_medium=` y `&door=code|idea`) la app guarda el **primer** contacto 30 días y lo informa al servicio antes de crear la empresa. Un enlace de referido cuenta como canal `referral`. Quien se registra sin enlace queda como `direct`; las cuentas anteriores a esto quedan como `unknown`.
- La pregunta de Sean Ellis aparece como una tarjeta en la esquina, sin bloquear nada, cuando el servicio dice que toca: la empresa tuvo su primer resultado hace ≥ 7 días y hubo actividad en ≥ 2 días distintos, la persona no es lector y no respondió este trimestre. «Después» la oculta 14 días.

**Cómo etiquetar un enlace:** `https://app.../?utm_source=pr_footer`, `...?utm_source=community:nombre&door=idea`. Usar siempre el mismo nombre para el mismo canal; minúsculas, sin espacios.

## 2. Buyer persona (hipótesis a validar con las primeras 10 entrevistas)

`docs/24` §5 distingue dos puertas. Una persona por puerta, **y** la distinción entre quien paga y quien usa.

| | Puerta 1: «ya tengo software» | Puerta 2: «tengo una idea» |
|---|---|---|
| Rol que **aprueba y paga** | Gerencia de producto / CTO de una empresa con software y agentes escribiendo código | La misma persona que construye (founder no técnico) |
| Rol que **usa a diario** | Producto y quien programa (revisión en el PR) | Idem |
| Dolor | «Lo que decidimos se pisa en silencio»; no sé qué hace hoy mi software | «Mi agente adivina lo que nadie decidió» |
| Disparador de compra | Un incidente: una regla de negocio rota por código generado | Un proyecto que se les desarma al crecer |
| Alternativa actual | Wikis, tickets, memoria de la gente, nada | Prompts sueltos, un archivo de notas |
| Objeción probable | «Otra herramienta más» · «¿Y mi código?» (consentimiento, `D-009`) | «No sé qué es una spec» |
| Qué la convence | Retrato de su propio software en minutos | Su spec + un brief para pegar en su herramienta |

**Cómo se valida:** 10 entrevistas por puerta con la pregunta «¿cuándo fue la última vez que se pisó una decisión? ¿qué hicieron?». Si nadie recuerda un caso, el dolor no es real para ese perfil.

## 3. Customer journey y dónde se mide cada paso

| Etapa | Evento observable | Fuente | Métrica |
|---|---|---|---|
| Conoce | Visita por canal | Analítica de la landing | Visitas por canal (fuera de este repo) |
| Se registra | Teléfono verificado + empresa creada | `organizations`, `acquisition` | Altas por puerta y canal |
| **Primer resultado** | Primera revisión o primer retrato | `reviews`, `jobs` | **Activación ≤ 5 min** y **TTV** |
| Hábito | 3 revisiones en 14 días | `reviews` | % hábito |
| Comparte | Miembro invitado, código, PR con pie | `memberships`, `referrals` | Referidos con resultado, K |
| Quiere más | Choca con el límite y pide mejorar | `upgrade_interest` | % que pide (E7) |
| Paga | — | **no existe todavía** | — |
| Se queda / se va | Actividad real mes a mes | `metrics.activity` | Retención, abandono |

## 4. Definiciones (las que usa el reporte)

| Métrica | Definición exacta | Cómo se lee |
|---|---|---|
| **Primer resultado** | Primera revisión registrada o primer retrato terminado de la empresa | El mismo momento que premia a un referido (spec 021) |
| **TTV** (tiempo a valor) | Minutos entre crear la empresa y el primer resultado. Se reporta **mediana y p90**, no promedio | La mediana es lo típico; el p90 es la peor experiencia razonable |
| **Activación** | % de empresas nuevas con primer resultado en **≤ 5 min** (meta 40 %, `G-7`) | Si es baja, el problema está *antes* de la retención |
| **Hábito** | ≥ 3 revisiones en los 14 días siguientes al primer resultado (sólo empresas que ya cumplieron los 14 días) | Predice retención mejor que el alta |
| **Empresa activa** | Hubo una revisión, un trabajo terminado, una aprobación, una decisión o un uso del modelo. **Abrir la app no cuenta** | Evita medir «visitas» como si fueran uso |
| **Retención sem. 1 / sem. 4** | % de empresas activas entre el día 7 y 13 (o 28 y 34) desde su alta. Sólo cuentan empresas con esa semana ya terminada | Mide *volver*, no *quedarse* |
| **Abandono (churn) mensual** | De las empresas activas el mes anterior, % sin ninguna actividad en el último mes | En un plan gratis no hay cancelación: dejar de usar **es** el churn |
| **CAC por empresa activada** | (gasto de marketing + SMS + modelo gastado por las empresas nuevas) ÷ empresas con primer resultado | Se divide por *activadas*, no por altas: una cuenta vacía no se «adquirió» |
| **LTV** | ARPA × margen ÷ abandono mensual | **Escenario**, mientras no haya cobro. Sirve para saber cuánto cobrar, no para informar ingresos |
| **LTV/CAC** y **recupero** | LTV ÷ CAC; CAC ÷ (ARPA × margen) en meses | Referencias habituales: LTV/CAC ≥ 3 y recupero ≤ 12 meses (heurística, no ley) |
| **K-factor** | Referidos con primer resultado ÷ empresas activas | ≥ 0,2 relevante; ≥ 1 viral (`docs/24` E5) |

**Supuestos visibles que el reporte pide y hay que reemplazar por los reales:** precio de un crédito (`--usd-per-credit`, hoy 0,04 USD, de `docs/24` §2) y costo de un SMS (`--sms-usd`, hoy 0,05 USD, inventado).

## 5. Ajuste producto-mercado y la prueba de Sean Ellis

Pregunta: *«¿Cómo se sentiría si ya no pudiera usar Speco?»* → muy decepcionado / algo decepcionado / nada decepcionado / ya no lo uso. Más dos abiertas: *¿cuál es el principal beneficio?* y *¿qué usaría en su lugar?*

- **Umbral:** ≥ **40 %** de «muy decepcionado» es la señal clásica de ajuste.
- **A quién:** sólo a quien ya tuvo un primer resultado y volvió al menos una vez. Preguntar antes mide la simpatía, no el valor.
- **Cuándo:** con **≥ 30 respuestas** el reporte da veredicto; antes imprime el número y «no concluyente».
- **Lo más valioso son las dos abiertas.** Los «muy decepcionados» te dicen *qué amar*; los «algo» te dicen qué falta para convertirlos.
- Se repite una vez por trimestre (una respuesta por persona por trimestre está forzada en la base).
- El ajuste no es un número único: mirarlo **por puerta**. Es posible tener ajuste en la puerta 1 y no en la 2.

## 6. Cómo usar el reporte

```bash
# una vez, con la base de producción
export DATABASE_URL=postgresql://...

# cargar el gasto del mes (a mano, por canal)
psql "$DATABASE_URL" -c "insert into public.marketing_spend (month, channel, amount_usd) values ('2026-11-01', 'community:foo', 120);"

# excluir lo que no es un cliente (Speco sobre Speco, pruebas)
psql "$DATABASE_URL" -c "insert into public.metrics_excluded_orgs (org_id, reason) values ('<uuid>', 'speco on speco');"

# el reporte del mes
python -m speco_cloud.metrics_report --month 2026-11 -o reporte-2026-11.md
python -m speco_cloud.metrics_report --month 2026-11 --arpa 49 --usd-per-credit 0.04   # con un escenario de precio
python -m speco_cloud.metrics_report --month 2026-11 --json                              # para pasarlo a una planilla
```

Rutina sugerida: el primer día de cada mes, correr el reporte, pegarlo en una nota con **tres decisiones** (qué seguir, qué cortar, qué preguntar a los clientes). Un reporte sin decisiones es decoración.

## 7. Qué NO hacer todavía

- **No** instalar analítica de producto de terceros (eventos, grabación de sesiones) antes del primer cliente: exige una decisión de consentimiento y privacidad que conviene tomar con casos reales.
- **No** armar un dashboard: con menos de cien empresas, un comando que imprime el mes alcanza.
- **No** reportar LTV, MRR ni «crecimiento» antes de que alguien pague.
- **No** comparar canales con menos de 30 altas cada uno.
- **No** optimizar CAC antes de tener retención: un CAC bajo con churn alto es un balde con agujero.

## 8. Valor entregado: problemas atrapados antes de escribir código

Las métricas de arriba dicen si te **usan**. Esta dice qué **les dejaste** (spec `025-value-delivered`, objetivo `G-18`, decisión `D-018`).

| Medida | Definición | Cómo se lee |
|---|---|---|
| **Bloqueante resuelto** | Apareció en una revisión de la feature y ya no está en la última revisión de esa misma feature | Un defecto que, sin la herramienta, habría llegado a código. Es el titular |
| Decisión protegida | Bloqueante resuelto de una regla `PRD*` | «Iba a pisar algo que ya habíamos decidido». Lo que más entiende gerencia |
| Contradicción eliminada | Bloqueante resuelto de una regla `CON*` | La spec se contradecía y nadie lo había visto |
| **Contrafactual** | Quien lo arregló responde «¿habría llegado a código sin Speco?»: sí / probablemente / no | La única evidencia posible de algo que no ocurrió. Sí = 1, probablemente = 0,5 |
| **Retrabajo evitado** | Bloqueantes ponderados × horas por bloqueante (`--hours-low` 4, `--hours-high` 16) | **Estimación**, siempre un rango. Los bloqueantes sin respuesta no suman horas |
| Calidad de specs | Bloqueantes promedio en la **primera** revisión de cada feature, por mes | Si baja, el equipo aprendió. Es valor que queda aunque se vaya la herramienta |

```bash
python -m speco_cloud.metrics_report --month 2026-11                      # el reporte del mes, con la sección de valor al final
python -m speco_cloud.metrics_report --month 2026-11 --org <uuid>         # sólo el valor de ese cliente, listo para entregarle
python -m speco_cloud.metrics_report --month 2026-11 --org <uuid> --hours-low 6 --hours-high 20   # con las horas que el cliente reconoce
```

**Cómo se pregunta:** `GET /api/orgs/{org}/resolved-findings/pending` lista hasta cinco resueltos sin responder; `POST /api/orgs/{org}/resolved-findings/{fingerprint}/outcome` guarda la respuesta (la primera gana; los lectores no responden). La web lo pregunta con una tarjeta chica abajo a la izquierda: una línea, tres botones (Sí / Quizás / No), nada para escribir. Aparece unos segundos después de abrir la app, una vez por carga, y se calla un día tras responder y tres si se cierra. En pantallas angostas no convive con la encuesta de Sean Ellis.

**Límites que el reporte declara:**
- «Resuelto» incluye lo que se sacó con *waiver* o *baseline*, porque la revisión ya no lo informa. Leer junto a «bloqueantes abiertos».
- Las revisiones no saben cuándo empezó la implementación: todo resuelto cuenta como «antes de código». Lo que dice si habría llegado es la respuesta del cliente.
- Con pocas respuestas, las horas son una conversación con el cliente, no un resultado. Reemplazar el 4–16 por lo que el propio cliente reconozca que cuesta un retrabajo.
- La calidad de specs se marca «no concluyente» con menos de 30 features.
