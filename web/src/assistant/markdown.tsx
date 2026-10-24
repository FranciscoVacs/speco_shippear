import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "../CodeBlock";

// Small, safe Markdown renderer for assistant replies. It builds React elements only (never innerHTML), so raw HTML in a reply
// is shown as plain text; links are limited to http(s)/mailto. Tolerates partial input while streaming (an unclosed fence is code).

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([^\s*][\s\S]*?)\*\*|(?<![\w*])\*([^\s*][^*\n]*?)\*(?![\w*])|(?<![\w_])_([^\s_][^_\n]*?)_(?![\w_])|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  const re = new RegExp(INLINE.source, "g"); // own instance: the recursive calls below must not share lastIndex
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2] !== undefined) out.push(<code key={k}>{m[2].trim()}</code>);
    else if (m[3] !== undefined) out.push(<strong key={k}>{inline(m[3], k)}</strong>);
    else if (m[4] !== undefined || m[5] !== undefined) out.push(<em key={k}>{inline((m[4] ?? m[5]) as string, k)}</em>);
    else if (m[6] !== undefined) {
      const url = m[7];
      out.push(
        SAFE_URL.test(url) ? (
          <a key={k} href={url} target="_blank" rel="noopener noreferrer">
            {inline(m[6], k)}
          </a>
        ) : (
          <Fragment key={k}>{m[0]}</Fragment>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${k++}`;
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp("^\\s*" + fence[1][0] + "{" + fence[1].length + ",}\\s*$").test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (absent while streaming)
      blocks.push(<CodeBlock key={key} code={body.join("\n")} lang={fence[2] || undefined} />);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(
        <p key={key} className={`md-h md-h${Math.min(h[1].length, 4)}`} role="heading" aria-level={Math.min(h[1].length + 2, 6)}>
          {inline(h[2], key)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={key}>{inline(q.join("\n"), key)}</blockquote>);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key} className="table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} scope="col">
                    {inline(c, `${key}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) {
          items.push(m[3]);
          i++;
        } else if (m === null && /^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += "\n" + lines[i].trim(); // continuation line
          i++;
        } else break;
      }
      const L = ordered ? "ol" : "ul";
      blocks.push(
        <L key={key}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${key}l${j}`)}</li>
          ))}
        </L>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) para.push(lines[i++]);
    blocks.push(<p key={key}>{inline(para.join("\n"), key)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
