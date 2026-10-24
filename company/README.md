# company/

Todo lo que Speco sabe de sí misma como empresa y que no es código: cómo se posiciona, cómo habla, qué puede afirmar en público, cómo vende y cómo hace marketing. Vive en el mismo repo que el producto para que cambien juntos y para que cualquier sesión de un agente tenga este contexto. Si entra gente que no usa git, la carpeta se puede mover a su propio repo sin tocar el código.

**Idioma:** español rioplatense, como `docs/`. Es contenido de mercado, no código.

## Mapa

| Carpeta | Qué hay | Empezar por |
|---|---|---|
| `voice/` | Cómo hablamos: principios, vocabulario, tono por canal | `VOZ_Y_TONO.md` |
| `positioning/` | Qué somos, para quién, por qué distintos, tiempo a valor; qué agregamos; qué se puede afirmar; el experimento de retrabajo; evidencia externa del problema | `PROPUESTA_DE_VALOR.md`, `POSICIONAMIENTO.md`, `AFIRMACIONES.md`, `EXPERIMENTO_RETRABAJO.md`, `EVIDENCIA_DEL_PROBLEMA.md` |
| `sales/` | Boceto del pitch del sábado; pitch de 30 s, 2 min y 5 min; preguntas duras; guion de la demo; segmento banca/fintech; QR; **evidencia con capturas del flujo, registros reales y números** | `PITCH_BOCETO.md`, `PITCH_Y_OBJECIONES.md`, `DEMO_HACKATHON.md`, `SEGMENTO_REGULADOS.md`, `EVIDENCIA_PITCH.md` |
| `marketing/project/` | Kit del proyecto de Claude que escribe piezas de contenido | `INSTRUCCIONES.md`, su `README.md` |
| `marketing/scripts/` | Piezas aprobadas, con plantilla | `README.md` |

## Fuentes de verdad (fuera de esta carpeta)

| Tema | Archivo |
|---|---|
| El mensaje y el vocabulario | `docs/16-thesis.md` |
| Qué hace hoy para producto, con estados ✅ 🟡 ⬜ | `docs/30-product-manager-guide.md` |
| Go to market, loops, experimentos | `docs/24-growth-gtm.md` |
| Métricas y cuándo creerle a un número | `docs/27-metrics-playbook.md` |
| Plan gratis y créditos | `docs/25-free-plan-credits.md` |
| Planes y cobro (simulado) | `docs/30-billing.md` |
| Objetivos y decisiones | `product/goals.md`, `product/decisions.md` |
| Lo pendiente | `TODO.md` |
| Arquitectura «Cursor para producto» | `docs/31-cursor-for-product-architecture.md` |
| Spec Kit, sus hooks y `/speckit-analyze` frente a Speco | `docs/34-speckit-hooks-and-gates.md` |
| Hacia dónde va la tesis: probar que lo construido es lo decidido (visión) | `docs/37-verified-intent.md` |
| Fuente primaria externa del marco teórico (verificación formal a escala; la spec es el cuello de botella) | Anthropic, 22-oct-2026, <https://www.anthropic.com/research/formal-verification>; resumen en `positioning/EVIDENCIA_DEL_PROBLEMA.md` §1 |

## Reglas

1. **El producto manda.** La verdad sobre qué hace Speco vive en `docs/`, `product/` y el código. Acá se traduce a lenguaje de mercado, no se copia. Si `company/` contradice a esas fuentes, ganan ellas y esto se corrige. Un PR que cambia el producto DEBE actualizar `company/` si cambia algo que acá se afirma.
2. **Una afirmación pública, un lugar.** Capacidades, cifras, clientes, precios y resultados DEBEN estar en `positioning/AFIRMACIONES.md` con su estado y su evidencia. Nada se publica ni se dice en un escenario sin estar ahí.
3. **No se inventan pruebas.** Hoy no hay clientes pagos, testimonios, casos ni métricas de uso. Un hueco de prueba social DEBE quedar como `[PLACEHOLDER: ...]`. Los datos de la demo son ficticios y DEBEN rotularse así.
4. **Ninguna superficie promete más que `docs/16` §3 («Cobertura hoy»).** La garantía 1 se dice «lo decidido no se pisa en silencio», NUNCA «detectamos cualquier cambio de comportamiento».
5. **Lo no decidido se marca** como **[DECIDIR]** (lo resuelve el dueño) o **[VERIFICAR]** (hay que comprobarlo contra el producto real). NO se resuelve en silencio.
6. **El repo es privado.** Mientras lo sea, esta carpeta PUEDE incluir estrategia, preguntas duras y límites. Si el repo se abre o entra un tercero, `company/` DEBE moverse antes.

## Estados de una afirmación

`verificado` (es verdad hoy, con evidencia) · `con matiz` (sólo con la salvedad) · `placeholder` (todavía no existe) · `no existe` (falso hoy, no se dice). Detalle en `positioning/AFIRMACIONES.md`.
