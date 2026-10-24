# 24 · Go to market y growth (borrador para validar)

> Estado: **hipótesis**, no hechos. Los números de abajo son puntos de partida para medir y corregir, no predicciones.
> Objetivos: `G-14` (plan gratis con techo de costo), `G-15` (cada persona satisfecha trae a la siguiente).
> Decisiones: `D-014`, `D-015`. Specs: `020-free-plan-credits`, `021-referrals`.

## 1. Veredicto sobre las tres ideas

| Idea | Veredicto | Matiz |
|---|---|---|
| **Plan gratis con límites** | Sí, pero **limitar el modelo, no las revisiones** | La revisión determinista cuesta ~0 (`D-001`, `D-003`): limitarla frena la adopción sin ahorrar un centavo |
| **Ver el resultado rápido** | Sí, y es el requisito que manda sobre los límites | `G-7`: primer resultado en 5 min. Un plan gratis que se agota antes del primer resultado no vale nada |
| **Referidos con créditos** | Sí, **pero no es el loop principal en B2B** | Quien aprueba (gerencia, producto) no suele «referir» herramientas; sí las ve cuando le llegan en el flujo de trabajo |

## 2. Dónde se gastan los tokens (hallazgo del código)

| Qué | ¿Usa modelo? | Costo marginal | ¿Se limita? |
|---|---|---|---|
| Revisión de spec/plan/tasks, reglas `COV/QUA/CON/PRD` | No | ~0 | **No** |
| Decisiones, aprobaciones, MCP de lectura | No | ~0 | **No** |
| Retrato inicial por extractores de reglas (specs + patrones) | No | ~0 | **No** |
| Retrato con modelo (`ModelExtractor`) | Sí | hasta 300 KB de código ≈ 75-100 mil tokens de entrada + hasta 4 mil de salida | **Sí: ~10 créditos** |
| Asistente / entrevista de la puerta «tengo una idea» | Sí | por turno, crece con la conversación | **Sí: ~1 crédito por turno** |

Dos consecuencias:

1. El tope por corrida **ya existe** en el código (`MAX_CODE_FILES = 30`, `MAX_CODE_BYTES = 300 KB`). Lo que falta es el tope **por empresa y por mes**, y un tope **global** para todo el plan gratis.
2. Los límites de la demo (`PLAN_LIMITS` en `web/src/shell/session.ts`: «50 reviews», «100 messages» para Hobby) miden la cosa equivocada. En modo cloud pasan a ser **créditos** (spec 020). La demo puede seguir como está, rotulada.

Estimación de costo (a verificar con el precio vigente del modelo): un retrato con modelo cuesta del orden de **0,3 a 0,5 USD**. Con 20 créditos de bienvenida + 30 al mes, una empresa gratis cuesta como máximo **~1 USD el primer mes y ~1 USD por mes después**, y sólo si usa todo.

## 3. El plan gratis

| | Gratis | Por qué |
|---|---|---|
| Revisiones, reglas, decisiones, aprobaciones | Sin tope de créditos | Costo ~0 y es lo que enamora |
| Créditos de bienvenida | 20, vencen a los 30 días | Garantiza el primer retrato con modelo (`G-7`) |
| Créditos mensuales | 30, **no se acumulan** | Previsibilidad del costo; sin acumulación no hay «stock» de gasto latente |
| Tope diario por empresa | 40 créditos | Frena el uso en ráfaga y el abuso |
| Presupuesto mensual global del plan gratis | Configurable; al agotarse se pausa el modelo **sólo en gratis** | El interruptor que protege la caja (mismo patrón que el presupuesto de SMS, spec 017) |
| Una empresa gratis por persona | Sí | El teléfono ya garantiza una persona real (`D-011`); esto cierra «muchas empresas por persona» |
| Al llegar a cero | Todo lo determinista sigue; se pausa lo que usa modelo y se dice cuándo vuelve | Un límite visible se siente plan, uno sorpresivo se siente bug |

Crédito = 10 mil tokens, la salida pesa 5 veces la entrada (proporción del precio). Todo vive en configuración para ajustarlo sin desplegar.

