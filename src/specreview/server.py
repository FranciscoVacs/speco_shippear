"""Local HTTP server: the JSON API the web UI consumes (docs/05-ui-contract.md) + optional static files.

Stdlib only. Binds to 127.0.0.1 by default. Only features discovered under `root` are ever readable, and only a
fixed whitelist of file names inside them, so a request can never reach arbitrary paths.
"""
from __future__ import annotations

import json
import mimetypes
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import approvals, members, slack
from .analyzers import Context, run_all
from .assistant import sanitize_messages, stream_reply
from .models import ChoiceError, choose, offered
from .parser import load_feature
from .parser.loader import discover_features
from .report import build_report, to_dict

SOURCE_FILES = ("spec.md", "plan.md", "tasks.md", "data-model.md", "research.md", "quickstart.md")


MAX_BODY = 256 * 1024
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def make_handler(root: Path, static_dir: Path | None, llm=None, judge: bool = False, allowed_hosts: set[str] | None = None,
                 slack_signing_secret: str | None = None, models: tuple[str, ...] = ()):
    """`llm` powers the assistant. It is also used as the analysis judge only if `judge` (costly) and it is not a demo.
    `models` are the ones a request may pick per turn (models.py); empty = no choice, the assistant is exactly as configured."""
    hosts = LOCAL_HOSTS | (allowed_hosts or set())
    analysis_llm = llm if (judge and llm is not None and not getattr(llm, "demo", False)) else None
    cache: dict[str, tuple[tuple, dict]] = {}

    def review(d: Path) -> dict:
        """Report dict for a feature dir, cached until any of its files changes (mtime+size)."""
        stamp = tuple((p.name, p.stat().st_mtime_ns, p.stat().st_size) for p in sorted(d.rglob("*")) if p.is_file())
        hit = cache.get(str(d))
        if hit and hit[0] == stamp:
            return hit[1]
        f = load_feature(d)
        rep = to_dict(build_report(f, run_all(f, Context(llm=analysis_llm))))
        cache[str(d)] = (stamp, rep)
        return rep

    class Handler(BaseHTTPRequestHandler):
        server_version = "specreview"

        def log_message(self, *a):  # quiet by default
            pass

        def _json(self, obj, status=200):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _feature(self, qs) -> Path | None:
            fid = (qs.get("feature") or [""])[0]
            return discover_features(root).get(fid)           # exact-match lookup: no path ever built from input

        def _guard(self) -> bool:
            """Reject DNS-rebinding (foreign Host) and cross-site browser requests (foreign Origin)."""
            host = urlsplit("//" + (self.headers.get("Host") or "")).hostname or ""
            if host not in hosts:
                self._json({"error": "host no permitido", "code": "forbidden"}, 403)
                return False
            origin = self.headers.get("Origin")
            if origin and (urlsplit(origin).hostname or "") not in hosts:
                self._json({"error": "origen no permitido", "code": "forbidden"}, 403)
                return False
            return True

        def _body(self) -> bytes | None:
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                n = -1
            if n <= 0 or n > MAX_BODY:
                self._json({"error": "cuerpo ausente o demasiado grande", "code": "bad_request"}, 413 if n > MAX_BODY else 400)
                return None
            return self.rfile.read(n)

        def _member(self):
            h = self.headers.get("Authorization") or ""
            return members.authenticate(root, h[7:].strip() if h.lower().startswith("bearer ") else None)

        def _post_approval(self):
            if (self.headers.get("Content-Type") or "").split(";")[0].strip() != "application/json":
                return self._json({"error": "Content-Type debe ser application/json", "code": "bad_request"}, 415)
            who = self._member()
            if who is None:
                configured = bool(members.list_members(root))
                return self._json({"error": "falta un token válido (Authorization: Bearer ...)" if configured else
                                   "no hay miembros configurados: `specreview member add NOMBRE --role approver`",
                                   "code": "unauthorized" if configured else "no_members"}, 401 if configured else 403)
            raw = self._body()
            if raw is None:
                return
            try:
                data = json.loads(raw)
                feature = str(data["feature"])
            except (ValueError, KeyError, TypeError):
                return self._json({"error": "cuerpo inválido: falta `feature`", "code": "bad_request"}, 400)
            d = discover_features(root).get(feature)
            if d is None:
                return self._json({"error": "feature desconocida", "code": "not_found"}, 404)
            try:
                e = approvals.record(root, feature, d, who, str(data.get("decision", "")), review(d), str(data.get("reason", "")),
                                     list(data.get("conditions") or []), data.get("delegate_to"), bool(data.get("override")), via="api")
            except approvals.PolicyError as err:
                status = {"forbidden": 403, "blocked": 409, "tampered": 409}.get(err.code, 400)
                return self._json({"error": str(err), "code": err.code}, status)
            return self._json({"entry": e, "status": approvals.status(root, feature, d).to_dict()}, 201)

        def _post_slack(self):
            if not slack_signing_secret:
                return self._json({"error": "Slack no está configurado (SLACK_SIGNING_SECRET)", "code": "not_configured"}, 503)
            raw = self._body()
            if raw is None:
                return
            if not slack.verify_signature(slack_signing_secret, self.headers.get("X-Slack-Request-Timestamp", ""), raw,
                                          self.headers.get("X-Slack-Signature", "")):
                return self._json({"error": "firma inválida", "code": "unauthorized"}, 401)
            self._json(slack.handle_interaction(root, raw, discover_features(root), review))

        def do_POST(self):
            if not self._guard():
                return
            u = urlparse(self.path)
            if u.path == "/api/approvals":
                return self._post_approval()
            if u.path == "/api/slack/interact":
                return self._post_slack()
            if u.path != "/api/chat":
                return self._json({"error": "not found"}, 404)
            if (self.headers.get("Content-Type") or "").split(";")[0].strip() != "application/json":
                return self._json({"error": "Content-Type debe ser application/json", "code": "bad_request"}, 415)
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                n = -1
            if n <= 0 or n > MAX_BODY:
                return self._json({"error": "cuerpo ausente o demasiado grande", "code": "bad_request"}, 413 if n > MAX_BODY else 400)
            try:
                data = json.loads(self.rfile.read(n))
                messages = sanitize_messages(data.get("messages"))
            except (ValueError, AttributeError) as e:
                return self._json({"error": str(e), "code": "bad_request"}, 400)
            if llm is None or not hasattr(llm, "chat"):
                return self._json({"error": "El asistente no está configurado: iniciá el servidor con --llm anthropic "
                                            "(y ANTHROPIC_API_KEY) o --llm demo.", "code": "assistant_unavailable"}, 503)
            d = discover_features(root).get(str(data.get("feature", "")))
            if d is None:
                return self._json({"error": "feature desconocida", "code": "not_found"}, 404)
            focus = data.get("focus") if isinstance(data.get("focus"), dict) else None
            try:
                choice = choose(models if getattr(llm, "choosable", False) else (), getattr(llm, "model", None), data.get("model"), data.get("effort"))
            except ChoiceError as e:
                return self._json({"error": str(e), "code": "bad_request"}, 400)
            sources = {n_: (d / n_).read_text(encoding="utf-8") for n_ in SOURCE_FILES if (d / n_).is_file()}
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()

            def emit(obj):
                self.wfile.write(b"data: " + json.dumps(obj, ensure_ascii=False).encode() + b"\n\n")
                self.wfile.flush()
            try:
                for chunk in stream_reply(llm, review(d), sources, messages, focus, **(choice.kwargs() if choice else {})):
                    emit({"delta": chunk})
                emit({"done": True})
            except (BrokenPipeError, ConnectionResetError):
                pass                                                  # client navigated away
            except Exception as e:                                    # never leak internals/keys to the browser
                try:
                    emit({"error": f"El proveedor del modelo falló ({type(e).__name__})."})
                except OSError:
                    pass

        def do_GET(self):
            if not self._guard():
                return
            u = urlparse(self.path)
            qs = parse_qs(u.query)
            if u.path == "/api/rules":
                from .rules import QUESTIONS, rules_as_dicts
                return self._json({"questions": QUESTIONS, "rules": rules_as_dicts()})
            if u.path == "/api/assistant":
                ok = llm is not None and hasattr(llm, "chat")
                choices = offered(models, getattr(llm, "model", None)) if ok and getattr(llm, "choosable", False) else []
                return self._json({"available": ok, "provider": getattr(llm, "provider", None) if ok else None,
                                   "model": getattr(llm, "model", None) if ok else None,
                                   "demo": bool(getattr(llm, "demo", False)) if ok else False,
                                   **({"models": choices} if choices else {})})
            if u.path == "/api/product":
                from .product import product_report
                rep = product_report(root, discover_features(root))
                return self._json([{"repo": "local", "report": rep}] if rep else [])
            if u.path == "/api/me":
                who = self._member()
                return self._json({"authenticated": who is not None, "member": who.public() if who else None,
                                   "can_approve": bool(who and who.can_approve), "members_configured": bool(members.list_members(root))})
            if u.path == "/api/members":
                return self._json([m.public() | {"email": ""} for m in members.list_members(root)])      # names and roles; never emails or tokens
            if u.path == "/api/approvals":
                fid = (qs.get("feature") or [""])[0]
                if fid:
                    d = self._feature(qs)
                    if d is None:
                        return self._json({"error": "feature desconocida", "code": "not_found"}, 404)
                    return self._json({"history": approvals.history(root, fid), "status": approvals.status(root, fid, d).to_dict()})
                return self._json({"history": approvals.history(root)[:100], "verify": approvals.verify(root)})
            if u.path in ("/api/ledger", "/api/ledger/history"):
                from . import ledger
                try:
                    if u.path == "/api/ledger":
                        return self._json(ledger.build(root))
                    return self._json(ledger.history(root, (qs.get("ref") or [""])[0]))
                except ValueError as e:
                    return self._json({"error": str(e), "code": "bad_request"}, 400)
            if u.path == "/api/approvals/verify":
                return self._json(approvals.verify(root))
            if u.path == "/api/features":
                out = []
                for fid, d in discover_features(root).items():
                    rep = review(d)
                    out.append({"id": fid, "feature": fid, "summary": rep["summary"]})
                return self._json(out)
            if u.path in ("/api/review", "/api/sources"):
                d = self._feature(qs)
                if d is None:
                    return self._json({"error": "feature desconocida"}, 404)
                if u.path == "/api/sources":
                    return self._json({n: (d / n).read_text(encoding="utf-8") for n in SOURCE_FILES if (d / n).is_file()})
                return self._json(review(d))
            return self._static(u.path)

        def _static(self, path: str):
            if static_dir is None:
                return self._json({"error": "not found"}, 404)
            rel = path.lstrip("/") or "index.html"
            target = (static_dir / rel).resolve()
            if static_dir.resolve() not in target.parents and target != static_dir.resolve():
                return self._json({"error": "not found"}, 404)
            if not target.is_file():
                target = static_dir / "index.html"            # SPA fallback
                if not target.is_file():
                    return self._json({"error": "not found"}, 404)
            body = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def make_server(root: Path, host: str = "127.0.0.1", port: int = 8765, static_dir: Path | None = None, llm=None,
                judge: bool = False, allow_hosts: set[str] | None = None, slack_signing_secret: str | None = None,
                models: tuple[str, ...] = ()):
    allowed = ({host} if host not in ("0.0.0.0", "::") else set()) | (allow_hosts or set())
    return ThreadingHTTPServer((host, port), make_handler(root, static_dir, llm, judge, allowed, slack_signing_secret, models))


def default_static_dir() -> Path | None:
    for cand in (Path(__file__).resolve().parents[2] / "web" / "dist", ):
        if (cand / "index.html").is_file():
            return cand
    return None
