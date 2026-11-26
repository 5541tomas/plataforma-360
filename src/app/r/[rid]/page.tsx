import Link from "next/link";
import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { Ring } from "@/components/Ring";
import { advice, levelOf, type QuizConfig } from "@/lib/magnets";
import { meetingHref, type MeetingInfo } from "@/lib/meeting";

export const dynamic = "force-dynamic";
export const metadata = { title: "O teu resultado", robots: { index: false } };
type R = MeetingInfo & { kind: string; config: QuizConfig; scores: Record<string, number> | null; total: number | null; weakest: string | null; org: string; author: string; has_ebook: boolean };

const color = (p: number) => (p < 40 ? "#C25E00" : p < 70 ? "#0071E3" : "#1E7B34");

export default async function ResultPage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const { data } = await anonClient().rpc("public_magnet_result", { p_rid: rid });
  const r = data as R | null;
  if (!r || r.kind !== "quiz" || !r.scores) notFound();
  const total = r.total ?? 0, level = levelOf(r.config, total);
  const areas = [...r.config.areas].sort((a, b) => (r.scores![a.key] ?? 0) - (r.scores![b.key] ?? 0));
  const weak = areas[0];
  const meet = meetingHref(r, total, r.weakest);

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
        <header className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium text-muted">{r.title}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.7px]">{r.first_name ? `${r.first_name}, ` : ""}este é o teu resultado</h1>
          <Ring value={total / 100} size={168} stroke={14} color={color(total)} label={`${total} em 100`}>
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-ink text-[40px] font-bold">{total}</text>
            <text x="50%" y="66%" textAnchor="middle" className="fill-[#6E6E73] text-[13px]">de 100</text>
          </Ring>
          <div className="flex flex-col gap-1.5"><span className="chip mx-auto bg-accent-soft text-[13px] text-accent-ink">{level.name}</span><p className="max-w-[520px] text-[15px] leading-relaxed text-ink-2">{level.text}</p></div>
        </header>

        <section className="card flex flex-col gap-4">
          <h2 className="h2">As tuas 5 áreas</h2>
          {r.config.areas.map((a) => { const p = r.scores![a.key] ?? 0; return (
            <div key={a.key} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm"><span className="font-medium">{a.name}{a.key === weak.key && <span className="chip ml-2 bg-warn-soft text-warn">Prioridade</span>}</span><span className="font-semibold tabular-nums">{p}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${Math.max(3, p)}%`, background: color(p) }} /></div>
            </div>); })}
        </section>

        <section className="card flex flex-col gap-3 border-2 border-[#F4C9A3]">
          <span className="text-xs font-semibold uppercase tracking-[0.6px] text-warn">Começa por aqui</span>
          <h2 className="text-[22px] font-semibold tracking-[-0.4px]">{weak.name}</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">{advice(weak, r.scores[weak.key] ?? 0)}</p>
        </section>

        <section id="reuniao" className="flex flex-col gap-4 rounded-[20px] bg-gradient-to-br from-[#0B1B33] to-[#0058B0] p-6 text-white">
          <h2 className="text-[24px] font-bold leading-tight tracking-[-0.5px]">Queres um plano feito à tua medida?</h2>
          <p className="text-[15px] leading-relaxed text-white/85">Numa reunião 1:1 gratuita de 30 minutos revemos o teu diagnóstico, escolhemos as 3 prioridades para os próximos 90 dias — começando por {weak.name.toLowerCase()} — e sais com um plano escrito. Sem compromisso.</p>
          <a href={meet.href} target={meet.external ? "_blank" : undefined} rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center self-start rounded-xl bg-white px-5 text-[15px] font-semibold text-[#0B1B33] hover:bg-white/90">{r.meeting_label || "Marcar a minha reunião 1:1 gratuita"}</a>
          <p className="text-xs text-white/60">Com {r.author}</p>
        </section>

        {r.has_ebook && (
          <section className="card flex flex-wrap items-center gap-5">
            <div className="flex h-28 w-20 shrink-0 flex-col justify-end rounded-md bg-gradient-to-br from-[#0B1B33] to-[#0071E3] p-2 text-[9px] font-bold leading-tight text-white shadow-md" aria-hidden="true">Agenda cheia, preço justo</div>
            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
              <h2 className="h2">O teu ebook de oferta</h2>
              <p className="text-sm text-ink-2">O guia completo com as 5 áreas e um plano de 30 dias.</p>
              <Link href={`/e/${rid}`} className="btn self-start">Ler o ebook</Link>
            </div>
          </section>
        )}

        <section className="card flex flex-col gap-4">
          <h2 className="h2">Recomendações para cada área</h2>
          {areas.slice(1).map((a) => (
            <div key={a.key} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
              <span className="text-sm font-semibold">{a.name} · {r.scores![a.key]}%</span>
              <p className="text-sm leading-relaxed text-ink-2">{advice(a, r.scores![a.key] ?? 0)}</p>
            </div>
          ))}
        </section>
        <p className="text-center text-xs text-muted">{r.org}</p>
      </div>
    </main>
  );
}
