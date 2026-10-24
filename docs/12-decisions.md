# 12 · Decisiones: la app para quien aprueba

Quien aprueba una feature (PO, founder, CEO) no pregunta "¿qué regla falló?" sino **"¿el equipo puede construir esto, y hay algo que espere
mi decisión?"**. Esta fase traduce los hallazgos a esa pregunta. La traducción vive en un solo lugar (`src/specreview/decision.py`) y
la leen el JSON del CLI, las herramientas MCP y la app web, así que no puede diferir entre superficies.

## Veredicto (por feature)
| Estado | Cuándo | Qué le pide a quien aprueba |
|---|---|---|
| **Necesita tu decisión** | Hay algún hallazgo (advertencia o bloqueante) que solo producto puede resolver | Decidir |
| **Bloqueada** | Hay bloqueantes que resuelve el equipo | Nada: no empezar todavía |
| **Necesita trabajo del equipo** | Solo advertencias del equipo | Nada |
| **Lista para construir** | Nada que frene ni que decidir (las sugerencias no cambian el estado) | Nada |

`can_implement` sigue siendo "cero bloqueantes". El veredicto manda la urgencia: *decisión* > *bloqueada* > *equipo* > *lista*.

## ¿A quién le toca? (`owner`)
`decision`: `COV002`/`COV003` (alcance colado: ¿entra o se saca?), `QUA004` (pregunta abierta), `CON001`/`CON002` (¿cuál de dos reglas manda?).
Todo lo demás es `team`. Un test garantiza que cada regla nueva declare su riesgo.

## ¿Qué se arriesga? (`risk`)
Los tres modos de falla del producto: `intent_drift` (el agente va a adivinar), `context_decay` (piezas que no encajan),
`unverifiable` (nadie podrá decir si está terminado). La UI muestra el riesgo y una consecuencia en lenguaje llano por regla
(`impact.*` en `web/src/i18n`); los ids de regla quedan en la vista técnica.

## En la app
- **`/decisions`**: contadores por estado, **"Tu turno"** (solo lo que espera al decisor, por feature, con "Preguntar al agente") y el
  portafolio ordenado por urgencia con *quién espera a quién*. El sidebar muestra cuántas decisiones esperan.
- **Resumen ejecutivo** arriba de cada revisión: veredicto, una frase, tu turno, qué se arriesga y "Copiar resumen" (texto listo para Slack).
  La lista técnica de hallazgos sigue debajo, intacta.
- Reportes exportados por versiones anteriores no traen `decision`: el resumen se oculta y la vista técnica funciona igual.

Verificación: `python -m pytest tests/test_decision.py` y `cd web && node scripts/verify-decisions.mjs` (contrasta lo que dice la página con los reportes generados y toma las capturas).

## Todavía no
Aprobar / rechazar desde la app, el registro de quién aprobó qué versión y las notificaciones a Slack: fase 5 (hace falta backend y autenticación).