**Lo que NO está en el alcance:** cobrar. Pro y Team quedan como están. Primero se mide si el plan gratis activa; el cobro se diseña con datos de uso real.

## 4. Referidos

### Diseño (spec 021)
- Un código por persona con teléfono verificado, como enlace + mensaje listo.
- La recompensa **no** es por registrarse sino por el **primer resultado** del invitado (primer retrato o primera revisión). Premiar el registro premia cuentas vacías.
- **Doble beneficio**: 20 créditos a cada empresa. El invitado llega con ventaja; el que invitó recibe lo que le sirve (más modelo, no dinero).
- Créditos de referido: no transferibles, no canjeables, vencen a los 6 meses. Tope del que invita: 10 recompensas por mes (200 créditos).
- Costo máximo por referido recompensado: 40 créditos ≈ 40 × 10 mil tokens ≈ **~1 a 2 USD** (estimado). Si convierte, es un CAC bajo; si no, está acotado.

### Antiabuso
| Intento | Qué lo frena |
|---|---|
| Referirse a sí mismo | Mismo teléfono = misma cuenta (`017`); el tope mensual y el «primer resultado» para otro número |
| Cuentas vacías en masa | No hay recompensa hasta el primer resultado; cada cuenta exige SMS (que cuesta y tiene tope) |
| Fábrica de créditos | Tope mensual por persona, vencimiento, sin canje a dinero, interruptor global |
| Recompensa a cuenta que desaparece | Aceptado como pérdida acotada; si crece, retener la recompensa del que invita unos días |

### La advertencia honesta
Un programa de referidos funciona cuando el producto **ya se comparte solo**. Para quien aprueba, la fricción de «recomendar una herramienta» es alta. Hay cuatro loops que probablemente pesan más, y sólo uno cuesta código nuevo:

1. **Loop del PR (el más fuerte).** `G-2`: cada comentario de revisión en un pull request lo ven varias personas del equipo. Un pie «Revisado con Speco · pedí el retrato de tu software» convierte cada PR en una impresión cualificada. Casi no hay costo de desarrollo (el comentario ya existe, `specreview --diff`, SARIF).
2. **Loop del aprobador.** La persona que aprueba es el usuario objetivo (`D-007`) y llega por invitación de quien programa o de producto. Mejorar *esa* invitación (Slack, correo, la tarjeta «Tu turno») es growth antes que referidos.
3. **Loop de la puerta «tengo una idea».** Quien vibecodea comparte lo que hace en comunidades. El *brief* que se pega en su herramienta puede llevar una línea «especificado con Speco». Acá el referido clásico sí encaja (B2C-ish, comunidades, mucho boca a boca).
4. **Speco sobre Speco** (`G-12`): publicar las propias specs y revisiones como caso real.

**Recomendación:** construir 020 y 021 (barato, acotado, medible), pero **medir el K-factor de cada loop por separado** antes de apostar el esfuerzo de producto al de referidos.

## 5. Go to market por puerta

| | Ya tengo software (`D-010` puerta 1) | Tengo una idea, no tengo código (puerta 2) |
|---|---|---|
| Quién | Gerencia / producto de una empresa con software, con agentes escribiendo código | Persona no técnica que vibecodea |
| Promesa | «Que lo que decidieron no se pise en silencio» | «Que tu agente no adivine lo que nadie decidió» |
| Primer resultado | Retrato inicial de lo que su software hace hoy | Su spec + brief para pegar en su herramienta |
| Dónde están | Equipos que ya usan GitHub/Bitbucket y Spec Kit; PRs | Comunidades de herramientas de IA para construir |
| Canal principal | Loop del PR + contenido sobre «slop» + adopción por CI | Comunidades, ejemplos compartibles, referidos |
| Costo de adquirir | Más alto, ciclo más largo | Más bajo, volumen alto, menor retención esperada |
| Métrica de éxito | Equipos que corren la revisión en 3+ PRs | Specs que luego se vinculan a código |

