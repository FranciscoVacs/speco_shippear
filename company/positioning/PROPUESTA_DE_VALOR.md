# Propuesta de valor: qué agrega Speco

**Estado: propuesta del 2026-10-21, no decisión.** El mensaje oficial vive en `docs/16-thesis.md`. Lo marcado **[DECIDIR]** cambia la tesis o el comprador: lo decide el dueño y, si se adopta, va primero a `docs/16` y a `product/decisions.md`.
Qué se puede afirmar de todo esto: `AFIRMACIONES.md`, sección «Tesis de valor».

## 1. La respuesta corta

Speco no compite con el formato de las specs: eso es Spec Kit. **Speco gobierna la intención:** ningún cambio a una regla de negocio llega al código sin que alguien lo vea, lo decida y quede registrado.

> **Spec Kit es como git: el formato y el flujo. Speco es como la revisión de PRs y las ramas protegidas, pero para el negocio en vez del código.**

## 2. Tres ideas del dueño, evaluadas

Las tres no compiten. Responden a tres preguntas distintas: **quién compra**, **cuánto vale** y **por qué ahora**.

### 2.1 Empresas reguladas que quieren usar agentes sin perder el control → *quién compra*

> «Las empresas grandes, con equipos grandes o muchos agentes en paralelo, por ejemplo bancos, tienen muchas reglas de negocio y tienen que cuidarse del vibe coding. Por eso son reacias a usar agentes para programar. Lo que nosotros damos es una forma de verificarlo.»

- **El dolor:** un banco, una fintech o una aseguradora no puede dejar que un agente cambie una regla en silencio. El problema no es la velocidad: es **perder el control y no poder auditarlo**. Mientras eso no se resuelva, el agente no entra.
- **Lo que Speco les da:** permiso para usar agentes. Cada cambio de regla es visible, lo decide una persona y queda registrado.
- **Ya existe, y se puede mostrar:**
  - La garantía «las reglas no cambian sin una decisión» (`docs/16` §3).
  - Decisiones con id que bloquean si una spec las contradice (`PRD00x`).
  - Aprobaciones con hashes encadenados (spec 010): si la spec cambia después, la aprobación figura como vieja.
  - El comentario en la PR con el diff de intención (spec 026), funcionando sobre GitHub real.
  - La demo **es un banco**: límites de transferencias y revisión de fraude.
