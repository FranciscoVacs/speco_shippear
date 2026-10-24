# 15 · Simple por defecto, profundidad a pedido (spec 011)

Requisito no funcional del producto (`G-6`, decisión `D-006`): **la plataforma debe ser lo más simple posible visualmente, y la
persona va hacia páginas más completas a medida que las necesita.** Está especificado en `specs/011-simple-by-default` (NFR-001…009) y
se revisa con la propia herramienta.

## Qué se ve en la primera visita
| Pantalla | Primera vista | A un clic |
|---|---|---|
| Barra lateral | 3 entradas: Inicio, Decisiones, Revisiones (+ **Más**) | Reglas, Documentación, Configuración, repositorios |
| Decisiones | Contadores y **Tu turno** | Objetivos de producto · Historial de aprobaciones · Todas las features |
| Revisión | Resumen ejecutivo + aprobación | **Detalle técnico**: métricas, hallazgos y código fuente |

Cada sección colapsada dice en su título cuánto hay adentro («19 hallazgos · 6 bloqueantes», «5 decisiones», «16 features»).

## Reglas de comportamiento
- **En el lugar, con teclado**: un `button` con `aria-expanded`/`aria-controls`; Enter y Espacio abren y cierran.
- **Se recuerda** (`localStorage`, `sr-open-*`): quien abre el detalle técnico lo encuentra abierto la próxima vez. Con el storage bloqueado
  sigue funcionando (arranca cerrado).
- **Los enlaces profundos abren lo que apuntan**: `…/reviews/<feature>#finding-3` abre el detalle y selecciona ese hallazgo, **sin**
  dejarlo abierto para siempre. «Ver en la spec» escribe esa dirección, así que se puede compartir.
- **Nada queda inalcanzable**: la paleta de comandos (`Ctrl/Cmd+K`) abre cualquier página aunque la barra no la liste; estando en una
  página secundaria, «Más» se abre solo para ver dónde estás.
- **El reporte exportado** (HTML de un solo archivo) abre con los hallazgos visibles: es un artefacto técnico.

## Cómo se verifica
`cd web && node scripts/verify-simple.mjs`: navegador real, **sin ninguna elección guardada**, un chequeo por NFR y por criterio de éxito
(SC-001: ≤ 3 enlaces y 0 filas de hallazgos en la primera vista; SC-002: cada sección colapsada abre con 1 interacción), más el caso de storage
bloqueado y el reporte exportado real. Los verificadores anteriores guardan las secciones como abiertas (una elección guardada, NFR-008).

## Un criterio para lo que viene
Una pantalla nueva entra con lo mínimo para decidir o actuar a la vista y el resto detrás de una sección con su resumen. Si hace falta
una vista completa, es una página aparte a la que se llega desde ahí, no más controles en la primera.
