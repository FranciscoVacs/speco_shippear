"""Spec 016 · the second door: an idea with no code, its questions one at a time, the decisions kept, and the brief to paste."""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pytest
from cluster_fixture import pg  # noqa: F401  (session fixture)

for mod in ("fastapi", "psycopg", "httpx", "jwt", "cryptography"):
    pytest.importorskip(mod)
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cloud"))

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from speco_cloud import interview  # noqa: E402
from speco_cloud.app import create_app  # noqa: E402
from speco_cloud.config import Settings  # noqa: E402

JWT_SECRET = "j" * 40
FOUNDER, MEMBER, VIEWER, OUTSIDER = ("70000000-0000-0000-0000-00000000000%d" % i for i in (1, 2, 3, 4))
NEED = "Quiero que los clientes puedan cobrar rápido por email y recibir un aviso"


def token(user: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"sub": user, "aud": "authenticated", "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")}


@pytest.fixture(scope="module")
def env(pg):
    pg.psql("".join(f"insert into auth.users (id, email) values ('{u}', '{n}@example.com');" for u, n in ((FOUNDER, "founder"), (MEMBER, "mia"), (VIEWER, "vic"), (OUTSIDER, "out"))))
    org = pg.rows("select public.create_organization('Idea Co', 'idea-co');", FOUNDER)[0]
    other = pg.rows("select public.create_organization('Other Idea Co', 'other-idea-co');", OUTSIDER)[0]
    pg.psql(f"insert into public.memberships (org_id, user_id, role) values ('{org}', '{MEMBER}', 'member'), ('{org}', '{VIEWER}', 'viewer');", "service")
    settings = Settings(database_url=f"host={pg.sock} dbname=speco user=postgres", github_webhook_secret="x", supabase_jwt_secret=JWT_SECRET, state_secret="s" * 32, app_url="https://app.test")
    return type("Env", (), {"pg": pg, "client": TestClient(create_app(settings)), "org": org, "other": other})


def new(env, user=FOUNDER, need=NEED, lang="es"):
    return env.client.post(f"/api/orgs/{env.org}/ideas", json={"need": need, "lang": lang}, headers=token(user))


def say(env, idea, question, text="", unknown=False, user=FOUNDER):
    return env.client.post(f"/api/orgs/{env.org}/ideas/{idea}/answers", json={"question": question, "text": text, "unknown": unknown}, headers=token(user))


def test_the_questions_depend_on_the_words_and_are_always_the_same_for_the_same_words():
    ids = [q["id"] for q in interview.questions_for(NEED)]
    assert ids[0] == "vague" and {"who", "limits", "money", "people", "notify", "fails", "clash", "verify"} >= set(ids) - {"vague"}
    assert ids == [q["id"] for q in interview.questions_for(NEED)] and len(ids) <= interview.MAX_QUESTIONS
    assert ids == ["vague", "who", "limits", "money", "fails", "clash", "verify"]       # too many for one sitting: the optional ones at the end go first
    plain = [q["id"] for q in interview.questions_for("Quiero un tablero de tareas")]
    assert plain == ["who", "limits", "fails", "clash", "verify"]
    assert "número" in interview.questions_for(NEED)[0]["ask"] and "rápido" not in interview.questions_for(NEED)[0]["ask"].lower().replace("«rápido»", "")


def test_nothing_a_person_reads_in_the_second_door_uses_technical_words():
    banned = re.compile(r"repositor|commit|pull request|requisit|requirement|\bspec\b|github|branch|token|\bapi\b|json|markdown", re.I)
    for lang in ("es", "en"):
        for need in (NEED, "I want customers to pay fast and get a notification by email, with user data"):
            idea = {"need": need, "lang": lang, "title": interview.title_of(need), "questions": interview.questions_for(need, lang), "answers": {}}
            texts = [q["ask"] + " " + q["example"] for q in idea["questions"]] + [interview.brief(idea)]
            for text in texts:
                assert not banned.search(text), text


def test_an_idea_needs_no_repository_and_keeps_the_words_of_the_person(env):
    r = new(env)
    assert r.status_code == 201
    idea = r.json()
    assert idea["need"] == NEED and idea["title"].startswith("Los clientes puedan cobrar") and idea["progress"]["total"] >= 5 and idea["progress"]["next"] == "vague"
    assert env.pg.rows(f"select count(*) from public.repositories where org_id = '{env.org}';", "service") == ["0"]
    assert [i["id"] for i in env.client.get(f"/api/orgs/{env.org}/ideas", headers=token(VIEWER)).json()] == [idea["id"]]       # a viewer reads it


