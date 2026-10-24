import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { useT } from "../i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="page">
      <div className="state help-state notfound" role="status">
        <span className="nf-ico" aria-hidden="true">
          <Compass size={22} />
        </span>
        <p className="nf-code">404</p>
        <h1>{t("notfound.title")}</h1>
        <p>{t("notfound.body")}</p>
        <div className="state-actions">
          <Link className="btn primary" to="/">
            {t("nav.home")}
          </Link>
          <Link className="btn" to="/reviews">
            {t("nav.reviews")}
          </Link>
          <Link className="btn" to="/docs">
            {t("nav.docs")}
          </Link>
        </div>
      </div>
    </div>
  );
}
