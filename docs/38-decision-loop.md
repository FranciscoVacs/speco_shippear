# 38 · El circuito de decisión en la nube (spec 027 y spec 016)

Tres cosas que antes no existían en la versión cloud, y que juntas cierran el recorrido de quien decide:

1. **«Tu turno» muestra lo real.** Hasta ahora la web cloud no le pedía nada al servicio: la página de decisiones mostraba las muestras de la demo. Ahora lista las features de los repositorios que la empresa conectó, con su veredicto.
2. **Decidir queda registrado.** Aprobar, aprobar con condiciones, rechazar o delegar escribe en el registro encadenado de la base (`public.approvals`), no en el navegador.
3. **El PR lleva a la decisión y se entera.** El comentario enlaza a decidir esa versión en la app, y el PR lleva un check «Speco · decisión».

Más la **segunda puerta** (spec 016): quien no tiene código cuenta lo que quiere, decide lo importante y se lleva un texto para su herramienta de IA.

## El recorrido

```
PR cambia una spec ─▶ Speco comenta (con «Decidir en Speco →») y abre el check «Speco · decisión» (acción requerida)
        │
        ▼
Quien aprueba abre el enlace ─▶ ve la versión que propone el PR ─▶ aprueba / rechaza / delega (queda en el registro)
        │
        ▼
El check pasa a verde (aprobado) o rojo (rechazado) y el comentario lo dice. Sin nombres ni motivos: el PR puede ser público.
```

- Con una **nueva push**, la versión nueva tiene su propio check pendiente: lo que se decidió antes no cuenta.
- El check **informa** lo que una persona registró; no decide ni mergea. Para que impida mergear, hay que pedirlo en la protección de rama: *Require status checks → «Speco · decisión»*.
- Solo ocurre en repositorios que la empresa **eligió leer**. En los demás (por ejemplo el repo de prueba del QR) el comentario sigue como antes, con la invitación a instalar y sin check: un check que nadie puede resolver trabaría el merge para siempre.
- Un enlace que nombra una empresa (`?org=`) abre esa empresa si la persona es miembro, y se ignora si no.

## Segunda puerta

Una empresa vacía abre con una pregunta: *«Ya tengo software»* o *«Tengo una idea y todavía no tengo código»*. La segunda lleva a `/ideas`:

- La persona escribe lo que quiere con sus palabras. Speco hace hasta 7 preguntas, **una por vez**, con ejemplos. Son deterministas: sin modelo, sin créditos, las mismas para las mismas palabras (`cloud/speco_cloud/interview.py`).
- Una pregunta que no puede responder queda **abierta y cuenta como riesgo**, y el texto para la herramienta le dice que no adivine.
- Se guarda en la base de la empresa (`public.ideas`), sin repositorio. Se puede cambiar una respuesta cuando quiera.
- Ninguna pantalla usa «repositorio», «commit», «pull request» ni «requisito»: un chequeo en navegador lo vigila.
- **Falta** la historia 4 de la spec 016: comparar lo que la herramienta construyó con lo decidido (`FR-008`, `FR-009`).

## Qué está verificado y qué no

| Qué | Cómo se probó | Estado |
|---|---|---|
| Lista y revisión por empresa, aislamiento entre empresas | `tests/cloud/test_decision_loop.py` (base real) y navegador | verificado |
| Aprobar, rechazar, delegar; con bloqueantes se pide *override* y motivo; un *viewer* y un token de agente no deciden | los mismos tests; el rechazo del agente lo hace la base | verificado |
| El comentario enlaza y el check se resuelve al decidir | `tests/cloud/test_decision_bridge.py` con un GitHub **falso** | verificado con GitHub falso |
| Lo anterior contra GitHub real | — | **sin probar**: ver abajo |
| La segunda puerta, en navegador sin palabras técnicas | `web/scripts/verify-cloud.mjs` | verificado |

Los 147 chequeos de `verify-cloud.mjs` y la suite completa (`pytest`: 600 tests, `tests/cloud` incluido) pasan.

## Desplegarlo: en este orden

Aplicar la web antes que el servicio rompe la página de decisiones en producción (pediría rutas que todavía no existen).

1. **Migraciones**, en orden, con `POSTGRES_URL_NON_POOLING` (ver `docs/35`): `20261024000001_decision_loop.sql` y `20261024000002_ideas.sql`.
2. **Permiso de la App:** en `github.com/settings/apps/speco-pr-review` → *Permissions & events* → *Repository permissions* → **Checks: Read and write**. Cada instalación recibe un aviso y tiene que aceptarlo; hasta entonces el comentario llega y el check no (queda en el log del servicio). `python scripts/create_github_app.py --check` dice si la App difiere del manifiesto.
3. **El servicio:** `scripts/deploy_api.sh`.
4. **La web:** el merge a `main` recompila las dos webs.
5. **Probarlo de punta a punta** con un PR real en un repo que la empresa tenga conectado, y anotar acá cuánto tardó el check.

## Límites conocidos

- Si el PR **se cierra sin merge**, el check queda como estaba.
- Una feature **nueva** del PR solo se abre por el enlace del comentario: no figura en la lista hasta que se mergea.
- Cualquier dueño, admin o *approver* puede resolver el check; no hay todavía una regla de «dos personas».
- Si GitHub rechaza el check (falta el permiso), el servicio lo registra y sigue: la decisión queda guardada igual.
