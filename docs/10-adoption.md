# 10 · Adopción: CI, baseline, waivers, SARIF

Objetivo: que un equipo con deuda existente pueda encender specreview **hoy** en cada PR y sólo hablar de lo nuevo.

## GitHub Action
```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: agustindelmonti/speco.ia@v1
  with: { fail-on: blocker }        # diff-base: auto -> en un PR sólo revisa las features que el PR tocó
```
La acción (`action.yml`): instala specreview, corre `--all --diff origin/<base>`, sube **SARIF** a Code Scanning (anotaciones
en el diff), mantiene **un** comentario del PR (se actualiza, no se acumula) y escribe el resumen en el job. Permisos:
`contents: read`, `pull-requests: write`, `security-events: write`. `specreview init` deja el workflow listo.

## Configuración (`specreview.toml`, opcional)
`fail_on`, `min_severity`, `threshold`, `disable_rules = ["QUA003"]`, `ignore_features = ["000-legacy"]`. Un flag de la CLI siempre gana.

## Baseline y waivers
| Comando | Qué hace |
|---|---|
| `specreview baseline` | Registra los hallazgos actuales en `.specreview/baseline.json`; desde ahí sólo se reportan los nuevos. |
| `specreview waive <fingerprint> --reason "..." [--author] [--expires YYYY-MM-DD]` | Acepta un hallazgo concreto con motivo, autor y fecha (`.specreview/waivers.json`). Sin motivo no hay waiver. |
| `--no-baseline` | Ver todo, ignorando baseline y waivers. |

El **fingerprint** es `sha1(feature | regla | ids | archivo)`: no incluye número de línea ni el texto del mensaje, así que editar
la spec por encima de un hallazgo no lo resucita. Aparece en `-f json` y como `partialFingerprints` en SARIF.
Todo son archivos del repo: la excepción se revisa en un PR como cualquier otro cambio.

## Formatos y exit codes
`-f text|json|markdown|html|sarif`. Exit 0 ok · 1 hay hallazgos desde `--fail-on` (ya sin los suprimidos) · 2 error de uso/config.

## Publicación
`pyproject.toml` quedó listo para PyPI (`python -m build` genera sdist y wheel). `.github/workflows/publish.yml` publica al
empujar un tag `v*` con *trusted publishing* (hay que dar de alta el proyecto en PyPI una vez; no se guarda ningún token).
**Pendiente del dueño:** elegir y agregar un `LICENSE` (no se declaró ninguno a propósito).
