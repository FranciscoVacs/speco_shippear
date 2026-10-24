// Progressive disclosure (spec 011): a section that is collapsed by default, says how much is inside it, opens in place,
// is operable from the keyboard, announces its state, and remembers the person's choice.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { storage } from "./storage";

const KEY = (id: string) => `sr-open-${id}`;

/** Open/closed state that survives a reload. `force` opens it for this view without overwriting the saved choice. */
export function useDisclosure(id: string, defaultOpen = false, force = false): [boolean, (v: boolean) => void] {
  const [saved, setSaved] = useState<boolean | null>(() => {
    const v = storage.get(KEY(id));
    return v === "1" ? true : v === "0" ? false : null;
  });
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [force]);
  const set = useCallback(
    (v: boolean) => {
      setSaved(v);
      if (!v) setDismissed(true);
      storage.set(KEY(id), v ? "1" : "0");
    },
    [id],
  );
  return [(force && !dismissed) || (saved ?? defaultOpen), set];
}

interface Props {
  id: string;
  title: string;
  /** what is inside, shown in the heading while collapsed ("3 hallazgos") */
  summary?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  level?: 2 | 3;
  children: ReactNode;
  className?: string;
}

export function Collapsible({ id, title, summary, open, onOpenChange, level = 2, children, className = "" }: Props) {
  const H = `h${level}` as "h2" | "h3";
  return (
    <section className={`disclosure ${open ? "is-open" : "is-closed"} ${className}`} aria-labelledby={`${id}-h`}>
      <H className="disclosure-h" id={`${id}-h`}>
        <button type="button" className="disclosure-btn" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => onOpenChange(!open)}>
          <ChevronRight size={16} className="disclosure-chev" aria-hidden="true" />
          <span className="disclosure-title">{title}</span>
          {summary && <span className="disclosure-sum">{summary}</span>}
        </button>
      </H>
      <div id={`${id}-body`} className="disclosure-body" hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
