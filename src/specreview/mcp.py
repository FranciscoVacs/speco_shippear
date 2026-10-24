"""MCP server (stdio) so the coding agent can review a spec *before* implementing it.

    specreview mcp [ROOT]          # ROOT = repo root (default: the current directory)

Hand-rolled JSON-RPC 2.0 over newline-delimited stdio (MCP 2024-11-05 .. 2025-06-18): the tool keeps zero runtime
dependencies, and the surface we need (tools, resources, prompts) is small. Every tool returns the same structures as
`-f json`, with the repo's config / baseline / waivers already applied, so the agent sees what CI will see.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from . import suppress
from .analyzers import Context, run_all
from .parser import load_feature
from .parser.loader import FeatureNotFound, discover_features
from .report import build_report, to_dict
from .rules import BY_ID, QUESTIONS, explain

SUPPORTED = ("2025-06-18", "2025-03-26", "2024-11-05")
INSTRUCTIONS = ("Speco: el lugar donde vive el QUÉ de este producto (qué hace hoy, qué hay que construir), no el cómo. "
                "Antes de leer código para entender qué hace el producto, llamá what_it_does (o intent_ledger): cada regla de las "
                "specs con su estado (propuesta, decidida, construida sin test, con test, verificada, rota) y la evidencia que la "
                "respalda. intent_history dice cómo llegó una regla a lo que dice y quién lo decidió. Para crear o corregir el qué, "
                "usá draft_feature y change_requirement (escriben sólo la spec y dejan registro); verify_intent corre los tests que "
                "citan una regla. Citá cada regla en sus tests como <feature>/<id> (p. ej. 028/FR-002). Llamá get_blockers antes "
                "de implementar y arreglá los bloqueantes en la spec, no en el código. Vos proponés; aprobar es de una persona.")


class ToolError(Exception):
    pass


class UnknownMethod(Exception):
    pass


def _version() -> str:
    try:
        from importlib.metadata import version
        return version("specreview")
    except Exception:
        return "0.0.0"


class Server:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    # ------------------------------------------------------------ domain
    def _features(self) -> dict[str, Path]:
        feats = discover_features(self.root)
        if not feats:
            raise ToolError(f"no hay features Spec Kit (specs/*/spec.md) en {self.root}")
        return feats

    def _review(self, feature: str | None, raw: bool = False) -> dict:
        feats = self._features()
        if feature is None:
            feature = sorted(feats)[-1]                      # Spec Kit's own default: the highest-numbered feature
        # accept "003", "003-team-invitations" or a unique suffix
        match = [n for n in feats if n == feature or n.startswith(feature + "-") or n.endswith(feature)]
        if len(match) != 1:
            raise ToolError(f"feature {feature!r} " + ("es ambigua: " + ", ".join(match) if match else
                                                      f"no existe. Disponibles: {', '.join(feats)}"))
        try:
            feat = load_feature(feats[match[0]])
            rep = build_report(feat, run_all(feat, Context()))
        except FeatureNotFound as e:
            raise ToolError(str(e)) from None
        if not raw:
            try:
                cfg = suppress.load_config(self.root)
                rep = suppress.apply(rep, cfg, suppress.load_baseline(self.root), suppress.load_waivers(self.root))
            except ValueError as e:
                raise ToolError(str(e)) from None
        return to_dict(rep)

    # ------------------------------------------------------------ tools
    def t_list_features(self, a: dict):
        out = []
        for n in self._features():
            d = self._review(n)
            out.append({"feature": n, **d["summary"], "can_implement": d["decision"]["can_implement"],
                        "verdict": d["decision"]["verdict"], "waiting_on": d["decision"]["waiting_on"]})
        return out

    def t_review_feature(self, a: dict):
        d = self._review(a.get("feature"), raw=bool(a.get("ignore_baseline")))
        sev = a.get("min_severity")
        if sev:
            order = {"suggestion": 1, "warning": 2, "blocker": 3}
            if sev not in order:
                raise ToolError("min_severity debe ser suggestion | warning | blocker")
            d["findings"] = [f for f in d["findings"] if order[f["severity"]] >= order[sev]]
        return d

    def t_get_blockers(self, a: dict):
        d = self._review(a.get("feature"))
        blockers = [f for f in d["findings"] if f["severity"] == "blocker"]
        return {"feature": d["feature"], "can_implement": not blockers, "verdict": d["decision"]["verdict"],
                "needs_product_decision": [f for f in d["findings"] if f["owner"] == "decision" and f["severity"] != "suggestion"],
                "blockers": blockers,
                "next_step": ("Sin bloqueantes: se puede implementar. Revisá igual las advertencias (review_feature)."
                              if not blockers else
                              "Arreglá estos bloqueantes EN LA SPEC (spec.md/plan.md/tasks.md) y volvé a llamar; no implementes todavía.")}

    def t_explain_rule(self, a: dict):
        rid = str(a.get("rule", "")).upper()
        if rid not in BY_ID:
            raise ToolError(f"no existe la regla {rid!r}; reglas: {', '.join(BY_ID)}")
        r = BY_ID[rid]
        return {"id": r.id, "name": r.name, "question": QUESTIONS[r.question], "text": explain(rid), "bad": r.bad, "good": r.good}

    def t_check_requirement(self, a: dict):
        text = str(a.get("text", "")).strip()
        if not text:
            raise ToolError("falta `text`: el requisito a validar")
        if not text.upper().startswith(("FR-", "- ")):
            text = f"- **FR-001**: {text}"
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "specs" / "001-check"
            d.mkdir(parents=True)
            (d / "spec.md").write_text("# Feature Specification: check\n## Requirements\n### Functional Requirements\n"
                                       + text + "\n", encoding="utf-8")
            feat = load_feature(d)
            rep = build_report(feat, run_all(feat, Context(), only=["quality"]))
        from . import ears
        req = feat.spec.requirements[0] if feat.spec.requirements else None
        issues = [f for f in to_dict(rep)["findings"] if f["rule"] in ("QUA001", "QUA002", "QUA003", "QUA007")]
        return {"ok": not issues, "ears_pattern": ears.classify(req.text) if req else "none",
                "hint": ears.suggest_rewrite_hint(req.text) if req else None,
                "issues": [{k: f[k] for k in ("rule", "rule_name", "severity", "message", "fix")} for f in issues]}

    def t_product_overview(self, a: dict):
        from .product import product_report
        rep = product_report(self.root, self._features())
        if rep is None:
            raise ToolError("no hay carpeta product/ (goals.md, decisions.md): la capa de producto es opt-in")
        return rep

    def t_approval_status(self, a: dict):
        """Read-only on purpose: an agent may ask whether a feature is approved, never approve it."""
        from . import approvals
        feats = self._features()
        name = self._review(a.get("feature"))["feature"]
        st = approvals.status(self.root, name, feats[name]).to_dict()
        latest = st.pop("latest")
        st["latest"] = None if latest is None else {k: latest[k] for k in ("id", "decision", "reason", "conditions", "at", "by", "verdict")}
        st["feature"] = name
        st["approved_current_version"] = st["state"] in ("approved", "approved_with_conditions") and not st["stale"]
        return st

    # ------------------------------------------------------------ the what (spec 028)
    def _ledger(self) -> dict:
        from . import ledger
        try:
            return ledger.build(self.root)
        except ValueError as e:
            raise ToolError(str(e)) from None

    def t_what_it_does(self, a: dict):
        from . import ledger
        led = self._ledger()
        groups = ledger.what_it_does(led)
        feat, q = str(a.get("feature") or ""), str(a.get("query") or "").lower()
        if feat:
            groups = [g for g in groups if g["feature"] == feat or g["feature"].startswith(feat + "-")]
        if q:                                                    # «referidos», «billing»: in the feature's name or the rule's text
            groups = [{**g, "rules": g["rules"] if q in (g["feature"] + " " + g["title"]).lower()
                       else [r for r in g["rules"] if q in r["text"].lower()]} for g in groups]
            groups = [g for g in groups if g["rules"]]
        return {"features": groups, "counts": led["counts"],
                "note": "Lo que las specs dicen que el software hace hoy, con su evidencia. «verificada» = la última corrida de sus tests, "
                        "para este texto, pasó; «con test» = un test la cita pero nadie lo corrió; «construida sin test» = sólo la palabra de la spec."}

    def t_intent_ledger(self, a: dict):
        led = self._ledger()
        feat, state = a.get("feature"), a.get("state")
        if state and state not in ("proposed", "decided", "built", "covered", "verified", "failing"):
            raise ToolError("state debe ser proposed | decided | built | covered | verified | failing")
        items = [i for i in led["intents"] if (not state or i["state"] == state)
                 and (not feat or i["feature"] == feat or i["feature"].startswith(str(feat) + "-"))]
        return {"counts": led["counts"], "total": led["total"], "intents": items, "orphans": led["orphans"],
                "verify_command": led["verify_command"], "records": led["records"]}

    def t_get_intent(self, a: dict):
        from . import ledger
        try:
            return ledger.find(self._ledger(), str(a.get("ref", "")))
        except ValueError as e:
            raise ToolError(str(e)) from None

    def t_intent_history(self, a: dict):
        from . import ledger
        try:
            return ledger.history(self.root, str(a.get("ref", "")))
        except ValueError as e:
            raise ToolError(str(e)) from None

    def t_verify_intent(self, a: dict):
        from . import ledger
        try:
            return ledger.verify(self.root, str(a.get("ref", "")), by=str(a.get("by") or "agente"), via="mcp")
        except ValueError as e:
            raise ToolError(str(e)) from None

    def t_draft_feature(self, a: dict):
        from . import ledger
        try:
            return ledger.draft_feature(self.root, str(a.get("title", "")), list(a.get("requirements") or []),
                                        description=str(a.get("description") or ""), success_criteria=list(a.get("success_criteria") or []),
                                        goals=list(a.get("goals") or []), decisions=list(a.get("decisions") or []),
                                        by=str(a.get("by") or "agente"), via="mcp", reason=str(a.get("reason") or ""))
        except ValueError as e:
            raise ToolError(str(e)) from None

    def t_change_requirement(self, a: dict):
        from . import ledger
        try:
            return ledger.change_requirement(self.root, str(a.get("feature", "")), str(a.get("text", "")), rid=a.get("id"),
                                             kind=str(a.get("kind") or "FR"), reason=str(a.get("reason") or ""),
                                             by=str(a.get("by") or "agente"), via="mcp")
        except ValueError as e:
            raise ToolError(str(e)) from None

    def t_suggest_values(self, a: dict):
        from . import evidence
        try:
            found = evidence.suggest_values(self.root)
        except ValueError as e:
            raise ToolError(str(e)) from None
        return {"suggestions": found, "toml": evidence.to_toml(found) if found else "",
                "next_step": "Es una propuesta: revisá cada línea y pegá en specreview.toml las que correspondan, en un PR. No se escribió nada."}

    TOOLS = {
        "what_it_does": ("EMPEZÁ ACÁ: qué hace hoy el software, regla por regla y por feature, con la evidencia que la respalda. Sin leer código. "
                         "Filtrá con feature (p. ej. 021) o query (una palabra del nombre de la feature o del texto de la regla, p. ej. referral).",
                         {"feature": {"type": "string"}, "query": {"type": "string"}}, []),
        "intent_ledger": ("Todas las reglas de las specs con su estado (proposed, decided, built, covered, verified, failing), sus citas en tests "
                          "y código, y la evidencia huérfana. Filtrá por feature o estado.",
                          {"feature": {"type": "string"}, "state": {"type": "string", "enum": ["proposed", "decided", "built", "covered", "verified", "failing"]}}, []),
        "get_intent": ("Una regla: texto, estado, tests y código que la citan, última verificación.",
                       {"ref": {"type": "string", "description": "<feature>/<id>, p. ej. 028/FR-002"}}, ["ref"]),
        "intent_history": ("Cómo llegó una regla a lo que dice: cada versión en git (quién, cuándo), aprobaciones, cambios propuestos y verificaciones, en orden.",
                           {"ref": {"type": "string"}}, ["ref"]),
        "suggest_values": ("Propone vincular cada regla que dice un número (un tope, un plazo, un monto) con la línea de código que lo guarda, como "
                           "bloque [values] para specreview.toml. No escribe nada: una persona lo revisa en el PR.", {}, []),
        "verify_intent": ("Corre sólo los tests que citan la regla con el comando de specreview.toml [ledger] verify y deja la corrida en un registro encadenado.",
                          {"ref": {"type": "string"}, "by": {"type": "string", "description": "quién la pide (queda en el registro)"}}, ["ref"]),
        "draft_feature": ("Crear el qué de una feature nueva: escribe specs/NNN-x/spec.md en Draft con los requisitos y devuelve su revisión. No aprueba.",
                          {"title": {"type": "string"}, "requirements": {"type": "array", "items": {"type": "string"}},
                           "description": {"type": "string"}, "success_criteria": {"type": "array", "items": {"type": "string"}},
                           "goals": {"type": "array", "items": {"type": "string"}}, "decisions": {"type": "array", "items": {"type": "string"}},
                           "reason": {"type": "string"}, "by": {"type": "string"}}, ["title", "requirements"]),
        "change_requirement": ("Corregir o agregar una regla en una spec existente (sin `id` agrega una nueva). Devuelve antes/después, valores que se movieron, "
                               "la revisión de esa regla y si la aprobación quedó vieja.",
                               {"feature": {"type": "string"}, "id": {"type": "string", "description": "FR-003; omitir para agregar"},
                                "text": {"type": "string"}, "kind": {"type": "string", "enum": ["FR", "SC"]},
                                "reason": {"type": "string", "description": "por qué cambia (queda en el registro)"}, "by": {"type": "string"}},
                               ["feature", "text"]),
        "approval_status": ("Si una feature está aprobada, por quién y si la spec cambió desde entonces. Sólo lectura: un agente no aprueba.",
                            {"feature": {"type": "string"}}, []),
        "product_overview": ("Objetivos de producto → qué features los cubren, qué objetivos nadie construye y qué features no responden a ninguno.",
                             {}, []),
        "list_features": ("Lista las features del repo con sus conteos de hallazgos y si se pueden implementar (cero bloqueantes).",
                          {}, []),
        "review_feature": ("Revisa una feature (default: la más nueva): cobertura requisito↔plan↔tasks, calidad EARS, aceptación y contradicciones.",
                           {"feature": {"type": "string", "description": "id o prefijo, p. ej. 003 o 003-team-invitations"},
                            "min_severity": {"type": "string", "enum": ["suggestion", "warning", "blocker"]},
                            "ignore_baseline": {"type": "boolean", "description": "ver también lo del baseline y los waivers"}}, []),
        "get_blockers": ("Úsalo ANTES de implementar: devuelve sólo los bloqueantes y si se puede implementar.",
                         {"feature": {"type": "string"}}, []),
        "explain_rule": ("Qué significa una regla (COV001, QUA002, ...), por qué importa y cómo se arregla.",
                         {"rule": {"type": "string"}}, ["rule"]),
        "check_requirement": ("Valida UN requisito antes de escribirlo en la spec: forma EARS, ambigüedad, testeabilidad.",
                              {"text": {"type": "string", "description": "p. ej. «System MUST lock the account after 5 failed logins»"}}, ["text"]),
    }

    # ------------------------------------------------------------ protocol
    def handle(self, msg: dict) -> dict | None:
        mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
        notification = "id" not in msg
        try:
            result = self._dispatch(method, params)
        except ToolError as e:                                # only tools/call catches these; kept for safety
            return None if notification else self._err(mid, -32602, str(e))
        except UnknownMethod as e:
            return None if notification else self._err(mid, -32601, f"método no soportado: {e.args[0]}")
        return None if notification else {"jsonrpc": "2.0", "id": mid, "result": result}

    @staticmethod
    def _err(mid, code, message):
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": message}}

    def _dispatch(self, method, p):
        if method == "initialize":
            want = p.get("protocolVersion")
            return {"protocolVersion": want if want in SUPPORTED else SUPPORTED[0],
                    "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
                    "serverInfo": {"name": "specreview", "version": _version()}, "instructions": INSTRUCTIONS}
        if method in ("notifications/initialized", "notifications/cancelled"):
            return None
        if method == "ping":
            return {}
        if method == "tools/list":
            return {"tools": [{"name": n, "description": d, "inputSchema": {"type": "object", "properties": props, "required": req}}
                              for n, (d, props, req) in self.TOOLS.items()]}
        if method == "tools/call":
            name, args = p.get("name"), p.get("arguments") or {}
            if name not in self.TOOLS:
                raise ToolError(f"herramienta desconocida: {name}")
            try:
                data = getattr(self, "t_" + name)(args)
                return {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False, indent=2)}],
                        "structuredContent": data if isinstance(data, dict) else {"result": data}, "isError": False}
            except ToolError as e:
                return {"content": [{"type": "text", "text": str(e)}], "isError": True}
        if method == "resources/list":
            res = [{"uri": f"specreview://feature/{n}/report", "name": f"{n} · review", "mimeType": "application/json"}
                   for n in discover_features(self.root)]
            res.insert(0, {"uri": "specreview://ledger", "name": "El qué · ledger", "mimeType": "application/json"})
            return {"resources": res}
        if method == "resources/read":
            uri = p.get("uri", "")
            if uri == "specreview://ledger":
                return {"contents": [{"uri": uri, "mimeType": "application/json", "text": json.dumps(self._ledger(), ensure_ascii=False, indent=2)}]}
            n = uri.removeprefix("specreview://feature/").removesuffix("/report")
            try:
                text = json.dumps(self._review(n), ensure_ascii=False, indent=2)
            except ToolError as e:
                raise ToolError(str(e)) from None
            return {"contents": [{"uri": uri, "mimeType": "application/json", "text": text}]}
        if method == "prompts/list":
            return {"prompts": [{"name": "review-spec", "description": "Revisar la spec antes de implementarla",
                                 "arguments": [{"name": "feature", "required": False}]}]}
        if method == "prompts/get":
            if p.get("name") != "review-spec":
                raise ToolError("prompt desconocido")
            f = (p.get("arguments") or {}).get("feature", "")
            return {"messages": [{"role": "user", "content": {"type": "text", "text":
                    f"Antes de implementar, llamá a get_blockers{f' para {f}' if f else ''}. Si hay bloqueantes, "
                    "arreglalos en la spec (no en el código) y repetí hasta que can_implement sea true. "
                    "Luego mostrame las advertencias con review_feature."}}]}
        raise UnknownMethod(method)


def serve(root: Path, stdin=None, stdout=None) -> int:
    stdin, stdout = stdin or sys.stdin, stdout or sys.stdout
    srv = Server(root)
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            if not isinstance(msg, dict):
                raise ValueError
        except ValueError:
            reply = Server._err(None, -32700, "JSON inválido")
        else:
            try:
                reply = srv.handle(msg)
            except ToolError as e:
                reply = Server._err(msg.get("id"), -32602, str(e))
            except Exception as e:                                           # never let one bad call kill the session
                reply = Server._err(msg.get("id"), -32603, f"{type(e).__name__}: {e}")
        if reply is not None:
            stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
            stdout.flush()
    return 0
