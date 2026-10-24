import { useState } from "react";
import { useT } from "../../i18n";
import { currentTenant, session, useSession } from "../../shell/session";
import { useUI } from "../../shell/UIContext";
import { PageHeader } from "../PageHeader";

export default function General() {
  const s = useSession();
  const cur = currentTenant(s);
  // keyed by workspace so a switch resets the draft
  return <GeneralForm key={cur.id} id={cur.id} name={cur.name} slug={cur.slug} plan={cur.plan} />;
}

function GeneralForm({ id, name: n0, slug: s0, plan }: { id: string; name: string; slug: string; plan: string }) {
  const t = useT();
  const ui = useUI();
  const [name, setName] = useState(n0);
  const [slug, setSlug] = useState(s0);
  const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  const dirty = name.trim() !== n0 || slug !== s0;
  const valid = name.trim().length >= 2 && slugOk;
  return (
    <>
      <PageHeader title={t("settings.general")} description={t("general.desc")} demo />
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || !dirty) return;
          session.updateTenant(id, { name: name.trim(), slug });
          ui.toast(t("common.saved"));
        }}
      >
        <div className="card-body">
          <label className="field">
            <span>{t("general.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-invalid={name.trim().length < 2} />
          </label>
          <label className="field">
            <span>{t("general.slug")}</span>
            <div className="input-affix">
              <span className="affix muted">example.com/w/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-invalid={!slugOk} aria-describedby="slug-help" />
            </div>
            <small id="slug-help" className={slugOk ? "muted" : "err"}>
              {slugOk ? t("general.slugHelp") : t("general.slugBad")}
            </small>
          </label>
          <div className="field">
            <span>{t("general.plan")}</span>
            <div>
              <span className="plan-badge">{plan}</span>
            </div>
          </div>
        </div>
        <div className="card-foot">
          <span className="muted small">{t("demo.localOnly")}</span>
          <button type="submit" className="btn primary" disabled={!dirty || !valid}>
            {t("common.save")}
          </button>
        </div>
      </form>

      <section className="card danger-zone" aria-labelledby="dz">
        <div className="card-body">
          <h2 id="dz">{t("general.danger")}</h2>
          <p className="muted">{t("general.dangerBody")}</p>
          <button type="button" className="btn danger" disabled aria-describedby="dz-why">
            {t("general.delete")}
          </button>
          <p id="dz-why" className="muted small">
            {t("general.deleteWhy")}
          </p>
        </div>
      </section>
    </>
  );
}
