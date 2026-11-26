"use client";
import { useMemo, useState } from "react";

type Rec = { id: string; description: string; amount: number };
const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Cenários: e se perder uma avença / tiver um mês extra / subir o salário */
export function Scenario({ start, incomes, fixedOut, variableOut, salary }: { start: number; incomes: Rec[]; fixedOut: number; variableOut: number; salary: number }) {
  const [lost, setLost] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState(0);
  const [sal, setSal] = useState(Math.round(salary));
  const months = useMemo(() => {
    const inc = incomes.filter((r) => !lost[r.id]).reduce((s, r) => s + r.amount, 0);
    let bal = start; const out: { m: string; bal: number }[] = [];
    for (let i = 1; i <= 6; i++) {
      bal += inc + extra - fixedOut - variableOut - sal;
      const d = new Date(); d.setMonth(d.getMonth() + i, 1);
      out.push({ m: d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""), bal });
    }
    return out;
  }, [incomes, lost, extra, sal, start, fixedOut, variableOut]);
  const min = Math.min(0, ...months.map((x) => x.bal)), max = Math.max(start, ...months.map((x) => x.bal), 1);
  const firstNeg = months.find((x) => x.bal < 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-1">Receitas recorrentes (desmarca para simular a perda)</legend>
          {incomes.length === 0 && <span className="text-sm text-muted">Sem receitas recorrentes.</span>}
          {incomes.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={!lost[r.id]} onChange={(e) => setLost({ ...lost, [r.id]: !e.target.checked })} />{r.description} <span className="text-muted">{eur(r.amount)}/mês</span></label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5"><span className="label">Faturação extra por mês (projetos)</span><input type="number" step="100" value={extra} onChange={(e) => setExtra(Number(e.target.value) || 0)} className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Salário (custo total para a empresa)</span><input type="number" step="100" value={sal} onChange={(e) => setSal(Number(e.target.value) || 0)} className="input" /></label>
      </div>
      <div role="img" aria-label="Projeção do saldo da empresa nos próximos 6 meses" className="flex h-40 items-end gap-3 border-b border-line">
        {months.map((x) => (
          <div key={x.m} className="flex h-full flex-1 flex-col justify-end">
            <div className={`rounded-t-md ${x.bal < 0 ? "bg-[#C25E00]" : "bg-accent"}`} style={{ height: `${Math.max(3, (Math.abs(x.bal) / (max - min)) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="-mt-2 flex gap-3">{months.map((x) => <div key={x.m} className="flex-1 text-center text-[11px] text-muted">{x.m}<div className={`font-medium ${x.bal < 0 ? "text-warn" : "text-ink-2"}`}>{eur(x.bal)}</div></div>)}</div>
      <p className={`rounded-xl px-4 py-3 text-sm ${firstNeg ? "bg-warn-soft text-[#8F4300]" : "bg-good-soft text-[#1E6B30]"}`}>
        {firstNeg ? `Neste cenário a tesouraria fica negativa em ${firstNeg.m}. Ajusta o salário ou garante faturação extra.` : `Neste cenário a empresa termina os 6 meses com ${eur(months[5].bal)}.`}
      </p>
    </div>
  );
}
