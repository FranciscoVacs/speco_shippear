# 14 · Aprobaciones auditables, Slack y Jira

Hasta la fase 4 la app solo *leía*. Esta fase deja que quien aprueba **decida** y que la decisión quede registrada de forma que no se
pueda reescribir sin que se note. Todo es stdlib de Python, sin servicios nuevos: el "backend" es el servidor local (`--serve`) y el
registro vive **en el repo**, versionado y revisable como las specs.

## Miembros y tokens
```bash
specreview member add "Ana" --role approver --email ana@acme.com --slack U0123   # imprime el token UNA vez
specreview member list | revoke ana@acme.com
```
`.specreview/members.json` guarda solo el SHA-256 del token (256 bits aleatorios): se puede commitear. Roles: `approver` (decide),
`member` y `viewer` (leen). Quién puede aprobar es en sí una decisión que se revisa en un PR.

## Registro de aprobaciones (`.specreview/approvals.jsonl`)
Cada entrada: feature, decisión (`approved | approved_with_conditions | rejected | delegated`), motivo, condiciones, quién y por qué
canal (`api | slack | cli`), fecha, **hash de los archivos de la spec** (y por archivo), el veredicto de ese momento, y el **hash de la
entrada anterior**.
- **Versión**: si un archivo cambia después de decidir, la decisión figura como **vieja** y se nombran los archivos cambiados.
- **Cadena**: editar o borrar una entrada rompe la cadena; `specreview approvals verify` dice cuál (exit 1) y el servidor se niega a
  seguir agregando sobre un registro roto.
- **Política**: solo un `approver` decide; rechazar, condicionar y delegar piden motivo; aprobar con **bloqueantes** exige `override` + motivo
  (queda marcado); no se delega en uno mismo ni en alguien que no sea approver.

| Superficie | Cómo |
|---|---|
| App (servidor local) | `specreview . --serve`; en la review, panel **Aprobación**; pega el token una vez. `GET /api/me`, `/api/approvals[?feature=]`, `/api/approvals/verify`, `POST /api/approvals` (Bearer). Escribe solo con token: el CSRF de cookies no aplica. |
| CLI | `SPECREVIEW_TOKEN=… specreview approvals record FEATURE --decision approved [--reason …] [--override]`; `approvals list|verify`. |
| Agentes (MCP) | `approval_status(feature)` **solo lectura**: un agente puede preguntar si algo está aprobado, no aprobar. |
| Demo estática | Historial de ejemplo + lo que hagas, guardado **solo en tu navegador** y rotulado demo. |

## Slack
```bash
specreview notify slack . --base-url https://app.acme.com --interactive      # SLACK_WEBHOOK_URL; --dry-run para ver el mensaje
specreview . --serve --allow-host tu-tunel.example.com                        # SLACK_SIGNING_SECRET para los botones
```
El digest solo nombra lo que **espera una decisión** (y calla si no hay nada). Los botones Aprobar/Rechazar llegan a
`/api/slack/interact`: se verifica la firma `v0` (HMAC-SHA256) y que el pedido tenga menos de 5 minutos, y el usuario de Slack debe estar
vinculado (`member add --slack`) a un `approver`. Condiciones y delegación requieren la app.

## Jira (solo lectura)
```bash
JIRA_BASE_URL=https://acme.atlassian.net JIRA_EMAIL=… JIRA_API_TOKEN=… specreview jira sync --project PROJ
```
Escribe `product/jira.json` (clave, resumen, estado, categoría, padre) paginando `GET /rest/api/3/search/jql`. La spec enlaza con
`**Jira**: PROJ-12` y la regla **`PRD006`** avisa si la clave no está en el caché o Jira la da por terminada. **Las revisiones nunca llaman
a la red** (constitución I): leen el caché.

## Lo que NO está verificado contra servicios reales
Slack y Jira se probaron con **servidores falsos y payloads firmados** en los tests, no contra un workspace ni un Jira de verdad. El
formato de Block Kit, la firma y el endpoint de búsqueda de Jira siguen la documentación vigente, pero conviene una corrida real antes de
confiar en ellos. El servidor local no trae TLS ni gestión de sesiones: para exponerlo (Slack) usar un túnel/proxy con HTTPS.
