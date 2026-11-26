export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-soft overflow-hidden ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: "good" | "warn" }) {
  const toneCls = tone === "good" ? "text-good font-medium" : tone === "warn" ? "text-warn font-medium" : "text-muted";
  return (
    <div className="card flex flex-col gap-2.5 !p-[22px]">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className="text-[30px] font-bold tracking-[-0.8px] leading-tight">{value}</div>
      {hint && <div className={`text-[13px] ${toneCls}`}>{hint}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {eyebrow && <div className="text-[13px] font-medium uppercase tracking-[0.6px] text-muted">{eyebrow}</div>}
        <h1 className="text-[34px] font-bold tracking-[-0.8px] leading-tight">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

/** Formulário "abrir/fechar" sem JavaScript, via <details> */
export function Disclosure({ label, children, primary = false, open = false }: { label: string; children: React.ReactNode; primary?: boolean; open?: boolean }) {
  return (
    <details className="group relative" open={open || undefined}>
      <summary className={`${primary ? "btn" : "btn-ghost"} list-none cursor-pointer [&::-webkit-details-marker]:hidden`}>{label}</summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,380px)] card !p-5 shadow-xl border border-line">{children}</div>
    </details>
  );
}