- **Lo que falta para venderle de verdad a un banco:**
  - Despliegue dentro de su infraestructura.
  - SSO y certificaciones (SOC 2 o ISO 27001).
  - Retención y exportación de auditoría.
  - Soporte de GitHub Enterprise o Bitbucket Server.
  
  Ciclo de venta largo: de 6 a 12 meses es común en software enterprise, y 12 a 18 o más cuando hay revisiones de seguridad y compliance ([Pedowitz Group](https://www.pedowitzgroup.com/how-long-are-enterprise-software-journeys)); un CRO de tecnología bancaria habla de 18 a 24 meses (una sola entrevista, anecdótico). Antes de prometer plazos, confirmarlo en 3 conversaciones reales (tarea de venta, `SEGMENTO_REGULADOS.md`).
- **Veredicto:** es el comprador más claro, con el dolor más caro. Sirve para el pitch y para elegir a quién hablarle. No es lo que se vende la semana que viene.

**[DECIDIR]** ¿Pasa a ser el comprador principal? Hoy `docs/16` dice «gerencias y product owners» sin industria, y `D-010` define dos puertas. Propuesta: la puerta 1 («ya tengo software») se enfoca en **empresas con muchas reglas de negocio**, con banca y fintech como primer nicho.

### 2.2 Menos retrabajo, menos tokens → *cuánto vale* (medido: no se sostiene)

> «¿Qué tan rápido converge un agente en una solución óptima? Depende de la definición de las features y su scope. Una buena spec reduce costos de los agentes, reduce retrabajo, y eso es menos tokens y más calidad.»

- **Lo medimos y no apareció** (`EXPERIMENTO_RETRABAJO.md`): con la spec revisada y sin revisar, el mismo agente gastó lo mismo (−2,7 %, dentro del ruido) y llegó al comportamiento correcto las 6 veces. Es N = 3 en una feature fácil: no prueba que revisar nunca ayude, pero **no hay número para decir**.
- **Lo que el experimento sí mostró es mejor argumento:** sin revisión, el agente **decidió solo** qué límite valía y qué requisitos no construir (el de fraude, entre ellos), y lo avisó en el último párrafo. Acertó el límite. Nadie lo decidió.
- **Entonces el valor no está en el costo del agente sino en quién decide.** Se suma a 2.1: el comprador paga por control, no por tokens.
- **Métrica de producto que sigue en pie:** «problemas atrapados antes del código», con la respuesta de la empresa sobre si habría llegado al código (spec 025, `D-018`).

### 2.3 «Saber qué ideas merecen construirse» → *por qué ahora* (reformulada)

> «El futuro es ahora, cualquiera puede construir cualquier idea; con Speco vas a saber cuáles merecen construirse y cuáles descartar antes de gastar. Hoy se construye mucho más de lo que se debería y después hay que podar código.»

- **Tal como está, promete de más.** Speco no evalúa si una idea vale la pena en el mercado. Evalúa si está **bien decidida**:
  - si contradice algo ya decidido;
  - si responde a un objetivo (`PRD001`);
  - si alguien la va a implementar (`COV001`);
  - si se puede verificar cuándo está terminada.
- **Lo que sí es cierto, y es la mejor frase de las tres:** con agentes se construye de más y después se poda código. Speco mueve la poda antes.

> **«Podá en la spec, no en el código.»** Antes del código, una mala decisión cuesta minutos. Después, semanas.

- **Puente con lo que existe:** una spec que no responde a ningún objetivo, o con pasos que no responden a ningún requisito (el *scope colado*, `COV002` y `COV003`), es justo lo que conviene podar antes.

## 3. El mensaje armado

| Capa | Mensaje | Respaldo hoy |
|---|---|---|
| Para quién | Empresas con muchas reglas de negocio que quieren usar agentes sin perder el control: bancos, fintech, seguros **[DECIDIR]** | Demo bancaria; garantías de `docs/16` |
| Qué es | El Cursor para producto: donde la intención se escribe, se revisa y se verifica | Revisión y comentario en la PR: sí. Editor y grafo: visión (`docs/31`) |
| Por qué ahora | Con agentes, construir es barato; lo caro es construir lo equivocado y podarlo después | `docs/16` §2 |
| Qué cambia | Cada cambio de regla se ve, se decide y queda registrado antes del código | Spec 026 (PR), spec 010 (aprobaciones), `PRD00x` |
| Cuánto vale | Las decisiones de negocio las toma una persona, no el agente; los problemas se atrapan antes del código | Spec 025 (KPI); experimento: el agente decide solo sin revisión |
| Frente a Spec Kit | Spec Kit es el formato; Speco es el control de cambios del negocio sobre ese formato | `docs/34` |

## 4. Frases para usar y para no usar

| Usar | No usar (todavía) | Por qué |
|---|---|---|
| «Podá en la spec, no en el código» | «Sabés qué ideas construir» | Speco no evalúa mercado |
| «Ningún cambio de regla llega al código sin una decisión» | «Detectamos cualquier cambio de comportamiento» | Garantía 1 parcial (`docs/16` §3) |
| «Permiso para usar agentes en un banco» | «Ya lo usan bancos» | No hay clientes |
| «El agente decide solo; Speco hace que decida una persona» | «Ahorrás tokens» o «menos retrabajo» con una cifra | Lo medimos y no hubo diferencia (`EXPERIMENTO_RETRABAJO.md`) |
| «Spec Kit es el formato; Speco, el control de cambios» | «Reemplazamos a Spec Kit» | Corremos sobre Spec Kit |
