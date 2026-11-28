import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { Empty, PageHeader } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { eur } from "@/lib/format";
import { referralBase, refLink } from "@/lib/growth";
import { approveTestimonial, createRefCode, rejectTestimonial, requestTestimonial } from "./actions";

export const metadata = { title: "Testemunhos e recomendações" };
type T = { id: string; token: string; deal_id: string | null; contact_id: string | null; name: string | null; role: string | null; company: string | null; text: string | null; rating: number | null; permission: boolean; status: string; created_at: string };

export default async function ClientsPage() {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const supabase = await createClient();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [{ data: ts }, { data: wonDeals }, { data: refs }, { data: referred }, rb] = await Promise.all([
    supabase.from("testimonials").select("*").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
    supabase.from("v_deals").select("id, title, contact_id, contact_name, value, won_at").eq("org_id", ctx.org.id).eq("status", "won").order("won_at", { ascending: false }).limit(200),
    supabase.from("contacts").select("id, name, ref_code").eq("org_id", ctx.org.id).not("ref_code", "is", null),
    supabase.from("deals").select("id, referred_by, status, value").eq("org_id", ctx.org.id).not("referred_by", "is", null),
    referralBase(supabase, ctx.org.id, base),
  ]);
  const list = (ts ?? []) as T[];
  const pending = list.filter((t) => t.status === "submitted"), waiting = list.filter((t) => t.status === "requested"), approved = list.filter((t) => t.status === "approved");
  const asked = new Set(list.map((t) => t.deal_id));
  const toAsk = (wonDeals ?? []).filter((d) => !asked.has(d.id)).slice(0, 8);
  const byRef = new Map<string, { leads: number; won: number; value: number }>();
  for (const d of referred ?? []) { const x = byRef.get(d.referred_by!) ?? { leads: 0, won: 0, value: 0 }; x.leads++; if (d.status === "won") { x.won++; x.value += Number(d.value); } byRef.set(d.referred_by!, x); }
  const refRows = (refs ?? []).map((c) => ({ ...c, ...(byRef.get(c.id) ?? { leads: 0, won: 0, value: 0 }) })).sort((a, b) => b.value - a.value || b.leads - a.leads);
  const wonClients = [...new Map((wonDeals ?? []).filter((d) => d.contact_id && !(refs ?? []).some((r) => r.id === d.contact_id)).map((d) => [d.contact_id, d])).values()].slice(0, 6);
  const totRef = [...byRef.values()].reduce((a, x) => ({ leads: a.leads + x.leads, won: a.won + x.won, value: a.value + x.value }), { leads: 0, won: 0, value: 0 });

  return (
    <>
      <PageHeader title="Testemunhos e recomendações" />
      <p className="-mt-2 max-w-[720px] text-sm text-muted">Os teus clientes são o melhor canal de vendas. Pede o testemunho no fim de cada projeto e dá a cada cliente um link pessoal para recomendar — vês quem te trouxe quem, e quanto faturaste por isso.</p>

      <section className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {[["Testemunhos publicados", String(approved.length)], ["Por aprovar", String(pending.length)], ["Leads recomendadas", String(totRef.leads)], ["Clientes por recomendação", String(totRef.won)], ["Faturado por recomendação", eur(totRef.value)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"><div className="text-xs text-muted">{l}</div><div className="text-[22px] font-semibold tabular-nums">{v}</div></div>
        ))}
      </section>

      {pending.length > 0 && (
        <section className="card flex flex-col gap-3"><h2 className="h2">Por aprovar</h2>
          {pending.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm"><strong className="font-semibold">{[t.name, t.role, t.company].filter(Boolean).join(", ") || "Sem nome"}</strong>{t.rating && <span className="text-[#C9A55C]">{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</span>}{!t.permission && <span className="chip bg-warn-soft text-warn">Sem autorização para publicar</span>}</div>
              {write ? (
                <form action={approveTestimonial} className="flex flex-col gap-2"><input type="hidden" name="id" value={t.id} />
                  <textarea name="text" rows={3} defaultValue={t.text ?? ""} className="input py-2.5 text-sm" aria-label="Texto do testemunho" />
                  <div className="flex flex-wrap gap-2">{t.permission && <button className="btn">Aprovar e publicar</button>}<button formAction={rejectTestimonial} className="btn-ghost">{t.permission ? "Não publicar" : "Arquivar"}</button></div>
                </form>
              ) : <p className="text-sm">{t.text}</p>}
            </div>
          ))}
          <p className="text-xs text-muted">Ao aprovar, o testemunho entra em Definições → Testemunhos: aparece nas propostas e junto ao formulário das landing pages.</p>
        </section>
      )}

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Pedir testemunho</h2>
          {toAsk.length === 0 && waiting.length === 0 ? <Empty>Quando ganhares um negócio, aparece aqui para pedires o testemunho.</Empty> : null}
          {toAsk.map((d) => (
            <form key={d.id} action={requestTestimonial} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F2] pb-2 text-sm last:border-0"><input type="hidden" name="deal_id" value={d.id} />
              <Link href={`/crm/${d.id}`} className="font-medium hover:text-accent-ink">{d.contact_name ?? d.title}</Link>{write && <button className="btn-ghost">Criar pedido</button>}</form>
          ))}
          {waiting.length > 0 && <div className="flex flex-col gap-2"><span className="label">À espera de resposta</span>{waiting.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">{t.deal_id ? <Link href={`/crm/${t.deal_id}`} className="font-medium hover:text-accent-ink">Ver negócio</Link> : <span>—</span>}<CopyLink url={`${base}/o/${t.token}`} /></div>
          ))}</div>}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="h2">Programa de recomendações</h2>
          {!rb ? <Empty>Cria primeiro um lead magnet: os links de recomendação levam ao teu guia.</Empty> : (<>
            {refRows.length === 0 && <p className="text-sm text-muted">Cria um link pessoal para cada cliente satisfeito. Quem pedir o guia por esse link fica associado a ele.</p>}
            {refRows.map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5 border-b border-[#F0F0F2] pb-2.5 text-sm last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/crm/contactos/${r.id}`} className="font-medium hover:text-accent-ink">{r.name}</Link><span className="text-xs text-muted">{r.leads} lead(s) · {r.won} cliente(s) · {eur(r.value)}</span></div>
                <CopyLink url={refLink(rb, r.ref_code!)} />
              </div>
            ))}
            {write && wonClients.length > 0 && <div className="flex flex-col gap-1.5"><span className="label">Clientes sem link</span>{wonClients.map((d) => (
              <form key={d.contact_id} action={createRefCode} className="flex items-center justify-between gap-2 text-sm"><input type="hidden" name="contact_id" value={d.contact_id!} /><span>{d.contact_name}</span><button className="btn-ghost">Criar link</button></form>
            ))}</div>}
          </>)}
        </div>
      </section>

      {approved.length > 0 && (
        <section className="card flex flex-col gap-3"><h2 className="h2">Publicados</h2>
          {approved.map((t) => <figure key={t.id} className="m-0 border-l-2 border-[#C9A55C] pl-3 text-sm"><p className="m-0 italic">“{t.text}”</p><figcaption className="text-xs text-muted">{[t.name, t.role, t.company].filter(Boolean).join(", ")}</figcaption></figure>)}
        </section>
      )}
    </>
  );
}
