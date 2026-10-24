import type { ReactNode } from "react";
import { DemoLabel } from "../shell/ui";

export function PageHeader({ title, description, actions, demo = false }: { title: string; description?: string; actions?: ReactNode; demo?: boolean }) {
  return (
    <div className="page-head">
      <div className="ph-main">
        <h1>
          {title} {demo && <DemoLabel />}
        </h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
