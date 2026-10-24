// Command palette (Ctrl/Cmd+K): pages, features, rules and actions. Keyboard: arrows, Enter, Esc; Tab stays inside (FR-013, FR-020).
import { cloudEnabled } from "../cloud/config";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, BookOpen, FileText, FolderGit2, Gavel, GaugeCircle, Home, Keyboard, Languages, ListChecks, LogOut, Moon, Search, Settings, Sparkles, Users, KeyRound, Plug, Bell, UserRound, Scale, ScrollText, CornerDownLeft, ShieldCheck, Terminal, Briefcase } from "lucide-react";
import { useT, useLang, type Key } from "../i18n";
import { useData } from "../DataContext";
import { isEmbedded } from "../data";
import { signOutEverywhere } from "../cloud/auth";
import { session } from "./session";
import { useTheme } from "./theme";
import { useUI } from "./UIContext";

type Group = "pages" | "features" | "rules" | "actions";
interface Item {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ICON = 15;

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const navigate = useNavigate();
  const { loader } = useData();
  const theme = useTheme();
  const ui = useUI();
  const embedded = isEmbedded();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const uid = useId().replace(/:/g, "");

  const all = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const pg = (id: string, key: Key, to: string, icon: ReactNode, hint?: Key): Item => ({ id: "p-" + id, group: "pages", label: t(key), hint: hint ? t(hint) : undefined, icon, run: go(to) });
    const pages: Item[] = embedded
      ? [pg("reviews", "nav.review", "/reviews", <ListChecks size={ICON} />), pg("rules", "nav.rules", "/rules", <Scale size={ICON} />), pg("docs", "nav.docs", "/docs", <BookOpen size={ICON} />), pg("developers", "dev.title", "/docs/developers", <Terminal size={ICON} />), pg("product-guide", "pm.title", "/docs/product", <Briefcase size={ICON} />)]
      : [
          pg("home", "nav.home", "/", <Home size={ICON} />),
          pg("decisions", "nav.decisions", "/decisions", <Gavel size={ICON} />),
          pg("ledger", "nav.ledger", "/ledger", <ScrollText size={ICON} />),
          pg("reviews", "nav.reviews", "/reviews", <ListChecks size={ICON} />),
          pg("portrait", "nav.portrait", "/portrait", <ShieldCheck size={ICON} />),
          ...(cloudEnabled() ? [pg("agents", "nav.agents", "/agents", <Bot size={ICON} />)] : []),
          pg("rules", "nav.rules", "/rules", <Scale size={ICON} />),
          pg("docs", "nav.docs", "/docs", <BookOpen size={ICON} />), pg("developers", "dev.title", "/docs/developers", <Terminal size={ICON} />), pg("product-guide", "pm.title", "/docs/product", <Briefcase size={ICON} />),
          pg("s-general", "settings.general", "/settings/general", <Settings size={ICON} />, "nav.settings"),
          pg("s-members", "settings.members", "/settings/members", <Users size={ICON} />, "nav.settings"),
          pg("s-keys", "settings.apiKeys", "/settings/api-keys", <KeyRound size={ICON} />, "nav.settings"),
          pg("s-int", "settings.integrations", "/settings/integrations", <Plug size={ICON} />, "nav.settings"),
          pg("s-usage", "settings.usage", "/settings/usage", <GaugeCircle size={ICON} />, "nav.settings"),
          pg("s-notif", "settings.notifications", "/settings/notifications", <Bell size={ICON} />, "nav.settings"),
          pg("s-profile", "settings.profile", "/settings/profile", <UserRound size={ICON} />, "nav.settings"),
        ];
    const features: Item[] = (loader?.features ?? []).map((f) => ({
      id: "f-" + f.id,
      group: "features",
      label: f.feature,
      hint: f.repo,
      icon: <FileText size={ICON} />,
      run: go(`/reviews/${encodeURIComponent(f.id)}`),
    }));
    const rules: Item[] = (loader?.rules?.rules ?? []).map((r) => ({
      id: "r-" + r.id,
      group: "rules",
      label: `${r.id} ${r.name}`,
      icon: <Scale size={ICON} />,
      run: go(`/rules/${r.id}`),
    }));
    const actions: Item[] = [
      { id: "a-theme", group: "actions", label: t("pal.toggleTheme"), icon: <Moon size={ICON} />, run: theme.toggle },
      { id: "a-lang", group: "actions", label: t("pal.switchLang"), icon: <Languages size={ICON} />, run: () => setLang(lang === "es" ? "en" : "es") },
      ...(embedded ? [] : [{ id: "a-connect", group: "actions" as const, label: t("connect.action"), icon: <FolderGit2 size={ICON} />, run: go("/connect") }]),
      { id: "a-intro", group: "actions", label: t("help.intro"), icon: <Sparkles size={ICON} />, run: ui.openOnboarding },
      { id: "a-keys", group: "actions", label: t("help.shortcuts"), icon: <Keyboard size={ICON} />, run: ui.openShortcuts },
    ];
    if (!embedded) {
      actions.push({
        id: "a-logout",
        group: "actions",
        label: t("user.logout"),
        icon: <LogOut size={ICON} />,
        run: () => {
          void signOutEverywhere();
          session.signOut();
          navigate("/signed-out");
        },
      });
    }
    return [...pages, ...features, ...rules, ...actions];
  }, [t, lang, setLang, navigate, loader, theme.toggle, embedded, ui.openOnboarding, ui.openShortcuts]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const cap = words.length ? 8 : 5;
    const out: Item[] = [];
    for (const g of ["pages", "features", "rules", "actions"] as Group[]) {
      const matches = all.filter((i) => i.group === g && words.every((w) => norm(`${i.label} ${i.hint ?? ""}`).includes(w)));
      out.push(...(g === "pages" || g === "actions" ? matches : matches.slice(0, cap)));
    }
    return out;
  }, [all, q]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      const o = openerRef.current;
      if (o && document.contains(o)) o.focus();
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`#pal-${uid}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, uid]);

  const run = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    // let the dialog unmount (and focus return) before navigating / opening another dialog
    window.setTimeout(i.run, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Home" && results.length) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && results.length) {
      e.preventDefault();
      setActive(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === "Tab") {
      e.preventDefault(); // focus trap: the input is the only tab stop
    }
  };

  const GROUP_LABEL: Record<Group, Key> = { pages: "pal.pages", features: "pal.features", rules: "pal.rules", actions: "pal.actions" };
  let idx = -1;
  const groups = (["pages", "features", "rules", "actions"] as Group[]).map((g) => ({ g, items: results.filter((r) => r.group === g) })).filter((x) => x.items.length);

  return (
    <div className="modal-backdrop pal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("pal.title")} onKeyDown={onKeyDown}>
        <div className="pal-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("pal.placeholder")}
            aria-label={t("pal.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls={`pal-list-${uid}`}
            aria-activedescendant={results.length ? `pal-${uid}-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={listRef} id={`pal-list-${uid}`} role="listbox" aria-label={t("pal.title")}>
          {results.length === 0 && (
            <div className="pal-empty" role="status">
              <strong>{t("pal.none")}</strong>
              <p>{t("pal.noneHint")}</p>
            </div>
          )}
          {groups.map(({ g, items }) => (
            <div key={g} role="group" aria-labelledby={`pal-g-${uid}-${g}`}>
              <div className="pal-group" id={`pal-g-${uid}-${g}`}>
                {t(GROUP_LABEL[g])}
              </div>
              {items.map((it) => {
                idx += 1;
                const n = idx;
                return (
                  <div
                    key={it.id}
                    id={`pal-${uid}-${n}`}
                    role="option"
                    aria-selected={n === active}
                    className={"pal-item" + (n === active ? " active" : "")}
                    onMouseMove={() => n !== active && setActive(n)}
                    onClick={() => run(it)}
                  >
                    <span className="pal-ico" aria-hidden="true">
                      {it.icon}
                    </span>
                    <span className="pal-label">{it.label}</span>
                    {it.hint && <span className="pal-hint">{it.hint}</span>}
                    {n === active && <CornerDownLeft size={13} className="pal-enter" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pal-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t("pal.navigate")}</span>
          <span><kbd>↵</kbd> {t("pal.open")}</span>
          <span><kbd>Esc</kbd> {t("pal.close")}</span>
        </div>
      </div>
    </div>
  );
}
