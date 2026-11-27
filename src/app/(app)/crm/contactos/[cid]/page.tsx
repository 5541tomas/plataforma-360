import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur, dateShort } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { WhatsAppMenu } from "@/components/WhatsAppMenu";
import { dealTemplates } from "@/lib/whatsapp";
import { addContactNote, addTestimonial, createDeal, saveContact } from "../../actions";
import { enrollContact, setConsent, stopEnrollment } from "../../automacoes/actions";
import { NurtureNotice } from "@/components/NurtureNotice";

const ACT: Record<string, string> = { note: "Nota", call: "Chamada", email: "Email", meeting: "Reunião", task: "Tarefa" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ cid: string }>; searchParams: Promise<{ nutrir?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { cid } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("*, companies(id, name)").eq("id", cid).eq("org_id", ctx.org.id).maybeSingle();
  if (!c) notFound();
  const company = c.companies as unknown as { id: string; name: string } | null;
  const [{ data: deals }, { data: pipelines }, { data: products }] = await Promise.all([
    supabase.from("v_deals").select("id, title, stage_name, status, kind, value, product_name").eq("contact_id", cid).order("created_at", { ascending: false }),
    supabase.from("pipelines").select("id").eq("org_id", ctx.org.id).order("position").limit(1),
    supabase.from("products").select("id, name").eq("org_id", ctx.org.id).eq("active", true).order("position"),
  ]);
  const dealIds = (deals ?? []).map((d) => d.id);
  const [{ data: seqs }, { data: enrolls }] = await Promise.all([
    supabase.from("sequences").select("id, name").eq("org_id", ctx.org.id).eq("active", true).order("created_at"),
    supabase.from("enrollments").select("id, sequence_id, status, next_step, next_run_at").eq("contact_id", cid).eq("status", "active"),
  ]);
  const seqName = new Map((seqs ?? []).map((q) => [q.id, q.name]));
  const score = (c.score as number | null) ?? 0;
  const { data: acts } = await supabase.from("activities").select("id, type, summary, occurred_at, deal_id")
    .or(dealIds.length ? `contact_id.eq.${cid},deal_id.in.(${dealIds.join(",")})` : `contact_id.eq.${cid}`)
    .order("occurred_at", { ascending: false }).limit(100);
  const dealTitle = new Map((deals ?? []).map((d) => [d.id, d.title]));
  const templates = dealTemplates({ contact: c.name, title: deals?.[0]?.title ?? "o nosso trabalho", me: ctx.name, hasProposal: false });

  return (
    <>
      <PageHeader eyebrow={[c.role, company?.name, c.area].filter(Boolean).join(" · ") || "Contacto"} title={c.name}>
        <Link href="/crm/contactos" className="btn-ghost">‹ Contactos</Link>
        {c.email && <a href={`mailto:${c.email}`} className="btn-ghost">Email</a>}
        <WhatsAppMenu phone={c.phone} templates={templates} />
      </PageHeader>
      <NurtureNotice code={sp.nutrir} />

      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Nutrição automática</h2>
          <span className={`chip ${score >= 60 ? "bg-warn-soft text-warn" : score >= 30 ? "bg-accent-soft text-accent-ink" : "bg-[#F2F2F5] text-muted"}`} title="Pontuação de interesse (0–100): atividade recente, aberturas, cliques, valor e etapa">{score >= 60 ? "🔥 Quente" : score >= 30 ? "Morno" : "Frio"} · {score}</span>
        </div>
        {c.unsubscribed_at ? <p className="text-sm text-warn">Cancelou as comunicações em {dateShort(c.unsubscribed_at)} — não recebe sequências por email nem newsletter.</p>
          : write && (
          <form action={setConsent} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="id" value={cid} />
            <label className="flex items-center gap-2"><input type="checkbox" name="consent" defaultChecked={!!c.consent_marketing} className="h-4 w-4" /> Aceitou receber newsletter{c.consent_at ? ` (desde ${dateShort(c.consent_at)})` : ""}</label>
            <button className="text-sm font-medium text-accent-ink">Guardar</button>
          </form>)}
        {(enrolls ?? []).map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F7F7F9] px-3 py-2 text-sm">
            <span><strong className="font-semibold">{seqName.get(e.sequence_id) ?? "Sequência"}</strong> · próximo: passo {e.next_step} em {dateShort(e.next_run_at)}</span>
            {write && <form action={stopEnrollment}><input type="hidden" name="id" value={e.id} /><button className="text-xs text-muted hover:text-warn">Parar</button></form>}
          </div>
        ))}
        {write && (seqs?.length ?? 0) > 0 && (
          <form action={enrollContact} className="flex flex-wrap gap-2">
            <input type="hidden" name="contact_id" value={cid} /><input type="hidden" name="back" value={`/crm/contactos/${cid}`} />
            <select name="sequence_id" aria-label="Sequência" className="input !w-auto !min-h-10">{seqs!.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select>
            {(deals?.length ?? 0) > 0 && <select name="deal_id" aria-label="Negócio" className="input !w-auto !min-h-10"><option value="">Sem negócio</option>{deals!.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
            <button className="btn-ghost !min-h-10">Iniciar nutrição</button>
          </form>
        )}
        {(seqs?.length ?? 0) === 0 && <p className="text-sm text-muted">Ainda não tens sequências. <Link href="/crm/automacoes?tab=sequencias" className="text-accent-ink">Criar</Link></p>}
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-4">
          <h2 className="h2">Histórico</h2>
          {write && (
            <form action={addContactNote} className="flex flex-col gap-2">
              <input type="hidden" name="contact_id" value={cid} />
              <label className="sr-only" htmlFor="sum">Registo</label>
              <textarea id="sum" name="summary" required rows={2} placeholder="Registar conversa, chamada ou nota…" className="input py-2.5" />
              <div className="flex flex-wrap gap-2">
                <select name="type" aria-label="Tipo" className="input !w-auto !min-h-10">{Object.entries(ACT).filter(([k]) => k !== "task").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                {(deals?.length ?? 0) > 0 && <select name="deal_id" aria-label="Negócio" className="input !w-auto !min-h-10"><option value="">Sem negócio</option>{deals!.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
                <button className="btn !min-h-10">Registar</button>
              </div>
            </form>
          )}
          {(acts?.length ?? 0) === 0 ? <Empty>Sem registos.</Empty> : (
            <ol className="flex flex-col gap-3">
              {acts!.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="w-16 shrink-0 pt-0.5 text-xs text-muted">{dateShort(a.occurred_at)}</span>
                  <div className="flex flex-col gap-0.5"><span className="text-xs font-semibold text-ink-2">{ACT[a.type]}{a.deal_id ? ` · ${dealTitle.get(a.deal_id) ?? ""}` : ""}</span><span className="whitespace-pre-line">{a.summary}</span></div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Negócios</h2>
            {(deals?.length ?? 0) === 0 ? <Empty>Sem negócios.</Empty> : deals!.map((d) => (
              <Link key={d.id} href={`/crm/${d.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 hover:bg-soft">
                <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium truncate">{d.title}</span><span className="text-xs text-muted">{d.stage_name}{d.product_name ? ` · ${d.product_name}` : ""}</span></div>
                <span className="text-sm font-semibold">{eur(d.value)}{d.kind === "retainer" ? "/mês" : ""}</span>
              </Link>
            ))}
            {write && pipelines?.[0] && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-accent-ink">+ Novo negócio para {c.name.split(" ")[0]}</summary>
                <form action={createDeal} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="pipeline_id" value={pipelines[0].id} />
                  <input type="hidden" name="contact_id" value={cid} />
                  {company && <input type="hidden" name="company_id" value={company.id} />}
                  <input type="hidden" name="open" value="1" />
                  <input name="title" required placeholder="Título" aria-label="Título" className="input" />
                  <select name="product_id" aria-label="Produto" className="input"><option value="">Outro / personalizado</option>{(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <input name="value" type="number" step="0.01" placeholder="Valor (vazio = preço do produto)" aria-label="Valor" className="input" />
                  <button className="btn">Criar negócio</button>
                </form>
              </details>
            )}
          </div>

          {write && (
            <form action={addTestimonial} className="card flex flex-col gap-2">
              <h2 className="h2">Testemunho</h2>
              <p className="text-xs text-muted">O que {c.name.split(" ")[0]} disse do teu trabalho. Fica guardado e aparece automaticamente nas propostas.</p>
              <input type="hidden" name="contact_id" value={c.id} />
              <input type="hidden" name="author" value={[c.name, c.role, company?.name].filter(Boolean).join(", ")} />
              <label className="sr-only" htmlFor="tst">Testemunho</label>
              <textarea id="tst" name="text" rows={3} required className="input py-2.5" placeholder="Ex.: Em 8 sessões organizámos a equipa e duplicámos as vendas." />
              <button className="btn-ghost self-start">Guardar testemunho</button>
            </form>
          )}
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Dados</h2>
            <form action={saveContact} className="grid grid-cols-2 gap-2">
              <fieldset disabled={!write} className="contents">
                <input type="hidden" name="id" value={c.id} />
                <label className="flex flex-col gap-1 col-span-2"><span className="label">Nome</span><input name="name" defaultValue={c.name} className="input" required /></label>
                <label className="flex flex-col gap-1"><span className="label">Email</span><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1"><span className="label">Telemóvel</span><input name="phone" type="tel" defaultValue={c.phone ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1"><span className="label">Empresa</span><input name="company" defaultValue={company?.name ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1"><span className="label">Cargo</span><input name="role" defaultValue={c.role ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1 col-span-2"><span className="label">Origem</span><input name="source" defaultValue={c.source ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1 col-span-2"><span className="label">Notas</span><textarea name="notes" rows={3} defaultValue={c.notes ?? ""} className="input py-2.5" /></label>
                {write && <button className="btn-ghost col-span-2">Guardar</button>}
              </fieldset>
            </form>
            {company && <Link href={`/crm/empresas/${company.id}`} className="text-sm font-medium text-accent-ink">Ver empresa {company.name}</Link>}
          </div>
        </div>
      </section>
    </>
  );
}
