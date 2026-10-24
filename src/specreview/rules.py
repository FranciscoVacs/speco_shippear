"""Rule catalog: the single source of truth for what each rule means.

Consumed by `specreview rules` / `--explain`, the web UI (/api/rules and the exported HTML) and the docs, so the
explanation a user reads next to a finding can never drift from what the code does.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

QUESTIONS = {
    "cobertura": "¿Qué requisitos no tienen correlato en el plan, y qué pasos del plan no responden a ningún requisito?",
    "calidad": "¿Qué requisitos son ambiguos o no se pueden testear?",
    "aceptacion": "¿Qué criterios de aceptación faltan?",
    "contradiccion": "¿Hay requisitos que se contradicen?",
    "producto": "¿Esta feature responde a un objetivo de producto y respeta lo que ya se decidió?",
}


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    family: str            # COV | QUA | CON
    question: str          # key of QUESTIONS
    severity: str          # how severity is decided (human text)
    what: str              # what it detects
    why: str               # why it matters before writing code
    fix: str               # how to resolve it
    bad: str = ""          # example that triggers it
    good: str = ""         # example that does not
    caveat: str = ""       # known limits / when it is likely a false positive


RULES: list[Rule] = [
    Rule("COV000", "Sin plan ni tasks", "COV", "cobertura",
         "Bloqueante.",
         "La carpeta de la feature tiene spec.md pero no plan.md ni tasks.md.",
         "Sin plan ni tasks no hay contra qué cruzar los requisitos: no se puede saber si alguien va a implementarlos.",
         "Correr /speckit.plan y /speckit.tasks en Spec Kit y volver a revisar."),
    Rule("COV001", "Requisito sin plan", "COV", "cobertura",
         "Bloqueante si el repo cita requisitos (FR-###) en plan/tasks o si un modelo lo confirma (--llm); si no, advertencia.",
         "Un requisito funcional (FR-###) que ni el plan ni ninguna task parecen implementar.",
         "Es lo que más cuesta después: el agente construye lo que está en las tasks, y un requisito sin task simplemente no se hace.",
         "Agregar la task que lo implementa y citar el id (por ejemplo «… (FR-005)») para que quede trazable, o quitar el requisito si ya no aplica.",
         "FR-005: System MUST record an audit log entry for every invitation event  → ninguna task habla de auditoría.",
         "T015 [US1] Registrar evento de auditoría por cada cambio de invitación (FR-005) en src/audit.py",
         "Spec Kit no vincula tasks con requisitos, así que se infiere por similitud de texto. Si el requisito sí está implementado con otras palabras, "
         "es un falso positivo: citá el id en la task para que deje de aparecer."),
    Rule("COV002", "Task sin requisito", "COV", "cobertura",
         "Advertencia si casi todo el vocabulario de la task es nuevo para la spec; si no, sugerencia.",
         "Una task de una user story que introduce conceptos que ningún requisito menciona (posible scope que se coló).",
         "El trabajo que no responde a un requisito se construye igual, se revisa igual y se mantiene igual, sin que nadie lo haya pedido.",
         "Si es intencional, agregar el requisito que lo justifica. Si no, eliminar la task.",
         "T010 Add CSV bulk import of invitees  → ningún requisito habla de importación masiva.",
         "FR-011: System MUST allow admins to import invitees from a CSV file",
         "Las tasks de Setup, Foundational y Polish no se reportan: son infraestructura compartida por diseño de Spec Kit. "
         "Las tasks técnicas legítimas (cache, lint, tipos) pueden aparecer como sugerencia."),
    Rule("COV003", "Paso del plan sin requisito", "COV", "cobertura",
         "Advertencia si casi todo el vocabulario del paso es nuevo para la spec; si no, sugerencia.",
         "Una frase del plan (Summary/Approach) o una entidad de data-model.md que ningún requisito justifica.",
         "El plan es donde se decide qué se construye; agregar algo ahí sin requisito es la forma más silenciosa de ampliar el alcance.",
         "Agregar el requisito o sacarlo del plan.",
         "Plan: «We also add a Slack notification channel…»  → ningún FR menciona Slack.",
         "FR-012: System MUST notify admins in Slack when an invitation is accepted"),
    Rule("COV004", "Requisito sin task", "COV", "cobertura",
         "Advertencia.",
         "El requisito aparece en el plan pero ninguna task de tasks.md lo implementa.",
         "El plan dice qué se hará; las tasks son lo que el agente ejecuta. Lo que está solo en el plan no se construye.",
         "Agregar la task correspondiente en tasks.md (/speckit.tasks)."),
    Rule("COV005", "Referencia a requisito inexistente", "COV", "cobertura",
         "Advertencia.",
         "Una task o paso del plan cita un id (por ejemplo FR-099) que no existe en spec.md.",
         "Un id roto suele ser un requisito borrado o renumerado: el trabajo quedó huérfano o apunta a algo equivocado.",
         "Corregir el id o agregar el requisito."),
    Rule("COV006", "Cobertura sin confirmar", "COV", "cobertura",
         "Sugerencia.",
         "No hay evidencia clara de que el requisito esté implementado, pero tampoco evidencia clara de que falte.",
         "Es la zona gris del texto: conviene mirarlo, no necesariamente arreglarlo.",
         "Citar el id del requisito en la task que lo implementa, o correr con --llm para que un modelo lo verifique.",
         caveat="Típico en requisitos que son restricciones («MUST NOT alterar el catálogo») y no generan una task propia."),
    Rule("QUA001", "Requisito ambiguo", "QUA", "calidad",
         "Advertencia.",
         "Palabras que dejan la decisión al implementador: «appropriately», «as needed», «etc», «reasonable», «adecuado», «según sea necesario».",
         "Cuando la spec no decide, decide el agente, y elige un default que el equipo no necesariamente quería (intent drift).",
         "Reemplazar por un comportamiento o valor concreto.",
         "System MUST handle invitation traffic appropriately",
         "System MUST accept up to 100 invitation requests per minute and reject the rest with HTTP 429"),
    Rule("QUA002", "Requisito no testeable", "QUA", "calidad",
         "Advertencia.",
         "Un atributo de calidad sin umbral medible («fast», «scalable», «user-friendly»), o un requisito sin verbo normativo o con uno no vinculante («should», «may»).",
         "Si no se puede decir cuándo se cumple, no hay forma de verificar que el código lo cumple.",
         "Definir un número verificable, o usar MUST si es obligatorio.",
         "System MUST provide a fast and user-friendly dashboard",
         "When the dashboard is opened, the system MUST show pending invitations within 2 seconds for up to 500 rows",
         "Un número en el mismo requisito neutraliza la regla («within 200 ms»)."),
    Rule("QUA003", "Forma no EARS", "QUA", "calidad",
         "Sugerencia.",
         "El requisito no sigue ninguno de los patrones EARS (ubicuo, evento, estado, no deseado, opcional); típicamente está escrito desde el actor («Users MUST be able to…»).",
         "EARS obliga a nombrar el disparador y la respuesta del sistema, que es justo lo que se necesita para testear.",
         "Reformular desde el sistema: «System MUST allow admins to revoke…» o «When <evento>, the system MUST …».",
         "Admins MUST be able to revoke a pending invitation",
         "System MUST allow admins to revoke a pending invitation",
         "«System MUST …» (el estilo que genera Spec Kit) cuenta como patrón ubicuo y no se marca."),
    Rule("QUA004", "Pregunta abierta", "QUA", "calidad",
         "Bloqueante.",
         "Quedó un marcador [NEEDS CLARIFICATION: …] sin resolver.",
         "Es una decisión que el propio Spec Kit marcó como necesaria y nadie tomó; planificar encima es construir sobre una suposición.",
         "Responderla con /speckit.clarify y actualizar el requisito."),
    Rule("QUA005", "Story sin escenarios", "QUA", "aceptacion",
         "Advertencia.",
         "Una user story no tiene Acceptance Scenarios.",
         "Sin escenarios Given/When/Then no hay forma de saber cuándo la story está terminada.",
         "Agregar al menos un escenario Given/When/Then."),
    Rule("QUA006", "Requisito sin criterio de aceptación", "QUA", "aceptacion",
         "Advertencia si nada en los criterios se le parece; sugerencia si hay algo parecido.",
         "Ningún escenario ni Success Criterion parece verificar el requisito.",
         "Un requisito sin criterio de aceptación es un deseo: no hay forma de comprobar que el código lo cumple.",
         "Agregar un escenario Given/When/Then o un SC medible.",
         caveat="Se compara por texto: un criterio escrito con otras palabras puede no reconocerse. Citá el id del requisito en el escenario («… (FR-008)») y se reconoce siempre."),
    Rule("QUA007", "Requisito no atómico", "QUA", "calidad",
         "Sugerencia.",
         "Un mismo requisito contiene varios MUST.",
         "Varios requisitos en uno no se pueden cubrir, testear ni priorizar por separado.",
         "Separarlo en requisitos atómicos, cada uno con su criterio de aceptación."),
    Rule("QUA008", "Escenario incompleto", "QUA", "aceptacion",
         "Advertencia.",
         "Un escenario de aceptación no tiene Given, When o Then.",
         "Un escenario a medias no define ni la situación inicial, ni la acción, ni el resultado esperado.",
         "Completar las tres partes."),
    Rule("CON001", "Contradicción", "CON", "contradiccion",
         "Bloqueante.",
         "Dos requisitos sobre el mismo tema con valores distintos (7 días vs 30 días) o uno que exige y otro que prohíbe lo mismo.",
         "El agente tiene que elegir uno, y cuál elija es azar: la spec no tiene una respuesta.",
         "Decidir cuál vale y eliminar o corregir el otro.",
         "FR-003: expire invitations after 7 days  /  FR-007: expire invitations after 30 days",
         caveat="Las unidades de tiempo se convierten (60 min = 1 hora). Requisitos de temas distintos no se comparan."),
    Rule("CON002", "Posible contradicción (modelo)", "CON", "contradiccion",
         "Advertencia (nunca bloqueante: el juicio de un modelo no es reproducible).",
         "Un modelo (--llm) cree que dos requisitos no pueden cumplirse a la vez.",
         "Detecta contradicciones semánticas que las reglas de texto no ven.",
         "Revisar a mano; puede ser un falso positivo."),
    Rule("PRD001", "Feature sin objetivo", "PRD", "producto",
         "Advertencia.",
         "La spec no declara a qué objetivo de producto (G-n) responde, y el repo tiene objetivos definidos en product/goals.md.",
         "Sin objetivo no hay forma de saber si la feature vale la pena: es la puerta por la que se cuela alcance.",
         "Agregar «**Goals**: G-n» en el encabezado de la spec; si ningún objetivo la justifica, decidir si entra.",
         "(sin línea Goals)", "**Goals**: G-2",
         "Es opt-in: sólo se evalúa si existe la carpeta product/ con goals.md."),
    Rule("PRD002", "Referencia de producto inexistente", "PRD", "producto",
         "Advertencia.",
         "La spec cita un objetivo (G-n) o una decisión (D-n) que no existe en product/.",
         "Un id roto suele ser un objetivo renumerado o una decisión borrada: la trazabilidad quedó apuntando a nada.",
         "Corregir el id o agregar el objetivo / la decisión."),
    Rule("PRD003", "Contradice una decisión de producto", "PRD", "producto",
         "Bloqueante si la spec cita una decisión superseded o rechazada; advertencia si sólo se infiere por texto.",
         "La spec se apoya en una decisión que ya no vale, o un requisito usa un término que una decisión vigente dejó fuera (**Out of scope**).",
         "Es el clásico «esto ya lo discutimos y dijimos que no»: sin registro, la decisión se pierde y el agente la contradice.",
         "Confirmar el conflicto; si es real, reabrir la decisión (nuevo D-n que la reemplace) o cambiar el requisito.",
         "FR-004: expire unused points after 12 months  /  D-003 (accepted): Points never expire; Out of scope: expire",
         caveat="La detección por texto sólo mira los términos que la decisión declara en «Out of scope»; puede ser un falso positivo."),
    Rule("PRD004", "Objetivo sin feature", "PRD", "producto",
         "Advertencia.",
         "Un objetivo de product/goals.md no es citado por ninguna feature (`specreview product`).",
         "Un objetivo que nadie construye es una promesa sin dueño: o falta una feature, o el objetivo ya no es real.",
         "Planificar una feature que lo cubra, o decidir que deja de ser un objetivo.",
         caveat="Se evalúa sobre el conjunto de features, no sobre una sola: aparece en `specreview product`, no en la revisión de una feature."),
    Rule("PRD005", "Supuesto de usuario sin evidencia", "PRD", "producto",
         "Advertencia.",
         "Un supuesto sobre usuarios o clientes en la spec no cita evidencia (entrevista, datos, encuesta, link).",
         "Es el supuesto que nadie validó: si es falso, se construye bien lo equivocado.",
         "Citar de dónde sale, o marcarlo como hipótesis a validar antes de construir.",
         "Users want to pay annually", "Users want to pay annually (source: 12 customer interviews, Sept)"),
    Rule("PRD006", "Issue de Jira inexistente o cerrado", "PRD", "producto",
         "Advertencia.",
         "La spec cita un issue de Jira (`**Jira**: PROJ-12`) que no está en el caché `product/jira.json`, o que Jira marca como terminado.",
         "Es la spec apuntando a trabajo que ya no existe o que el equipo cree terminado: la gestión y la spec dejaron de coincidir.",
         "Corregir la clave, sincronizar (`specreview jira sync`) o reabrir el issue si el trabajo sigue vigente.",
         caveat="Opt-in: sólo con una carpeta product/ y un caché sincronizado. Las revisiones nunca llaman a la red: leen el caché."),
    Rule("PRD007", "Contradice un número decidido", "PRD", "producto",
         "Bloqueante.",
         "Una decisión vigente fija el número de una regla (`**Fixes**: 021/FR-008 = 10` en product/decisions.md) y la regla dice otro número.",
         "Es el número que alguien decidió, cambiado en la spec sin reabrir la decisión: el agente construye el número nuevo y nadie lo aprobó.",
         "Reabrir la decisión (una nueva que la reemplace, con el número nuevo) o volver la regla al número decidido.",
         "D-015 Fixes: 021/FR-008 = 10  /  FR-008: If a person already earned for 15 referrals…",
         "D-015 Fixes: 021/FR-008 = 10  /  FR-008: If a person already earned for 10 referrals…",
         caveat="Compara números, no unidades: «10» coincide con cualquier 10 que diga la regla."),
]

BY_ID = {r.id: r for r in RULES}


def rules_as_dicts() -> list[dict]:
    return [asdict(r) for r in RULES]


def explain(rule_id: str) -> str:
    r = BY_ID.get(rule_id.upper())
    if r is None:
        raise KeyError(rule_id)
    q = QUESTIONS[r.question]
    out = [f"{r.id} · {r.name}", f"Responde a: {q}", "", f"Qué detecta:   {r.what}", f"Por qué importa: {r.why}",
           f"Severidad:      {r.severity}", f"Cómo arreglarlo: {r.fix}"]
    if r.bad:
        out += ["", f"Ejemplo que la dispara:\n  {r.bad}"]
    if r.good:
        out += [f"Ejemplo correcto:\n  {r.good}"]
    if r.caveat:
        out += ["", f"Ojo: {r.caveat}"]
    return "\n".join(out) + "\n"


def render_list() -> str:
    w = max(len(r.name) for r in RULES)
    lines = ["Reglas (specreview --explain <ID> para el detalle):", ""]
    for r in RULES:
        lines.append(f"  {r.id}  {r.name:<{w}}  {r.what.split('.')[0]}.")
    return "\n".join(lines) + "\n"
