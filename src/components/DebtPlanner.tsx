"use client";
import { useMemo, useState } from "react";

type D = { id: string; name: string; remaining: number; payment: number };
const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const monthLabel = (offset: number) => { const d = new Date(); d.setMonth(d.getMonth() + offset, 1); return d.toLocaleDateString("pt-PT", { month: "short", year: "numeric" }).replace(".", ""); };

/** Simula meses até liquidar. snowball: prestações libertadas e o extra vão para a dívida mais pequena. */
function simulate(debts: D[], extra: number, snowball: boolean) {
  const bal = new Map(debts.map((d) => [d.id, d.remaining]));
  const paidOff = new Map<string, number>();
  for (let m = 1; m <= 600 && [...bal.values()].some((v) => v > 0.005); m++) {
    let pool = snowball ? extra : 0;
    for (const d of debts) {
      const b = bal.get(d.id)!;
      if (b <= 0.005) { if (snowball) pool += d.payment; continue; }
      const pay = Math.min(b, d.payment);
      bal.set(d.id, b - pay);
      if (snowball) pool += d.payment - pay;
    }
    if (snowball) {
      const order = debts.filter((d) => bal.get(d.id)! > 0.005).sort((a, b) => bal.get(a.id)! - bal.get(b.id)!);
      for (const d of order) { if (pool <= 0) break; const b = bal.get(d.id)!; const pay = Math.min(b, pool); bal.set(d.id, b - pay); pool -= pay; }
    }
    for (const d of debts) if (bal.get(d.id)! <= 0.005 && !paidOff.has(d.id)) paidOff.set(d.id, m);
  }
  return { months: Math.max(0, ...paidOff.values()), paidOff };
}

export function DebtPlanner({ debts }: { debts: D[] }) {
  const [extra, setExtra] = useState(100);
  const valid = debts.filter((d) => d.remaining > 0 && d.payment > 0);
  const base = useMemo(() => simulate(valid, 0, false), [valid]);
  const plan = useMemo(() => simulate(valid, extra, true), [valid, extra]);
  if (valid.length === 0) return <p className="text-sm text-muted">Completa a prestação mensal das dívidas para simular.</p>;
  const saved = base.months - plan.months;
  const order = [...valid].sort((a, b) => (plan.paidOff.get(a.id) ?? 0) - (plan.paidOff.get(b.id) ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm">Se pagar mais <strong className="font-semibold">{eur(extra)}</strong> por mês</span>
        <input type="range" min={0} max={1000} step={25} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="w-full accent-[#0071E3]" />
      </label>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        <div className="rounded-2xl bg-[#F7F7F9] p-4"><div className="text-xs text-muted">Só com as prestações</div><div className="text-lg font-bold first-letter:uppercase">{monthLabel(base.months)}</div><div className="text-xs text-muted">{base.months} meses</div></div>
        <div className="rounded-2xl bg-accent-soft p-4"><div className="text-xs text-accent-ink">Com o teu plano</div><div className="text-lg font-bold text-accent-ink first-letter:uppercase">{monthLabel(plan.months)}</div><div className="text-xs text-accent-ink">{plan.months} meses</div></div>
        <div className="rounded-2xl bg-good-soft p-4"><div className="text-xs text-[#1E6B30]">Ficas livre mais cedo</div><div className="text-lg font-bold text-[#1E6B30]">{saved > 0 ? `${saved} meses` : "—"}</div><div className="text-xs text-[#1E6B30]">{saved > 0 ? `${Math.floor(saved / 12) ? `${Math.floor(saved / 12)} ano(s) e ` : ""}${saved % 12} mês(es)` : "aumenta o extra"}</div></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted">Ordem recomendada (bola de neve)</span>
        {order.map((d, i) => (
          <div key={d.id} className="flex items-center gap-3 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
            <span className="flex-1">{d.name} <span className="text-xs text-muted">· {eur(d.remaining)}</span></span>
            <span className="text-ink-2 first-letter:uppercase">liquidada em {monthLabel(plan.paidOff.get(d.id) ?? 0)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Bola de neve: o extra vai para a dívida mais pequena; quando fica liquidada, a prestação dela passa para a seguinte. Sem juros no cálculo — com juros, poupas ainda mais. Antes de amortizar um crédito, confirma com o banco a comissão de amortização antecipada.</p>
    </div>
  );
}
