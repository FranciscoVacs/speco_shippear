// The first screen of a company with nothing in it (spec 016, FR-001): one plain question that sends the person to one of two doors.
import { Link } from "react-router-dom";
import { Code2, Lightbulb } from "lucide-react";
import { useT } from "../i18n";

export function Welcome() {
  const t = useT();
  return (
    <div className="page page-welcome">
      <div className="welcome">
        <h1>{t("welcome.title")}</h1>
        <p className="muted">{t("welcome.desc")}</p>
        <div className="welcome-doors">
          <Link className="card welcome-door" to="/connect">
            <Code2 size={20} aria-hidden="true" />
            <strong>{t("welcome.haveTitle")}</strong>
            <span className="muted">{t("welcome.haveBody")}</span>
          </Link>
          <Link className="card welcome-door" to="/ideas">
            <Lightbulb size={20} aria-hidden="true" />
            <strong>{t("welcome.ideaTitle")}</strong>
            <span className="muted">{t("welcome.ideaBody")}</span>
          </Link>
        </div>
        <p className="muted small">{t("welcome.switch")}</p>
      </div>
    </div>
  );
}
