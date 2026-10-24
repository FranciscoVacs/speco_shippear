# Proyecto de Claude: piezas de contenido

Kit para armar en claude.ai un Project que escribe posts, guiones de video corto y textos de landing con el contexto completo de Speco.

## Cómo armarlo

1. En claude.ai, Projects, crear uno nuevo (por ejemplo «Speco · Contenido»).
2. En «Set project instructions», pegar el contenido de `INSTRUCCIONES.md` (lo que está debajo de la línea).
3. En el conocimiento del proyecto, subir:
   - `../../voice/VOZ_Y_TONO.md`
   - `../../positioning/POSICIONAMIENTO.md`
   - `../../positioning/AFIRMACIONES.md`
   - `../../../docs/16-thesis.md`

## Mantenerlo

El proyecto guarda una **copia** de esos archivos. Cuando cambien en el repo (producto nuevo, otra palabra, una afirmación que pasa a `verificado`), hay que volver a subirlos y reemplazar los viejos. El repo es la fuente de verdad; el proyecto es un espejo.

Las piezas aprobadas van a `../scripts/`.
