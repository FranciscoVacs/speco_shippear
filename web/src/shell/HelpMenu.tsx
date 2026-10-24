import { BookOpen, Briefcase, HelpCircle, Keyboard, LifeBuoy, ListChecks, Megaphone, Sparkles, Terminal } from "lucide-react";
import { useT } from "../i18n";
import { MenuItem, MenuLink, MenuSep, Popover } from "./ui";
import { useUI } from "./UIContext";
import { MILESTONES, activation, useActivation } from "../activation/store";

export function HelpMenu() {
  const t = useT();
  const ui = useUI();
  const act = useActivation();
  return (
    <Popover
      label={t("help.label")}
      placement="bottom-end"
      triggerRef={ui.helpRef}
      trigger={(p, open) => (
        <button {...p} type="button" className={"btn ghost help-trigger" + (open ? " on" : "")} data-testid="help-btn">
          <HelpCircle size={15} aria-hidden="true" /> <span className="hide-sm">{t("help.label")}</span>
        </button>
      )}
    >
      <MenuItem icon={<ListChecks size={15} />} onSelect={() => activation.reopen()} trailing={<span className="muted small">{act.done.length}/{MILESTONES.length}</span>}>
        {t("act.title")}
      </MenuItem>
      <MenuItem icon={<Sparkles size={15} />} onSelect={ui.openOnboarding}>
        {t("help.intro")}
      </MenuItem>
      <MenuLink to="/docs" icon={<BookOpen size={15} />}>
        {t("help.guide")}
      </MenuLink>
      <MenuLink to="/docs/developers" icon={<Terminal size={15} />}>
        {t("help.developers")}
      </MenuLink>
      <MenuLink to="/docs/product" icon={<Briefcase size={15} />}>
        {t("help.product")}
      </MenuLink>
      <MenuItem icon={<Keyboard size={15} />} onSelect={ui.openShortcuts} trailing={<span className="muted small">?</span>}>
        {t("help.shortcuts")}
      </MenuItem>
      <MenuItem icon={<Megaphone size={15} />} onSelect={ui.openChangelog}>
        {t("help.news")}
      </MenuItem>
      <MenuSep />
      <MenuItem icon={<LifeBuoy size={15} />} onSelect={ui.openSupport}>
        {t("help.support")}
      </MenuItem>
    </Popover>
  );
}
