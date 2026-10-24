# Segmento: empresas con muchas reglas de negocio (banca, fintech, seguros)

**Estado: hipótesis del 2026-10-21, sin una sola conversación con el segmento.** Todo lo de este archivo se valida o se descarta hablando con gente real. Contexto: `../positioning/PROPUESTA_DE_VALOR.md` §2.1.

## La hipótesis

Las empresas con muchas reglas de negocio quieren la velocidad de los agentes, pero no los adoptan para código que toca reglas porque **no pueden garantizar ni auditar que una regla no cambió en silencio**. Si Speco les da esa garantía, el agente entra.

## A quién se le habla

| Rol | Qué le duele | Qué le muestra Speco |
|---|---|---|
| CTO / VP de ingeniería | Presión por usar agentes; miedo al incidente | Gate antes de implementar; comentario en cada PR |
| Riesgo, compliance o auditoría | «¿Quién aprobó este cambio de límite?» | Aprobaciones con hash encadenado; decisiones con id |
| Producto / dueño del negocio | Se entera de los cambios en QA o en producción | El diff de intención en la PR, en su idioma |
| Arquitectura / plataforma | Otra herramienta más que integrar | Corre sobre Spec Kit y GitHub; CLI, MCP y App |

**[DECIDIR]** Quién firma la compra: lo más probable es CTO con el aval de riesgo. Hay que confirmarlo en entrevistas.

## Preguntas para validar (las primeras 5 entrevistas)

1. ¿Usan agentes para escribir código hoy? ¿En qué repos no los dejan entrar, y por qué?
2. La última vez que una regla de negocio cambió sin que nadie lo decidiera, ¿cómo se enteraron y cuánto costó?
3. ¿Cómo aprueban hoy un cambio a una regla (límite, comisión, plazo)? ¿Queda registro de quién lo aprobó y sobre qué versión?
4. ¿Escriben specs antes de implementar? ¿En qué formato y dónde viven?
5. Si una herramienta garantizara que ningún cambio de regla llega a código sin una decisión registrada, ¿qué tendría que cumplir para que la dejaran entrar? (seguridad, despliegue propio, certificaciones)

Señal fuerte: que nombren un incidente concreto y su costo. Señal débil: «suena interesante».

## Lo que van a pedir y no existe

| Pedido probable | Estado |
|---|---|
| Correr dentro de su red (on-prem o nube propia) | ⬜ el bot y el CLI corren en cualquier lado; el servicio cloud no tiene empaquetado para eso |
| SSO (SAML / OIDC) | ⬜ |
| SOC 2 / ISO 27001 | ⬜ |
| GitHub Enterprise Server / Bitbucket Data Center | ⬜ (Bitbucket Cloud simulado, spec 019) |
| Exportar el registro de aprobaciones para auditoría | 🟡 `specreview approvals verify` existe; falta exportación formal |
| Que el código del cliente no salga de su red | ✅ el motor es determinista y offline por defecto; el modelo es opcional (`D-003`) |

El último punto es una ventaja real: **la revisión no necesita mandar nada a un modelo externo.**

## Cómo entrar sin el ciclo largo

- **Por abajo:** un equipo de producto o de plataforma dentro del banco prueba el CLI y la App en un repo propio. Es gratis y no necesita compras.
- **Diseño con el cliente:** 2 o 3 equipos con los que se construye lo que falta de la tabla de arriba, a cambio de feedback y un caso publicable.
- **Contenido:** casos como el de la demo, es decir cambios de una línea en límites y comisiones que nadie decidió. Lo entiende cualquiera en banca.
