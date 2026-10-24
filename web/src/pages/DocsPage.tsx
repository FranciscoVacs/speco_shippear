// /docs: the product guide. `#guia-<section>` anchors keep working; `#guia-COV001` redirects to /rules/COV001.
import { Navigate, useLocation } from "react-router-dom";
import { Info } from "lucide-react";
import { Guide } from "../Guide";
import { useLang, useT } from "../i18n";

export default function DocsPage() {
  const t = useT();
  const { lang } = useLang();
  const loc = useLocation();
  const m = /^#guia(?:-([A-Za-z0-9-]+))?$/.exec(loc.hash);
  const token = m?.[1] ?? null;
  if (token && /^[a-z]{3}\d{3}$/i.test(token)) return <Navigate to={`/rules/${token.toUpperCase()}`} replace />;
  return (
    <div className="page page-docs">
      {lang === "en" && (
        <p className="content-note" role="note">
          <Info size={14} aria-hidden="true" /> {t("content.noteDocs")}
        </p>
      )}
      <Guide anchor={token} anchorTick={loc.key} />
    </div>
  );
}
