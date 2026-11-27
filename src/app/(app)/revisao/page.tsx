import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { weekBounds, weeklyData } from "@/lib/weekly";
import { eur, dateShort } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import { Empty, PageHeader } from "@/components/ui";
import { CoachButton } from "@/components/CoachButton";
import { WaIcon } from "@/components/WhatsAppMenu";
import { waLink } from "@/lib/whatsapp";
import { saveReviewNotes } from "./actions";

function Rich({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[15px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const parts = line.replace(/^#+\s*/, "").split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith("**") ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>);
        return /^\s*([-*•]|\d+\.)\s/.test(line) ? <p key={i} className="pl-4">{parts}</p> : <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

export default async function RevisaoPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const ctx = await getContext();
  const offset = Math.min(0, Number((await searchParams).s ?? 0) || 0);
  const { key, start, end } = weekBounds(offset);
  const supabase = await createClient();
  const [d, { data: review }, { data: me }] = await Promise.all([
    weeklyData(supabase, ctx, offset),
    supabase.from("weekly_reviews").select("ai_text, notes, created_at").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).eq("week_start", key).maybeSingle(),
    supabase.from("profiles").select("phone").eq("id", ctx.userId).maybeSingle(),
  ]);
  const last = new Date(end); last.setDate(last.getDate() - 1);
  const share = review?.ai_text ? `*Revisão semanal · ${dateShort(key)}–${dateShort(last.toISOString())}*\n\n${review.ai_text}` : "";

  return (
    <>
      <PageHeader eyebrow="Coach semanal" title={`Semana de ${dateShort(start.toISOString())} a ${dateShort(last.toISOString())}`}>
        <Link href={`/revisao?s=${offset - 1}`} className="btn-ghost" aria-label="Semana anterior">‹</Link>
        {offset < 0 && <Link href={`/revisao?s=${offset + 1}`} className="btn-ghost" aria-label="Semana seguinte">›</Link>}
      </PageHeader>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <div className="card !p-5"><div className="text-[13px] text-muted">Tarefas concluídas</div><div className="text-[28px] font-bold">{d.tarefas_concluidas.length}</div><div className={`text-xs ${d.tarefas_atrasadas.length ? "text-warn" : "text-muted"}`}>{d.tarefas_atrasadas.length} em atraso</div></div>
        <div className="card !p-5"><div className="text-[13px] text-muted">Conversas · propostas</div><div className="text-[28px] font-bold">{d.negocios_novos} · {d.propostas_enviadas}</div>{d.meta && <div className="text-xs text-muted">meta: {String(d.meta.por_semana.conversations).replace(".", ",")} · {String(d.meta.por_semana.proposals).replace(".", ",")} por semana</div>}</div>
        <div className="card !p-5"><div className="text-[13px] text-muted">Vendas da semana</div><div className="text-[28px] font-bold text-good">{eur(d.negocios_ganhos.reduce((a, x) => a + x.valor, 0))}</div><div className="text-xs text-muted">{d.negocios_ganhos.length} negócio(s)</div></div>
        {d.dinheiro && <div className="card !p-5"><div className="text-[13px] text-muted">Entradas · saídas</div><div className="text-[28px] font-bold">{eur(d.dinheiro.entradas)}</div><div className="text-xs text-muted">saídas {eur(d.dinheiro.saidas)}</div></div>}
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-4">
          <div className="flex items-center gap-2"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0058B0" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg><h2 className="h2">Análise do coach</h2></div>
          {review?.ai_text ? (<>
            <Rich text={review.ai_text} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <a href={waLink(me?.phone, share)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl min-h-10 px-4 text-sm font-semibold text-white bg-[#128C4A]"><WaIcon /> Enviar para o meu WhatsApp</a>
              {aiConfigured() && <CoachButton offset={offset} label="Gerar de novo" />}
            </div>
          </>) : aiConfigured() ? (<>
            <p className="text-sm text-muted">O coach lê os números da semana, a tua reflexão e o ritmo da meta, e devolve o balanço com 3 prioridades.</p>
            <CoachButton offset={offset} label="Fazer a revisão com o coach" />
          </>) : <p className="text-sm text-muted">Revê os números da semana ao lado e escreve a tua reflexão: o que correu bem, o que aprendeste e as 3 prioridades da próxima semana.</p>}
        </div>

        <div className="flex flex-col gap-4">
          <form action={saveReviewNotes} className="card flex flex-col gap-3">
            <input type="hidden" name="offset" value={offset} />
            <h2 className="h2">A tua reflexão</h2>
            <label htmlFor="notes" className="text-sm text-muted">O que correu bem? O que te bloqueou? O que vais fazer diferente?</label>
            <textarea id="notes" name="notes" rows={5} defaultValue={review?.notes ?? ""} className="input py-2.5" />
            <button className="btn-ghost self-start">Guardar reflexão</button>
          </form>
          <div className="card flex flex-col gap-2">
            <h2 className="h2">Atenção</h2>
            {d.krs_em_risco.length === 0 && d.negocios_a_arrefecer.length === 0 && d.tarefas_atrasadas.length === 0 ? <Empty>Nada em risco esta semana.</Empty> : null}
            {d.krs_em_risco.map((k) => <p key={k.kr} className="text-sm"><span className="font-medium">{k.kr}</span> <span className="text-warn">{k.progresso}% (devia estar em {k.esperado}%)</span></p>)}
            {d.negocios_a_arrefecer.map((n) => <p key={n.negocio} className="text-sm"><span className="font-medium">{n.negocio}</span> <span className="text-warn">sem contacto desde {dateShort(n.ultimo_contacto)}</span></p>)}
            {d.tarefas_atrasadas.slice(0, 5).map((t) => <p key={t.tarefa} className="text-sm">{t.tarefa} <span className="text-warn">· prazo {t.prazo ? dateShort(t.prazo) : "—"}</span></p>)}
          </div>
          {d.habitos.length > 0 && (
            <div className="card flex flex-col gap-2">
              <h2 className="h2">Hábitos</h2>
              {d.habitos.map((h) => <p key={h.habito} className="flex justify-between text-sm"><span>{h.habito}</span><span className={h.feito >= h.meta ? "text-good font-medium" : "text-ink-2"}>{h.feito}/{h.meta}</span></p>)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
