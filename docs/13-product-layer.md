# 13 · Capa de producto: validar la spec contra lo que el producto ya decidió

El review de código mira una spec contra sí misma y contra su plan. La capa de producto la mira contra su **contexto**: los objetivos
y las decisiones que el equipo ya tomó. Responde las preguntas del documento de visión: ¿mapea a un objetivo o es scope que se coló?
¿contradice una decisión previa? ¿qué objetivo nadie construye? ¿hay supuestos del usuario que nadie validó?

Es **opt-in**: sin carpeta `product/` no emite nada y cualquier revisión existente queda idéntica.

## Archivos
```
product/goals.md        - **G-1**: Reducir el onboarding a menos de 5 minutos      (o "## G-1: ..." )
product/decisions.md    - ## D-003: Los puntos no vencen
                          **Status**: accepted | superseded by D-007 | rejected | proposed
                          **Out of scope**: vence, expira, expiry                  <- términos que la decisión deja afuera
spec.md (encabezado)    - **Goals**: G-1, G-2        **Decisions**: D-003
```
Los ids son explícitos, como `FR-###`: la trazabilidad no se infiere, se cita.

## Reglas
| Regla | Qué detecta | Severidad | Le toca a |
|---|---|---|---|
| `PRD001` | La feature no declara objetivo (y el repo define objetivos) | advertencia | producto |
| `PRD002` | Cita un objetivo o decisión que no existe | advertencia | equipo |
| `PRD003` | Cita una decisión **superseded/rejected** → **bloqueante**. Un requisito usa un término del *Out of scope* de una decisión vigente → advertencia (inferido por texto) | bloqueante / advertencia | producto |
| `PRD004` | Un objetivo que ninguna feature cita (`specreview product`) | advertencia | producto |
| `PRD005` | Supuesto sobre lo que las personas piensan o hacen, sin evidencia (entrevista, datos, link) | advertencia | producto |

Siguen la Constitución: sólo lo explícito bloquea (II); lo inferido por texto es advertencia y puede ser falso positivo
(`D-002 «No discounts on monthly plans»` marca un descuento anual: producto confirma). Todas son `owner: decision` salvo `PRD002`,
así que aparecen en **Tu turno** (fase 3).

## Uso
```bash
specreview .                     # el análisis `product` corre con los demás (--only product para sólo ése)
specreview product .             # objetivos → features, objetivos sin feature, features sin objetivo
specreview product . -f json     # lo mismo para máquinas (también /api/product y la herramienta MCP product_overview)
```
La app muestra la trazabilidad en **Decisiones → Objetivos de producto**.

## Dogfooding
Este repo usa su propia capa: `product/goals.md` (G-1…G-5), `product/decisions.md` y `**Goals**` en cada spec. `specreview product .`
muestra honestamente que **G-5 (aprobaciones auditables) todavía no tiene feature**: eso lo cubre la fase 5.

## Límites
La detección de contradicciones es léxica (términos declarados), no semántica: un modelo (`--llm`) que juzgue una spec contra el
registro de decisiones es el siguiente paso. Los PRDs completos no se parsean todavía; sólo objetivos, decisiones y supuestos.
