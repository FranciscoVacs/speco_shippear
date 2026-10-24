# Contrato del asistente (backend ↔ UI)

El asistente propone texto (reescrituras EARS, criterios de aceptación, aclaraciones); **nunca edita archivos**.
Se habilita al iniciar el servidor con un modelo: `specreview <repo> --serve --llm anthropic` (requiere `ANTHROPIC_API_KEY`)
o `--llm demo` (respuestas de ejemplo, sin modelo, para ver la interfaz). Sin `--llm`, el asistente no está disponible.

## `GET /api/assistant`
```json
{"available": true, "provider": "anthropic" | "demo" | null, "model": "claude-sonnet-5-5" | "demo" | null, "demo": false}
```
`available:false` ⇒ la UI muestra cómo activarlo (no un error).

## `POST /api/chat`  (Content-Type: application/json obligatorio)
Request:
```json
{"feature": "003-team-invitations",
 "messages": [{"role": "user", "content": "Reescribí FR-006 en EARS"}],
 "focus": {"rule": "QUA002", "ids": ["FR-006"]}}      // opcional: el hallazgo que motivó la pregunta
```
El cliente manda el historial completo en cada pedido (el servidor no guarda estado). Máx. 40 mensajes de 8000 caracteres; el
último debe ser del usuario.

Respuesta exitosa: `200`, `Content-Type: text/event-stream`. Cada evento es una línea `data: <json>` seguida de línea en blanco:
```
data: {"delta": "texto parcial"}      // 0..n veces, concatenar en orden
data: {"done": true}                  // fin normal
data: {"error": "mensaje legible"}    // fallo a mitad de camino (el proveedor falló); no trae detalles internos
```
Errores antes del stream (JSON, `{"error": "...", "code": "..."}`): `400 bad_request`, `404 not_found` (feature),
`413 bad_request` (cuerpo grande), `415 bad_request` (Content-Type), `403 forbidden` (Host/Origin no locales),
`503 assistant_unavailable` (sin modelo).

## `GET /api/rules`
`{"questions": {clave: pregunta}, "rules": [{id, name, family, question, severity, what, why, fix, bad, good, caveat}]}`
Catálogo de reglas (fuente única: `src/specreview/rules.py`). También viaja en el HTML exportado como
`window.__SPECREVIEW__.rules`.

## Seguridad del servidor local
Solo atiende `Host` locales (127.0.0.1, localhost, ::1) y rechaza `Origin` de otros sitios (anti DNS-rebinding / CSRF).
