"""Spec 022 · the product metrics report (docs/27-metrics-playbook.md). Reads the `metrics` views and the capture tables as the service,
prints Markdown (or JSON). Run it on a schedule or by hand:

    DATABASE_URL=... python -m speco_cloud.metrics_report --month 2026-11 --usd-per-credit 0.04 -o report.md

Every ratio carries its sample size. Below MIN_N the number is printed but marked as not conclusive: with 12 companies a percentage is an anecdote.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import date, timedelta
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import _ROLE

MIN_N = 30                 # below this a ratio is an anecdote
ELLIS_THRESHOLD = 40.0     # % "very disappointed" that marks product-market fit (Sean Ellis)
ACTIVATION_MINUTES = 5     # G-7
TARGET_ACTIVATION = 40.0   # docs/24 §6


def month_bounds(month: str) -> tuple[date, date]:
    y, m = (int(x) for x in month.split("-"))
    start = date(y, m, 1)
    return start, (date(y + (m == 12), m % 12 + 1, 1))      # [start, end)


def _one(conn, sql: str, params: tuple = ()) -> dict:
    return conn.execute(sql, params).fetchone() or {}


def collect(conn: psycopg.Connection, month: str, usd_per_credit: float, sms_usd: float, arpa: float | None, margin: float) -> dict[str, Any]:
    start, end = month_bounds(month)
    d: dict[str, Any] = {"month": month, "start": start.isoformat(), "end": end.isoformat()}

    # ---- funnel and time to value, for the companies created in the month
    d["funnel"] = _one(conn, """
        select count(*) as signups,
               count(first_result_at) as activated,
               count(*) filter (where ttv_minutes <= %s) as activated_fast,
               count(*) filter (where was_referred) as referred,
               count(*) filter (where was_referred and first_result_at is not null) as referred_activated
          from metrics.org_facts where signed_up_at >= %s and signed_up_at < %s""", (ACTIVATION_MINUTES, start, end))
    d["ttv"] = _one(conn, """
        select count(*) as n, percentile_cont(0.5) within group (order by ttv_minutes) as p50, percentile_cont(0.9) within group (order by ttv_minutes) as p90
          from metrics.org_facts where signed_up_at >= %s and signed_up_at < %s and ttv_minutes is not null""", (start, end))
    d["by_segment"] = conn.execute("""
        select coalesce(door, 'unknown') as door, channel, count(*) as signups, count(first_result_at) as activated,
               count(*) filter (where ttv_minutes <= %s) as activated_fast
          from metrics.org_facts where signed_up_at >= %s and signed_up_at < %s group by 1, 2 order by signups desc, 1, 2""", (ACTIVATION_MINUTES, start, end)).fetchall()
    # habit only for companies whose 14 days after the first result are over
    d["habit"] = _one(conn, """
        select count(*) as matured, count(*) filter (where habit) as habit from metrics.org_facts
         where first_result_at is not null and first_result_at + interval '14 days' <= %s and signed_up_at < %s""", (end, end))

    # ---- retention: active in the n-th week after signing up, counting only weeks that are already over at the end of the month
    ret = {}
    for n in (1, 4):
        ret[f"w{n}"] = _one(conn, """
            select count(*) as base, count(*) filter (where exists (
                     select 1 from metrics.activity a where a.org_id = f.org_id
                        and a.day >= (f.signed_up_at at time zone 'UTC')::date + %s and a.day < (f.signed_up_at at time zone 'UTC')::date + %s)) as kept
              from metrics.org_facts f
             where (f.signed_up_at at time zone 'UTC')::date + %s <= %s and f.signed_up_at < %s""", (7 * n, 7 * n + 7, 7 * n + 7, end, end))
    d["retention"] = ret

    # ---- churn of companies: active in the 30 days before the last 30, and not at all in the last 30 (free plan: there is no cancellation to count)
    last30, prev30 = end - timedelta(days=30), end - timedelta(days=60)
    d["churn"] = _one(conn, """
        with base as (select distinct org_id from metrics.activity where day >= %s and day < %s)
        select count(*) as base, count(*) filter (where not exists (select 1 from metrics.activity a where a.org_id = base.org_id and a.day >= %s and a.day < %s)) as churned
          from base""", (prev30, last30, last30, end))
    d["active_30d"] = _one(conn, "select count(distinct org_id) as n from metrics.activity where day >= %s and day < %s", (last30, end))["n"]

    # ---- product-market fit: the Sean Ellis question, in the rounds that touch this month
    d["ellis"] = _one(conn, """
        select count(*) filter (where disappointed <> 'na') as n,
               count(*) filter (where disappointed = 'very') as very,
               count(*) filter (where disappointed = 'somewhat') as somewhat,
               count(*) filter (where disappointed = 'not') as not_
          from public.pmf_responses where created_at < %s""", (end,))

    # ---- money
    spend = _one(conn, "select coalesce(sum(amount_usd), 0) as usd from public.marketing_spend where month = %s", (start,))["usd"]
    credits = _one(conn, """
        select coalesce(sum(u.credits), 0) as c from metrics.model_use u join metrics.org_facts f on f.org_id = u.org_id
         where f.signed_up_at >= %s and f.signed_up_at < %s""", (start, end))["c"]
    signups, activated = d["funnel"]["signups"], d["funnel"]["activated"]
    sms, model = float(signups) * sms_usd, float(credits) * usd_per_credit
    total = float(spend) + sms + model
    d["cost"] = {"marketing_usd": float(spend), "sms_usd": sms, "model_usd": model, "total_usd": total,
                 "per_signup": total / signups if signups else None, "per_activated": total / activated if activated else None}
    churn_rate = d["churn"]["churned"] / d["churn"]["base"] if d["churn"]["base"] else None
    paying = _one(conn, "select count(*) as n from metrics.org_facts where plan <> 'hobby'")["n"]
    d["paying"] = paying
    d["upgrade_interest"] = _one(conn, "select count(distinct org_id) as n from public.upgrade_interest u where org_id in (select org_id from metrics.org_facts)")["n"]
    d["scenario"] = None
    if arpa and churn_rate and d["cost"]["per_activated"] is not None:
        ltv = arpa * margin / churn_rate
        d["scenario"] = {"arpa": arpa, "margin": margin, "churn": churn_rate, "ltv": ltv, "ltv_cac": ltv / d["cost"]["per_activated"] if d["cost"]["per_activated"] else None,
                         "payback_months": d["cost"]["per_activated"] / (arpa * margin)}
    return d


def collect_value(conn: psycopg.Connection, month: str, hours_low: float, hours_high: float, org_id: str | None = None) -> dict[str, Any]:
    """Spec 025 · what the reviews caught before code. `org_id` narrows it to one company (the report you hand that client)."""
    start, end = month_bounds(month)
    scope, p = ("and org_id = %s", (org_id,)) if org_id else ("", ())
    v: dict[str, Any] = {"month": month, "org_id": org_id, "hours_low": hours_low, "hours_high": hours_high}
    v["resolved"] = _one(conn, f"""
        select count(*) filter (where severity = 'blocker') as blockers,
               count(*) filter (where severity = 'warning') as warnings,
               count(*) filter (where severity = 'blocker' and rule like 'PRD%%') as decisions_protected,
               count(*) filter (where severity = 'blocker' and rule like 'CON%%') as contradictions,
               count(distinct feature_id) as features
          from metrics.finding_lifecycle where resolved_at >= %s and resolved_at < %s {scope}""", (start, end) + p)
    v["open_blockers"] = _one(conn, f"select count(*) as n from metrics.finding_lifecycle where resolved_at is null and severity = 'blocker' {scope}", p)["n"]
    v["outcomes"] = _one(conn, f"""
        select count(*) filter (where answer = 'yes') as yes, count(*) filter (where answer = 'probably') as probably, count(*) filter (where answer = 'no') as no
          from metrics.finding_lifecycle where resolved_at >= %s and resolved_at < %s and severity = 'blocker' and answer is not null {scope}""", (start, end) + p)
    # the trend of spec quality: blockers in the FIRST review of each feature, by the month that review happened (the last 4 months up to this one)
    v["trend"] = conn.execute(f"""
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*) as features, avg(blockers)::float as avg_blockers
          from metrics.first_reviews where created_at >= %s::date - interval '3 months' and created_at < %s {scope}
         group by 1 order by 1""", (start, end) + p).fetchall()
    o = v["outcomes"]
    answered = o["yes"] + o["probably"] + o["no"]
    weighted = o["yes"] + 0.5 * o["probably"]
    # only the blockers someone answered about count toward hours: an unanswered one is not evidence that it would have shipped
    v["hours"] = {"answered": answered, "weighted": weighted, "low": weighted * hours_low, "high": weighted * hours_high} if answered else None
    return v


# ------------------------------------------------------------------------------------------------ rendering
def ratio(num: int, den: int) -> str:
    if not den:
        return "— (sin datos)"
    flag = "" if den >= MIN_N else f" ⚠ n={den}, no concluyente"
    return f"{100 * num / den:.0f} % ({num}/{den}){flag}"


def usd(x: float | None) -> str:
    return "—" if x is None else f"{x:,.2f} USD"


def render(d: dict[str, Any]) -> str:
    f, t, e, c = d["funnel"], d["ttv"], d["ellis"], d["cost"]
    out = [f"# Métricas de producto · {d['month']}", "",
           f"> Generado desde la base. Período `{d['start']}` a `{d['end']}` (fin excluido). Los ratios con menos de {MIN_N} casos se marcan «no concluyente».", ""]

    out += ["## Embudo y activación", "",
            "| Etapa | Valor |", "|---|---|",
            f"| Empresas nuevas | {f['signups']} |",
            f"| Llegan a un primer resultado (cualquier momento) | {ratio(f['activated'], f['signups'])} |",
            f"| **Activación**: primer resultado en ≤ {ACTIVATION_MINUTES} min (meta {TARGET_ACTIVATION:.0f} %) | {ratio(f['activated_fast'], f['signups'])} |",
            f"| Hábito: 3 revisiones en 14 días (sólo empresas maduras) | {ratio(d['habit']['habit'], d['habit']['matured'])} |",
            f"| Llegaron por un referido | {f['referred']} (de ellas con primer resultado: {f['referred_activated']}) |",
            f"| Pidieron mejorar el plan (empresas, acumulado) | {d['upgrade_interest']} |", ""]

    out += ["## Tiempo a valor (TTV)", ""]
    if t["n"]:
        out += [f"Mediana **{t['p50']:.1f} min** · p90 {t['p90']:.1f} min (sobre {t['n']} empresas con resultado)" + ("" if t["n"] >= MIN_N else f" ⚠ n={t['n']}, no concluyente"), ""]
    else:
        out += ["Sin empresas con primer resultado en el período.", ""]

    out += ["## Por puerta y canal", ""]
    if d["by_segment"]:
        out += ["| Puerta | Canal | Altas | Con resultado | En ≤ 5 min |", "|---|---|---|---|---|"]
        out += [f"| {s['door']} | {s['channel']} | {s['signups']} | {s['activated']} | {s['activated_fast']} |" for s in d["by_segment"]]
    else:
        out += ["Sin altas."]
    out += [""]

    r1, r4, ch = d["retention"]["w1"], d["retention"]["w4"], d["churn"]
    out += ["## Retención y abandono", "",
            "| Medida | Valor |", "|---|---|",
            f"| Retención semana 1 (activa entre el día 7 y el 13 desde el alta) | {ratio(r1['kept'], r1['base'])} |",
            f"| Retención semana 4 (activa entre el día 28 y el 34) | {ratio(r4['kept'], r4['base'])} |",
            f"| Empresas activas en los últimos 30 días | {d['active_30d']} |",
            f"| **Abandono** mensual de empresas (activas el mes anterior, sin actividad en el último) | {ratio(ch['churned'], ch['base'])} |", "",
            "_Plan gratis: no hay cancelación que contar. «Abandono» es dejar de usarlo, y la actividad es una revisión, un trabajo terminado, una aprobación, una decisión o un uso del modelo._", ""]

    out += ["## Ajuste producto-mercado (test de Sean Ellis)", ""]
    if e["n"]:
        pct = 100 * e["very"] / e["n"]
        verdict = ("no concluyente: faltan respuestas" if e["n"] < MIN_N else ("señal de ajuste" if pct >= ELLIS_THRESHOLD else "todavía no hay ajuste"))
        out += [f"**{pct:.0f} % «muy decepcionado»** ({e['very']}/{e['n']}) · algo: {e['somewhat']} · nada: {e['not_']} · umbral {ELLIS_THRESHOLD:.0f} % → _{verdict}_", ""]
    else:
        out += ["Sin respuestas todavía.", ""]

    out += ["## Costo de adquisición (CAC) y valor de vida (LTV)", "",
            "| Concepto | Valor |", "|---|---|",
            f"| Marketing (cargado a mano en `marketing_spend`) | {usd(c['marketing_usd'])} |",
            f"| SMS de verificación (altas × costo supuesto) | {usd(c['sms_usd'])} |",
            f"| Modelo gastado por las empresas nuevas (créditos × precio supuesto) | {usd(c['model_usd'])} |",
            f"| **Total** | {usd(c['total_usd'])} |",
            f"| **CAC por empresa activada** | {usd(c['per_activated'])} |",
            f"| CAC por alta | {usd(c['per_signup'])} |",
            f"| Empresas con plan pago | {d['paying']} |", ""]
    s = d["scenario"]
    if s:
        out += [f"**LTV hipotético** con ARPA {usd(s['arpa'])}/mes, margen {100 * s['margin']:.0f} % y el abandono de arriba ({100 * s['churn']:.0f} %/mes): "
                f"LTV {usd(s['ltv'])} · LTV/CAC {s['ltv_cac']:.1f} · recupera el CAC en {s['payback_months']:.1f} meses.", "",
                "_Es un escenario, no un resultado: nadie paga todavía. Úselo para saber cuánto tendría que cobrar, no para informar ingresos._", ""]
    else:
        out += ["**LTV: no calculable** (no hay cobro ni abandono medido todavía). Pasar `--arpa` para ver el escenario «si cobrara X».", ""]
    if d.get("value"):
        out += [render_value(d["value"])]
    return "\n".join(out)


def render_value(v: dict[str, Any]) -> str:
    r, o, h = v["resolved"], v["outcomes"], v["hours"]
    who = f" · empresa `{v['org_id']}`" if v["org_id"] else ""
    out = [f"## Valor entregado: problemas atrapados antes de escribir código · {v['month']}{who}", "",
           "| Medida | Valor |", "|---|---|",
           f"| **Bloqueantes resueltos en la spec** | **{r['blockers']}** (en {r['features']} features) |",
           f"| Advertencias resueltas | {r['warnings']} |",
           f"| Decisiones previas protegidas (`PRD*`) | {r['decisions_protected']} |",
           f"| Contradicciones eliminadas (`CON*`) | {r['contradictions']} |",
           f"| Bloqueantes todavía abiertos | {v['open_blockers']} |", ""]
    if h:
        out += [f"Del cliente: de los bloqueantes resueltos, {h['answered']} fueron respondidos: **{o['yes']} habrían llegado a código**, {o['probably']} probablemente, {o['no']} no. "
                f"Ponderado (sí = 1, probablemente = 0,5): **{h['weighted']:.1f}** bloqueantes evitados.", "",
                f"**Retrabajo evitado, estimado: {h['low']:.0f} a {h['high']:.0f} horas** ({h['weighted']:.1f} × {v['hours_low']:g}–{v['hours_high']:g} h por bloqueante). "
                "_Las horas por bloqueante son un SUPUESTO (`--hours-low`/`--hours-high`): reemplazarlas por las del cliente. Los bloqueantes sin respuesta no suman horas._", ""]
    else:
        out += ["_Sin respuestas del cliente todavía: no se estiman horas. El conteo de arriba es lo único medido; si habría llegado a código lo dice quien lo arregló._", ""]
    out += ["### Calidad de las specs en el tiempo", "",
            "Bloqueantes promedio en la **primera** revisión de cada feature (si baja, el equipo aprende a escribir mejores specs).", ""]
    if v["trend"]:
        out += ["| Mes | Features | Bloqueantes promedio |", "|---|---|---|"]
        out += [f"| {t['month']} | {t['features']} | {t['avg_blockers']:.1f}{'' if t['features'] >= MIN_N else ' ⚠ no concluyente'} |" for t in v["trend"]]
    else:
        out += ["Sin revisiones en el período."]
    out += ["", "_«Resuelto»: apareció en una revisión de la feature y ya no está en la última. Un hallazgo que se saca por baseline o waiver puede contar como resuelto; si la feature se borra, no._", ""]
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="speco-metrics", description="Reporte de métricas de producto de Speco")
    today = date.today()
    p.add_argument("--month", default=f"{today.year}-{today.month:02d}", help="mes a reportar, YYYY-MM (por defecto el actual)")
    p.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    p.add_argument("--service-role", default=os.environ.get("SERVICE_ROLE", "service_role"))
    p.add_argument("--usd-per-credit", type=float, default=0.04, help="SUPUESTO: precio de un crédito (docs/24 §2); verificar con el precio vigente del modelo")
    p.add_argument("--sms-usd", type=float, default=0.05, help="SUPUESTO: costo de un SMS de verificación")
    p.add_argument("--arpa", type=float, help="ingreso mensual por empresa que se supone cobrar (para el escenario de LTV)")
    p.add_argument("--margin", type=float, default=0.8, help="margen bruto supuesto para el LTV")
    p.add_argument("--org", help="sólo la sección de valor entregado, de una empresa (el informe que se le entrega a ese cliente)")
    p.add_argument("--hours-low", type=float, default=4.0, help="SUPUESTO: horas de retrabajo que evita un bloqueante, cota baja")
    p.add_argument("--hours-high", type=float, default=16.0, help="SUPUESTO: horas de retrabajo que evita un bloqueante, cota alta")
    p.add_argument("--json", action="store_true", help="salida JSON en vez de Markdown")
    p.add_argument("-o", "--output", help="archivo de salida (por defecto, la terminal)")
    a = p.parse_args(argv)
    if not a.database_url:
        p.error("falta DATABASE_URL")
    if not _ROLE.match(a.service_role):
        p.error("rol de servicio inválido")
    if a.org:
        try:
            uuid.UUID(a.org)
        except ValueError:
            p.error("--org debe ser el uuid de una empresa")
    with psycopg.connect(a.database_url, row_factory=dict_row) as conn:
        with conn.transaction():
            conn.execute(f"set local role {a.service_role}")       # the same least-privilege role as the service (spec 013)
            if a.org:
                data, text = None, None
                value = collect_value(conn, a.month, a.hours_low, a.hours_high, a.org)
            else:
                data = collect(conn, a.month, a.usd_per_credit, a.sms_usd, a.arpa, a.margin)
                value = collect_value(conn, a.month, a.hours_low, a.hours_high)
    if a.org:
        text = json.dumps(value, indent=2, default=str) if a.json else render_value(value)
    else:
        data["value"] = value
        text = json.dumps(data, indent=2, default=str) if a.json else render(data)
    if a.output:
        with open(a.output, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    else:
        sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
