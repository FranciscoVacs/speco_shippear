## Spec review · `003-team-invitations`

🔴 6 bloqueantes · 🟡 10 advertencias · 🔵 3 sugerencias

| Sev. | Dónde | Ubicación | Regla | Qué pasa |
|---|---|---|---|---|
| 🔴 | FR-003 + FR-007 | `spec.md:70` | CON001 | FR-003 y FR-007 se contradicen: valores distintos para lo mismo: «7 days» vs «30 days». |
| 🔴 | FR-005 | `spec.md:72` | COV001 | FR-005 no tiene correlato en el plan ni en las tasks: nadie lo va a implementar. |
| 🔴 | FR-006 | `spec.md:73` | COV001 | FR-006 no tiene correlato en el plan ni en las tasks: nadie lo va a implementar. |
| 🔴 | FR-009 | `spec.md:76` | COV001 | FR-009 no tiene correlato en el plan ni en las tasks: nadie lo va a implementar. |
| 🔴 | FR-010 | `spec.md:77` | COV001 | FR-010 no tiene correlato en el plan ni en las tasks: nadie lo va a implementar. |
| 🔴 | FR-010 | `spec.md:77` | QUA004 | FR-010 tiene una pregunta abierta [NEEDS CLARIFICATION]: «what is the limit?» |
| 🟡 | T009 | `tasks.md:19` | COV002 | T009 no responde a ningún requisito (introduce: slack, notification): posible scope que se coló. |
| 🟡 | T010 | `tasks.md:20` | COV002 | T010 no responde a ningún requisito (introduce: csv, bulk, import): posible scope que se coló. |
| 🟡 | P4 | `plan.md:7` | COV003 | El plan incluye «We also add a Slack notification channel so admins learn when invitat…» (P4) que no responde a ningún requisito (introduce: slack, notification, channel, learn). |
| 🟡 | FR-009 | `spec.md:76` | QUA001 | FR-009 es ambiguo: «appropriately» deja la decisión al implementador. |
| 🟡 | FR-006 | `spec.md:73` | QUA002 | FR-006 no es testeable: usa «fast», «user-friendly» sin un umbral medible. |
| 🟡 | FR-009 | `spec.md:76` | QUA002 | FR-009 no es testeable: usa «scalable» sin un umbral medible. |
| 🟡 | US3 | `spec.md:49` | QUA005 | La story US3 «Admin manages pending invitations» no tiene Acceptance Scenarios: no hay forma de saber cuándo está terminada. |
| 🟡 | FR-006 | `spec.md:73` | QUA006 | FR-006 no tiene criterio de aceptación: ningún escenario ni Success Criterion lo verifica. |
| 🟡 | FR-009 | `spec.md:76` | QUA006 | FR-009 no tiene criterio de aceptación: ningún escenario ni Success Criterion lo verifica. |
| 🟡 | FR-010 | `spec.md:77` | QUA006 | FR-010 no tiene criterio de aceptación: ningún escenario ni Success Criterion lo verifica. |
| 🔵 | FR-008 | `spec.md:75` | QUA003 | FR-008 no sigue un patrón EARS (centrado en el actor). |
| 🔵 | FR-005 | `spec.md:72` | QUA006 | No encontré con claridad un criterio de aceptación para FR-005: revisar que algún escenario o SC lo verifique. |
| 🔵 | FR-008 | `spec.md:75` | QUA006 | No encontré con claridad un criterio de aceptación para FR-008: revisar que algún escenario o SC lo verifique. |

Métricas: cobertura requisito→plan/tasks 60% · con criterio de aceptación 50% · EARS 10/10
