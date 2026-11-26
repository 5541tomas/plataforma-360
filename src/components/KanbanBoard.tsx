"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveDealTo } from "@/app/(app)/crm/actions";

export type BoardDeal = {
  id: string; title: string; kind: "retainer" | "one_off"; value: number; stage_id: string; status: string;
  eff_probability: number; total_value: number; weighted_value: number; company_name: string | null;
  product_name: string | null; product_id: string | null; contact_name: string | null;
  expected_close: string | null; is_cooling: boolean; last_activity_at: string;
};
type Stage = { id: string; name: string; is_won: boolean; is_lost: boolean };

const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const short = (s: string) => new Date(s).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

export function KanbanBoard({ stages, deals, products, write }: { stages: Stage[]; deals: BoardDeal[]; products: { id: string; name: string }[]; write: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(deals);
  const [q, setQ] = useState("");
  const [prod, setProd] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [showLost, setShowLost] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setItems(deals), [deals]); // sincroniza depois de cada atualização do servidor

  const filtered = useMemo(() => items.filter((d) =>
    (!prod || d.product_id === prod) &&
    (!q || [d.title, d.company_name, d.contact_name, d.product_name].some((x) => x?.toLowerCase().includes(q.toLowerCase())))
  ), [items, q, prod]);
  const visible = stages.filter((s) => showLost || !s.is_lost);

  function move(dealId: string, stageId: string) {
    const d = items.find((x) => x.id === dealId);
    if (!d || d.stage_id === stageId) return;
    const st = stages.find((s) => s.id === stageId)!;
    setItems(items.map((x) => (x.id === dealId ? { ...x, stage_id: stageId, status: st.is_won ? "won" : st.is_lost ? "lost" : "open" } : x)));
    setError(null);
    start(async () => {
      const r = await moveDealTo(dealId, stageId);
      if (r && "error" in r && r.error) { setError(r.error); setItems(items); }
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="kq">Pesquisar negócios</label>
        <input id="kq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar negócio, empresa ou contacto…" className="input !w-auto flex-[1_1_240px]" />
        <label className="sr-only" htmlFor="kp">Produto</label>
        <select id="kp" value={prod} onChange={(e) => setProd(e.target.value)} className="input !w-auto">
          <option value="">Todos os produtos</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="seg" role="group" aria-label="Vista">
          <button type="button" onClick={() => setView("board")} aria-pressed={view === "board"} className={`rounded-[10px] px-4 min-h-[38px] text-[13px] ${view === "board" ? "bg-card font-semibold shadow-sm" : "text-muted"}`}>Quadro</button>
          <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={`rounded-[10px] px-4 min-h-[38px] text-[13px] ${view === "list" ? "bg-card font-semibold shadow-sm" : "text-muted"}`}>Lista</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} className="h-4 w-4" /> Mostrar perdidos</label>
      </div>
      {error && <p role="alert" className="text-sm text-warn">{error}</p>}
      {write && view === "board" && <p className="text-xs text-muted">Arrasta os cartões entre colunas para mudar de etapa.</p>}

      {view === "board" ? (
        <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(250px, 1fr))` }}>
            {visible.map((s) => {
              const col = filtered.filter((d) => d.stage_id === s.id);
              const v = col.reduce((a, d) => a + Number(d.total_value), 0);
              return (
                <section key={s.id} aria-label={s.name}
                  onDragOver={(e) => { if (write) { e.preventDefault(); setOver(s.id); } }}
                  onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("text/plain"), s.id); }}
                  className={`flex min-h-[420px] flex-col gap-2.5 rounded-[18px] p-3.5 transition ${over === s.id ? "bg-accent-soft ring-2 ring-accent/40" : s.is_won ? "bg-good-soft/60" : "bg-[#EBEBF0]"}`}>
                  <div className="flex items-center justify-between px-1.5 pb-1.5 pt-1">
                    <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{s.name}</h2><span className="text-xs text-muted">{col.length}</span></div>
                    <span className="text-xs font-semibold text-ink-2">{eur(v)}</span>
                  </div>
                  {col.length === 0 && <p className="px-1.5 text-xs text-muted">{write ? "Larga aqui um negócio." : "Sem negócios."}</p>}
                  {col.map((d) => (
                    <article key={d.id} draggable={write} onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                      className={`flex flex-col gap-2 rounded-[14px] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${write ? "cursor-grab active:cursor-grabbing" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/crm/${d.id}`} className="text-sm font-semibold hover:text-accent-ink">{d.title}</Link>
                          <div className="text-xs text-muted truncate">{[d.company_name, d.contact_name].filter(Boolean).join(" · ") || "—"}</div>
                        </div>
                        <span className={`chip ${d.kind === "retainer" ? "bg-accent-soft text-accent-ink" : "bg-warn-soft text-[#8F4300]"}`}>{d.kind === "retainer" ? "Avença" : "Pontual"}</span>
                      </div>
                      {d.product_name && <span className="text-[11px] text-ink-2">{d.product_name}</span>}
                      <div className="flex items-baseline justify-between">
                        <span className="text-[16px] font-bold tracking-[-0.3px]">{d.kind === "retainer" ? `${eur(d.value)}/mês` : eur(d.value)}</span>
                        <span className="text-xs text-muted">{d.eff_probability}%</span>
                      </div>
                      <div className="text-xs">
                        {d.is_cooling ? <span className="font-medium text-warn">A arrefecer · {short(d.last_activity_at)}</span>
                          : <span className="text-muted">{d.expected_close ? `Fecho ${short(d.expected_close)}` : "Sem data de fecho"}</span>}
                      </div>
                      {write && (
                        <label className="sr-only" htmlFor={`mv-${d.id}`}>Mover {d.title}</label>
                      )}
                      {write && (
                        <select id={`mv-${d.id}`} value={d.stage_id} onChange={(e) => move(d.id, e.target.value)} className="input !min-h-8 !py-0 !text-xs md:hidden">
                          {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                        </select>
                      )}
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#F7F7F9] text-left text-xs text-muted"><tr>
              <th className="px-4 py-2.5 font-medium">Negócio</th><th className="px-4 py-2.5 font-medium">Empresa</th><th className="px-4 py-2.5 font-medium">Produto</th>
              <th className="px-4 py-2.5 font-medium">Etapa</th><th className="px-4 py-2.5 text-right font-medium">Valor</th><th className="px-4 py-2.5 text-right font-medium">Ponderado</th><th className="px-4 py-2.5 font-medium">Fecho</th></tr></thead>
            <tbody>
              {filtered.filter((d) => showLost || d.status !== "lost").map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-4 py-2.5"><Link href={`/crm/${d.id}`} className="font-medium hover:text-accent-ink">{d.title}</Link>{d.is_cooling && <span className="ml-2 chip bg-warn-soft text-[#8F4300]">A arrefecer</span>}</td>
                  <td className="px-4 py-2.5 text-ink-2">{d.company_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{d.product_name ?? "—"}</td>
                  <td className="px-4 py-2.5">{stages.find((s) => s.id === d.stage_id)?.name}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{d.kind === "retainer" ? `${eur(d.value)}/mês` : eur(d.value)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{eur(d.weighted_value)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{d.expected_close ? short(d.expected_close) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted">Nenhum negócio corresponde aos filtros.</p>}
        </div>
      )}
    </div>
  );
}