Hipótesis a validar primero: **la puerta 2 trae volumen y la 1 trae ingresos.** Si los datos dicen otra cosa, se prioriza al revés.

## 6. Métricas

**Activación** (la que manda): % de empresas nuevas que llegan a su **primer resultado en ≤ 5 minutos** (primer retrato o primera revisión). Meta inicial: 40 %.

| Etapa | Evento | Pregunta que responde |
|---|---|---|
| Visita → registro | Número verificado | ¿El mensaje de cada puerta convence? |
| Registro → primer resultado | Retrato / revisión / spec creada | ¿El tiempo a valor es corto? |
| Primer resultado → hábito | 3 revisiones en 14 días | ¿Vuelven? |
| Hábito → invita | Código compartido, miembro invitado, PR con pie | ¿Hay loop? |
| Invita → trae a otro | Referido que llega al primer resultado | ¿El loop cierra? (K-factor) |
| Gratis → pago | Pide más créditos o más repos | ¿Hay disposición a pagar? |

Instrumentación: ahora existe una primera versión (spec 022, `docs/27-metrics-playbook.md`): vistas derivadas + un reporte mensual. Falta que la app web reporte el canal y haga la pregunta de Sean Ellis. Mientras tanto, las tablas de la base (`organizations`, `reviews`, `jobs`, ledger de créditos, referidos) ya permiten calcular las primeras cuatro etapas con SQL.

## 7. Experimentos y criterios de decisión

| # | Hipótesis | Cómo se prueba | Éxito | Si falla |
|---|---|---|---|---|
| E1 | Con 20 créditos de bienvenida el 40 % llega al primer resultado | Medir tiempo de registro a primer retrato | ≥ 40 % en ≤ 5 min | Más bienvenida, o retrato determinista primero y modelo después |
| E2 | 30 créditos/mes alcanzan para volver | % de empresas que agotan créditos antes del día 15 | 10-30 % los agotan | < 10 %: el tope es alto, bajar. > 30 %: subir o vender |
| E3 | El pie en el PR trae visitas cualificadas | Enlace con parámetro, visitas → registros | ≥ 2 % de las impresiones únicas visitan | Probar otro texto o ponerlo sólo en el resumen |
| E4 | Los referidos activan igual o mejor que el resto | Activación de referidos vs orgánico | ≥ igual | Si es peor, recompensar sólo tras 3 revisiones |
| E5 | K-factor del referido | Referidos con resultado ÷ usuarios activos | K ≥ 0,2 (relevante), K ≥ 1 (viral) | K < 0,05 tras 4 semanas: no invertir más en el programa |
| E6 | Costo del plan gratis acotado | Gasto de tokens del plan gratis ÷ presupuesto | ≤ 100 % del presupuesto | Bajar mensual o endurecer tope diario |
| E7 | Hay disposición a pagar | % que chocan con el límite y piden más | ≥ 5 % | Revisar el valor, no el precio |

## 8. Orden de ejecución sugerido

1. **Instrumentación mínima** del embudo (SQL sobre lo que ya existe + 3 eventos de producto). Sin esto no se valida nada.
2. **Spec 020** (créditos y plan gratis): es lo que protege el costo y desbloquea abrir la puerta.
3. **Pie del PR** (barato, loop más fuerte) con enlace medible.
4. **Spec 021** (referidos), con el interruptor global listo desde el día uno.
5. Medir E1-E7 durante 4 semanas con un grupo chico (cerrado) antes de abrir al público.
6. Recién ahí, diseñar el cobro con datos.

## 9. Supuestos que hay que verificar (no los tomé como dados)

- Precio vigente del modelo y por tanto el costo real de un crédito.
- Que el retrato **determinista** es suficientemente bueno como primer resultado cuando se acaban los créditos.
- Que la gente que aprueba tiene ganas de invitar; si no, 021 rinde poco y el esfuerzo va a los loops 1-3.
- Costo de SMS por registro como parte del CAC (la verificación por teléfono no es gratis).
- Que «una empresa gratis por persona» no estorba a consultoras que gestionan varios clientes.
