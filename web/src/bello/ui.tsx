import { useState } from "react";
import { Award, Bot, Code2, Cpu, Landmark, Copy, Check } from "lucide-react";
import { Avatar } from "../shell/ui";
import { KIND_LABEL, STATUS_LABEL, person, type RuleKind, type Status } from "./data";
import { short } from "./hash";

export function StatusDot({ status, size = 10 }: { status: Status; size?: number }) {
  return <span className={`bl-dot s-${status}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`bl-badge s-${status}`}>
      <StatusDot status={status} size={8} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const KIND_ICON: Record<RuleKind, typeof Award> = { certification: Award, regulation: Landmark, native: Cpu, bello: Code2 };

export function KindBadge({ kind }: { kind: RuleKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={`bl-kind k-${kind}`}>
      <Icon size={12} aria-hidden="true" />
      {KIND_LABEL[kind]}
    </span>
  );
}

export function KindIcon({ kind, size = 16 }: { kind: RuleKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={`bl-kind-ico k-${kind}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

export function PersonChip({ id, showRole = true, size = 22 }: { id: string; showRole?: boolean; size?: number }) {
  const p = person(id);
  return (
    <span className="bl-person">
      {p.bot ? (
        <span className="bl-bot" style={{ width: size, height: size }} aria-hidden="true">
          <Bot size={Math.round(size * 0.6)} />
        </span>
      ) : (
        <Avatar name={p.name} size={size} />
      )}
      <span className="bl-person-txt">
        <span className="bl-person-name">{p.name}</span>
        {showRole && (
          <span className="bl-person-role">
            {p.role} · {p.org}
          </span>
        )}
      </span>
    </span>
  );
}

export function HashChip({ hash, label = "SHA-256" }: { hash: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="bl-hash"
      title={hash}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(hash).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <span className="bl-hash-lbl">{label}</span>
      <code>{short(hash)}</code>
      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      <span className="sr-only">{copied ? "Copiado" : "Copiar hash completo"}</span>
    </button>
  );
}

export function Donut({ data, size = 148, stroke = 18, center, sub }: { data: { status: Status; value: number }[]; size?: number; stroke?: number; center: string; sub: string }) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${center} ${sub}`} className="bl-donut">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      {data
        .filter((d) => d.value > 0)
        .map((d) => {
          const len = (d.value / total) * c;
          const el = (
            <circle
              key={d.status}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={`var(--st-${d.status})`}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(len - 2, 0)} ${c - Math.max(len - 2, 0)}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
      <text x="50%" y="48%" textAnchor="middle" className="bl-donut-num">
        {center}
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="bl-donut-sub">
        {sub}
      </text>
    </svg>
  );
}

export function Ring({ value, size = 44, stroke = 5, status }: { value: number; size?: number; stroke?: number; status: Status }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}%`} className="bl-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`var(--st-${status})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="bl-ring-txt">
        {value}%
      </text>
    </svg>
  );
}

export function LineChart({ data, height = 140 }: { data: { week: string; value: number }[]; height?: number }) {
  const w = 420;
  const pad = 24;
  const max = 100;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${height - pad} L${x(0)},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="bl-line" role="img" aria-label={`Tendencia de verificación: de ${data[0].value}% a ${data[data.length - 1].value}%`}>
      <defs>
        <linearGradient id="bl-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--bl-brand)" stopOpacity=".35" />
          <stop offset="100%" stopColor="var(--bl-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} className="bl-grid" />
      ))}
      <path d={area} fill="url(#bl-area)" />
      <path d={line} fill="none" stroke="var(--bl-brand)" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.week}>
          <circle cx={x(i)} cy={y(d.value)} r="3.5" fill="var(--surface)" stroke="var(--bl-brand)" strokeWidth="2" />
          <text x={x(i)} y={height - 6} textAnchor="middle" className="bl-axis">
            {d.week}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Bar({ value, status }: { value: number; status: Status }) {
  return (
    <span className="bl-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${value}%`, background: `var(--st-${status})` }} />
    </span>
  );
}

export function StackBar({ data }: { data: { status: Status; value: number }[] }) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  return (
    <span className="bl-stack" aria-hidden="true">
      {data
        .filter((d) => d.value)
        .map((d) => (
          <span key={d.status} style={{ width: `${(d.value / total) * 100}%`, background: `var(--st-${d.status})` }} />
        ))}
    </span>
  );
}

export const statusFromPct = (pct: number): Status => (pct >= 90 ? "verified" : pct >= 70 ? "progress" : pct >= 50 ? "risk" : "failing");