def test_the_questions_are_answered_one_at_a_time_and_progress_follows(env):
    idea = new(env, need="Quiero un tablero de tareas").json()
    first = idea["progress"]["next"]
    r = say(env, idea["id"], first, "Solo quien administra el equipo")
    assert r.status_code == 200 and r.json()["progress"]["answered"] == 1 and r.json()["progress"]["next"] != first
    again = say(env, idea["id"], first, "Cualquiera del equipo")                        # changing one's mind replaces the answer
    assert again.json()["progress"]["answered"] == 1 and again.json()["answers"][first]["text"] == "Cualquiera del equipo"


def test_a_question_nobody_can_answer_stays_open_and_counts_as_a_risk(env):
    idea = new(env, need="Quiero un tablero de tareas").json()
    qs = [q["id"] for q in idea["questions"]]
    say(env, idea["id"], qs[0], "Solo quien administra")
    for q in qs[1:-1]:
        r = say(env, idea["id"], q, unknown=True)
    r = say(env, idea["id"], qs[-1], "Que el 95 % cargue en 2 segundos")
    got = r.json()
    assert got["progress"]["done"] is True and got["progress"]["unknown"] == len(qs) - 2
    assert got["spec"].count("[NEEDS CLARIFICATION") == len(qs) - 2                         # the spec says what is still open
    assert got["review"]["summary"]["warning"] >= 1 or got["review"]["summary"]["blocker"] >= 1 or got["review"]["verdict"] != "ready"
    assert "Lo que todavía no está decidido" in got["brief"] and "Solo quien administra" in got["brief"] and "No inventes reglas de negocio" in got["brief"]


def test_saying_i_do_not_know_to_everything_is_allowed_and_the_brief_says_nothing_is_decided(env):
    idea = new(env, need="Quiero un tablero de tareas").json()
    for q in idea["questions"]:
        r = say(env, idea["id"], q["id"], unknown=True)
    assert r.json()["progress"]["answered"] == 0 and "(nada todavía)" in r.json()["brief"]


def test_an_empty_answer_or_a_made_up_question_is_refused(env):
    idea = new(env, need="Quiero un tablero de tareas").json()
    assert say(env, idea["id"], idea["progress"]["next"], "   ").status_code == 422
    assert say(env, idea["id"], "nope", "x").status_code == 422
    assert say(env, idea["id"], idea["progress"]["next"], "x" * 1100).status_code == 422
    assert new(env, need="   ").status_code == 422


def test_the_second_door_speaks_english_when_asked(env):
    idea = new(env, need="I want customers to pay fast", lang="en").json()
    assert idea["questions"][0]["ask"].startswith("“fast”") and "What I want to build" in idea["brief"]


def test_only_members_who_are_people_write_and_other_companies_see_nothing(env):
    assert new(env, VIEWER).status_code == 403
    idea = new(env, MEMBER).json()                                                       # a plain member may
    assert say(env, idea["id"], idea["progress"]["next"], "ok", user=VIEWER).status_code == 403
    assert say(env, idea["id"], idea["progress"]["next"], "ok", user=OUTSIDER).status_code == 404
    assert env.client.get(f"/api/orgs/{env.org}/ideas/{idea['id']}", headers=token(OUTSIDER)).status_code == 404
    assert env.client.get(f"/api/orgs/{env.other}/ideas", headers=token(OUTSIDER)).json() == []
    assert env.client.get(f"/api/orgs/{env.org}/ideas/not-a-uuid", headers=token(FOUNDER)).status_code == 404


def test_an_agent_token_cannot_write_an_idea(env):
    err = env.pg.fails(f"insert into public.ideas (org_id, created_by, title, need, questions) values ('{env.org}', '{FOUNDER}', 't', 'n', '[]');", FOUNDER, client_id="agent-1")
    assert "row-level security" in err
    idea = new(env).json()
    env.pg.psql(f"update public.ideas set answers = '{{\"x\": 1}}' where id = '{idea['id']}';", FOUNDER, client_id="agent-1")      # filtered out: nothing changes
    assert env.pg.rows(f"select answers::text from public.ideas where id = '{idea['id']}';", "service") == ["{}"]
