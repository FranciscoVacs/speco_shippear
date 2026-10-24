# Calibración contra un repo real

Repo: [`devopsabcs-engineering/spec-podcast-site`](https://github.com/devopsabcs-engineering/spec-podcast-site) (3 features de Spec Kit,
todas con las tasks marcadas `[X]`, es decir **implementadas**). Se usó como proxy: en un repo implementado casi no debería haber huecos reales.
Es una sola muestra (3 features, 45 requisitos); las conclusiones son orientativas, no estadísticas.

## Primera corrida (sin calibrar)
7 a 12 **bloqueantes** por feature. Revisados a mano, los 11 bloqueantes restantes tras mejorar el matching eran
casi todos **falsos**: el requisito sí estaba implementado, pero con otro vocabulario
("whitespace" vs "trim", "static build" vs `generateStaticParams`, "featured episode" repartido en dos tasks) o era una
restricción que no genera task propia ("MUST NOT alter the catalog", "usar el nombre X").

## Hallazgos que cambiaron el diseño
1. **El Spec Kit real no trae trazabilidad explícita**: 0 referencias `FR-###` en tasks/plan. La capa léxica es la única determinista.
2. **No existe un umbral que separe** los huecos plantados del fixture de los falsos del repo real
   (p. ej. FR-005 plantado: similitud 0.19 / unión 0.40; ocho falsos reales caen en el mismo rango). Ajustar un umbral a 15 puntos sería sobreajuste.
3. Un requisito real se implementa entre **varias tasks**: se agregó recall ponderado por IDF (insensible al largo) además del coseno.

## Cambios resultantes (ver decisiones D19-D21)
- Cobertura en tres estados: cubierto / dudoso (`COV006`, sugerencia) / hueco.
- Un hueco inferido sólo por texto es **advertencia**; es **bloqueante** únicamente si el equipo usa trazabilidad explícita o un modelo (`--llm`) lo confirma.
- Scope colado: severidad según qué fracción (ponderada) de las palabras del task es nueva para la spec.
- Criterio de aceptación faltante: advertencia sólo si nada se le parece (similitud < 0.15); en el borde, sugerencia.

## Resultado actual
| Feature | Bloqueantes | Advertencias | Sugerencias |
|---|---|---|---|
| 001-modern-podcast-site | 0 | 25 | 31 |
| 002-episode-search-filter | 0 | 12 | 28 |
| 003-episode-detail-pages | 0 | 14 | 24 |
| fixture (defectos plantados) | 6 | 10 | 3 |

Los 0 bloqueantes en el repo implementado son el resultado esperado. **Las advertencias y sugerencias siguen siendo mayormente ruido
sin `--llm`** (no medí su precisión sistemáticamente más allá de las muestras revisadas arriba).

## Limitaciones conocidas
- En el fixture, 2 de 5 huecos de criterio de aceptación (FR-005, FR-008) sólo salen como sugerencia: su texto se parece lo bastante a otras stories.
- Las restricciones ("MUST NOT …") y el contenido ("usar el nombre X") se reportan como huecos aparentes; requieren juicio humano o del modelo.
- El juez LLM (`--llm anthropic`) está implementado y probado con un modelo falso; **no se probó contra la API real** (sin API key en el entorno de desarrollo).
