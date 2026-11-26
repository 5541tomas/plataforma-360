import Link from "next/link";
import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { Markdown } from "@/components/Markdown";
import { PrintButton } from "@/components/PrintButton";
import { meetingHref, type MeetingInfo } from "@/lib/meeting";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ebook", robots: { index: false } };
type E = { title: string; subtitle: string | null; content: string | null; author: string; org: string; first_name: string | null; result: string | null };

export default async function EbookPage({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const sb = anonClient();
  const [{ data }, { data: info }] = await Promise.all([sb.rpc("public_ebook", { p_rid: rid }), sb.rpc("public_magnet_result", { p_rid: rid })]);
  const e = data as E | null;
  if (!e?.content) notFound();
  const meet = meetingHref(info as MeetingInfo & { total: number | null; weakest: string | null }, (info as { total: number | null }).total, (info as { weakest: string | null }).weakest);

  return (
    <main className="min-h-screen bg-bg px-4 py-8 print:bg-white print:p-0">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 18mm } h2 { break-after: avoid } }`}</style>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          {e.result ? <Link href={`/r/${e.result}`} className="text-sm text-muted hover:text-ink">‹ O meu diagnóstico</Link> : <span />}
          <PrintButton />
        </div>
        <section className="flex min-h-[420px] flex-col justify-between rounded-[24px] bg-gradient-to-br from-[#0B1B33] via-[#0A3B7A] to-[#0071E3] p-8 text-white sm:p-12 print:min-h-[240mm] print:rounded-none">
          <span className="text-xs font-semibold uppercase tracking-[1.5px] text-white/70">Guia prático{e.first_name ? ` · para ${e.first_name}` : ""}</span>
          <div className="flex flex-col gap-4">
            <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-1px] sm:text-[52px]">{e.title}</h1>
            {e.subtitle && <p className="max-w-[480px] text-[18px] leading-relaxed text-white/85">{e.subtitle}</p>}
          </div>
          <span className="text-sm font-medium text-white/80">{e.author}</span>
        </section>
        <article className="card flex flex-col gap-5 text-[16.5px] leading-[1.7] text-ink-2 sm:!p-10 print:shadow-none">
          <Markdown text={e.content} />
        </article>
        <section className="no-print flex flex-col gap-3 rounded-[20px] bg-[#0B1B33] p-6 text-white">
          <h2 className="text-[22px] font-bold tracking-[-0.4px]">Passa do ebook à ação</h2>
          <p className="text-[15px] text-white/80">30 minutos, gratuitos, para saíres com o teu plano de vendas para os próximos 90 dias.</p>
          <a href={meet.href} target={meet.external ? "_blank" : undefined} rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center self-start rounded-xl bg-white px-5 font-semibold text-[#0B1B33]">{(info as MeetingInfo).meeting_label || "Marcar a minha reunião 1:1 gratuita"}</a>
        </section>
        <p className="text-center text-xs text-muted">© {e.org}</p>
      </div>
    </main>
  );
}
