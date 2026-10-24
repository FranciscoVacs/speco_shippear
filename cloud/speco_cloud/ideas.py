"""Spec 016 · ideas of a company (the second door): create one from the person's own words, answer its questions one at a time, read it back
with its brief. Runs as the signed-in person: the database says who may write (never an agent) and who may read (the company's members)."""
from __future__ import annotations

import uuid

from psycopg.types.json import Jsonb

from . import interview, worker
from .decisions import Refused

MAX_ANSWER = 1000


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise Refused("idea not found", 404, "not_found") from None


def _summary(row: dict) -> dict:
    idea = dict(row)
    return {"id": str(row["id"]), "title": row["title"], "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat(), **interview.progress(idea)}


def create(conn, org_id: str, user: str, need: str, lang: str) -> dict:
    need = need.strip()
    if not need:
        raise Refused("contá qué querés construir, con tus palabras")
    questions = interview.questions_for(need, lang)
    row = conn.execute(
        "insert into public.ideas (org_id, created_by, title, need, lang, questions) values (%s, %s, %s, %s, %s, %s) returning id",
        (org_id, user, interview.title_of(need), need, lang, Jsonb(questions)),
    ).fetchone()
    return get(conn, org_id, str(row["id"]))


def list_all(conn, org_id: str) -> list[dict]:
    rows = conn.execute("select id, title, questions, answers, created_at, updated_at from public.ideas where org_id = %s order by created_at desc limit 100", (org_id,)).fetchall()
    return [_summary(r) for r in rows]


def get(conn, org_id: str, idea_id: str) -> dict:
    row = conn.execute("select * from public.ideas where id = %s and org_id = %s", (_uuid(idea_id), org_id)).fetchone()
    if not row:
        raise Refused("idea not found", 404, "not_found")
    idea = {**row, "id": str(row["id"])}
    review = worker.review_files({"specs/001-idea/spec.md": interview.spec_markdown(idea)})
    report = review[0]["report"] if review else None
    return {
        "id": idea["id"], "title": idea["title"], "need": idea["need"], "lang": idea["lang"], "questions": idea["questions"], "answers": idea["answers"],
        "progress": interview.progress(idea), "brief": interview.brief(idea), "spec": interview.spec_markdown(idea),
        "review": {"verdict": report["decision"]["verdict"], "summary": report["summary"]} if report else None,
        "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat(),
    }


def answer(conn, org_id: str, idea_id: str, question: str, text: str, unknown: bool) -> dict:
    row = conn.execute("select questions from public.ideas where id = %s and org_id = %s", (_uuid(idea_id), org_id)).fetchone()
    if not row:
        raise Refused("idea not found", 404, "not_found")
    if question not in {q["id"] for q in row["questions"]}:
        raise Refused("esa pregunta no existe en esta idea")
    text = (text or "").strip()
    if not unknown and not text:
        raise Refused("escribí tu decisión, o decí que todavía no podés decidirla")
    if len(text) > MAX_ANSWER:
        raise Refused(f"la respuesta es demasiado larga (máximo {MAX_ANSWER} caracteres)")
    entry = {"state": "unknown", "text": ""} if unknown else {"state": "answered", "text": text}
    done = conn.execute(
        "update public.ideas set answers = answers || %s, updated_at = now() where id = %s and org_id = %s",      # merged in SQL: two answers at once both stay
        (Jsonb({question: entry}), idea_id, org_id),
    ).rowcount
    if not done:
        raise Refused("sólo quien es miembro y no es un agente puede responder", 403, "forbidden")
    return get(conn, org_id, idea_id)
