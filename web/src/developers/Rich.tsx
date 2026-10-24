// Tiny inline markup for the developer page copy: `code`, **bold**, *italic* and [label](href). Internal paths (/docs, /agents) use the router.
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (m) {
      const [, label, href] = m;
      return href.startsWith("/") ? (
        <Link key={i} to={href}>{label}</Link>
      ) : (
        <a key={i} href={href} target="_blank" rel="noreferrer">{label}</a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
  return <>{out}</>;
}
