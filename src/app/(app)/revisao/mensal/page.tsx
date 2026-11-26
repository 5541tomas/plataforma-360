import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { eur, krProgress } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { AREAS } from "@/lib/areas";
import { saveLifeReview } from "./actions";
import { ScoreRange } from "@/components/ScoreRange";

type Review = { month: string; scores: Record<string, number>; wins: string | null; lessons: string | null; focus_area: string | null; focus: string | null };

function Radar({ cur, prev }: { cur: Record<string, number>; prev?: Record<string, number> }) {
  const cx = 150, cy = 150, R = 110, n = AREAS.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + Math.cos(a) * R * (v / 10), cy + Math.sin(a) * R * (v / 10)]; };
  const poly = (s: Record<string, number>) => AREAS.map((a, i) => pt(i, s[a] ?? 0).map((x) => x.toFixed(1)).join(",")).join(" ");
  return (
    <svg role="img" aria-label={`Roda da vida: ${AREAS.map((a) => `${a} ${cur[a] ?? "—"}`).join(", ")}`} viewBox="0 0 300 300" className="mx-auto w-full max-w-[320px]">
      {[2, 4, 6, 8, 10].map((v) => <polygon key={v} points={AREAS.map((_, i) => pt(i, v).join(",")).join(" ")} fill="none" stroke="#EDEDF0" />)}
      {AREAS.map((_, i) => { const [x, y] = pt(i, 10); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#EDEDF0" />; })}
      {prev && <polygon points={poly(prev)} fill="none" stroke="#AEAEB2" strokeWidth="1.5" strokeDasharray="4 4" />}
      <polygon points={poly(cur)} fill="#0071E3" fillOpacity="0.15" stroke="#0071E3" strokeWidth="2.5" />
      {AREAS.map((a, i) => { const [x, y] = pt(i, 12.4); return <text key={a} x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="#3A3A3C">{a} {cur[a] ?? ""}</text>; })}
    </svg>
  );
}

export default async function RevisaoMensal({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const now = new Date();
  const key = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : now.toISOString().slice(0, 7);
  const month = `${key}-01`;
  const [y, mo] = key.split("-").map(Number);
  const prevKey = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7), nextKey = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const label = new Date(`${month}T00:00:00Z`).toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "UTC" });
  const supabase = await createClient();
  const [{ data: reviews }, { data: krs }, { data: habits }, { data: logs }, { data: tx }] = await Promise.all([
    supabase.from("life_reviews").select("month, scores, wins, lessons, focus_area, focus").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).order("month", { ascending: false }).limit(12),
    ctx.perms.goals !== "none" ? supabase.from("v_key_results").select("start_value, target_value, computed_value, goals!inner(area, status)").eq("org_id", ctx.org.id) : Promise.resolve({ data: [] }),
    supabase.from("habits").select("id, name, target_per_week").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("archived", false),
    supabase.from("habit_logs").select("habit_id, day").gte("day", month).lte("day", end),
    ctx.perms.finance !== "none" ? supabase.from("transactions").select("amount, is_transfer").eq("org_id", ctx.org.id).gte("date", month).lte("date", end) : Promise.resolve({ data: [] }),
  ]);
  const all = (reviews ?? []) as Review[];
  const cur = all.find((r) => r.month === month);
  const prev = all.find((r) => r.month < month);
  const scores = cur?.scores ?? prev?.scores ?? Object.fromEntries(AREAS.map((a) => [a, 5]));

  // Dados do mês para ajudar a pontuar
  const byArea = new Map<string, number[]>();
  ((krs ?? []) as unknown as { start_value: number; target_value: number; computed_value: number; goals: { area: string; status: string } }[])
    .filter((k) => k.goals.status === "active").forEach((k) => byArea.set(k.goals.area, [...(byArea.get(k.goals.area) ?? []), krProgress(k.start_value, k.target_value, k.computed_value)]));
  const weeks = 4.3;
  const habitPct = (habits ?? []).length ? Math.round(((habits ?? []).reduce((s, h) => s + Math.min(1, (logs ?? []).filter((l) => l.habit_id === h.id).length / (h.target_per_week * weeks)), 0) / habits!.length) * 100) : null;
  const txs = (tx ?? []) as { amount: number; is_transfer: boolean }[];
  const net = txs.filter((t) => !t.is_transfer).reduce((s, t) => s + Number(t.amount), 0);
  const history = all.filter((r) => r.month <= month).slice(0, 6).reverse();

  return (
    <>
      <PageHeader eyebrow="Revisão mensal" title={`A tua vida em ${label}`}>
        <Link href={`/revisao/mensal?m=${prevKey}`} className="btn-ghost" aria-label="Mês anterior">‹</Link>
        {key < now.toISOString().slice(0, 7) && <Link href={`/revisao/mensal?m=${nextKey}`} className="btn-ghost" aria-label="Mês seguinte">›</Link>}
      </PageHeader>
      <p className="-mt-3 text-sm text-muted">Uma vez por mês: dá uma nota de 1 a 10 a cada área, regista o que correu bem e escolhe um foco para o mês seguinte.</p>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-2">
          <div className="flex items-baseline justify-between"><h2 className="h2">Roda da vida</h2>{prev && <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3.5 border-t-2 border-dashed border-[#AEAEB2]" />mês anterior</span>}</div>
          <Radar cur={scores} prev={cur ? prev?.scores : undefined} />
          {!cur && <p className="text-center text-xs text-muted">{prev ? "A mostrar as notas do mês anterior — atualiza e guarda." : "Ainda sem revisão — dá as tuas notas ao lado."}</p>}
        </div>

        <form action={saveLifeReview} className="card flex flex-col gap-4">
          <input type="hidden" name="month" value={month} />
          <h2 className="h2">As tuas notas</h2>
          <div className="flex flex-col gap-3">
            {AREAS.map((a) => {
              const hint = a === "Finanças" && txs.length ? `saldo do mês ${net >= 0 ? "+" : ""}${eur(net)}` : byArea.get(a)?.length ? `objetivos a ${Math.round(byArea.get(a)!.reduce((s, x) => s + x, 0) / byArea.get(a)!.length)}%` : a === "Saúde" && habitPct !== null ? `hábitos a ${habitPct}%` : "";
              return (
                <div key={a} className="grid grid-cols-[110px_1fr_36px] items-center gap-3">
                  <span className="text-sm">{a}{hint && <span className="block text-[11px] text-muted">{hint}</span>}</span>
                  <ScoreRange name={`s_${a}`} label={`Nota para ${a}`} initial={scores[a] ?? 5} />
                </div>
              );
            })}
          </div>
          <label className="flex flex-col gap-1.5"><span className="label">O que correu bem este mês</span><textarea name="wins" rows={2} defaultValue={cur?.wins ?? ""} className="input py-2.5" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">O que aprendi / faria diferente</span><textarea name="lessons" rows={2} defaultValue={cur?.lessons ?? ""} className="input py-2.5" /></label>
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <label className="flex flex-col gap-1.5"><span className="label">Área de foco</span><select name="focus_area" defaultValue={cur?.focus_area ?? AREAS.reduce((min, a) => ((scores[a] ?? 5) < (scores[min] ?? 5) ? a : min), AREAS[0] as string)} className="input">{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
            <label className="flex flex-col gap-1.5"><span className="label">Foco para o próximo mês</span><input name="focus" defaultValue={cur?.focus ?? ""} placeholder="Ex.: treinar 3× por semana" className="input" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="as_task" defaultChecked={!cur} className="h-4 w-4" /> Criar tarefa com o foco do mês</label>
          <button className="btn self-start">Guardar revisão</button>
        </form>
      </section>

      {history.length > 1 && (
        <section className="card flex flex-col gap-3">
          <h2 className="h2">Evolução</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1.5 font-medium">Área</th>{history.map((r) => <th key={r.month} className="py-1.5 text-center font-medium">{new Date(r.month).toLocaleDateString("pt-PT", { month: "short" }).replace(".", "")}</th>)}</tr></thead>
              <tbody>{AREAS.map((a) => (
                <tr key={a} className="border-t border-line"><td className="py-2">{a}</td>
                  {history.map((r) => { const v = r.scores[a]; return <td key={r.month} className="py-2 text-center"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold" style={{ background: v ? `rgba(0,113,227,${0.08 + v * 0.06})` : "#F2F2F5", color: v && v >= 7 ? "#fff" : "#1D1D1F" }}>{v ?? "—"}</span></td>; })}</tr>
              ))}</tbody>
            </table>
          </div>
          {history.filter((r) => r.focus).slice(-3).map((r) => <p key={r.month} className="text-xs text-muted"><span className="font-medium text-ink-2">{new Date(r.month).toLocaleDateString("pt-PT", { month: "long" })}:</span> foco em {r.focus_area} — {r.focus}</p>)}
        </section>
      )}
    </>
  );
}
