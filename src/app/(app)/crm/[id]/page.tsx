import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur, eur2, dateShort, today } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { addActivity, addContactToDeal, deleteDeal, moveDeal, updateContact, updateDeal } from "../actions";
import { createProposal } from "../proposal-actions";
import { WhatsAppMenu } from "@/components/WhatsAppMenu";
import { dealTemplates } from "@/lib/whatsapp";

const ACT: Record<string, string> = { note: "Nota", call: "Chamada", email: "Email", meeting: "Reunião", task: "Tarefa" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { id } = await params;
  const supabase = await createClient();
  const { data: deal } = await supabase.from("v_deals").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!deal) notFound();
  const { data: proposals } = await supabase.from("proposals").select("id, number, title, total, status, recurring, created_at").eq("deal_id", id).order("created_at", { ascending: false });
  const [{ data: stages }, { data: acts }, { data: contact }, { data: tasks }] = await Promise.all([
    supabase.from("stages").select("id, name").eq("pipeline_id", deal.pipeline_id).order("position"),
    supabase.from("activities").select("id, type, summary, occurred_at").eq("deal_id", id).order("occurred_at", { ascending: false }),
    deal.contact_id ? supabase.from("contacts").select("*").eq("id", deal.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("tasks").select("id, title, due_date, done").eq("deal_id", id).eq("done", false).order("due_date"),
  ]);

  return (
    <>
      <PageHeader eyebrow={[deal.company_name ?? "Sem empresa", deal.product_name, deal.source && `Origem: ${deal.source}`].filter(Boolean).join(" · ")} title={deal.title}>
        <Link href={`/crm?p=${deal.pipeline_id}`} className="btn-ghost">‹ Pipeline</Link>
        <WhatsAppMenu phone={deal.contact_phone} templates={dealTemplates({ contact: deal.contact_name, title: deal.title, me: ctx.name, hasProposal: (proposals?.length ?? 0) > 0 })} />
        {write && (
          <form action={moveDeal} className="flex gap-2">
            <input type="hidden" name="deal_id" value={deal.id} />
            <label className="sr-only" htmlFor="stage">Etapa</label>
            <select id="stage" name="stage_id" defaultValue={deal.stage_id} className="input !w-auto">
              {(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn">Mover</button>
          </form>
        )}
      </PageHeader>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Valor</span><span className="text-2xl font-bold tracking-[-0.5px]">{deal.kind === "retainer" ? `${eur(deal.value)}/mês` : eur(deal.value)}</span>{deal.kind === "retainer" && <span className="text-xs text-muted">{deal.duration_months} meses · {eur(deal.total_value)} total</span>}</div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Etapa · probabilidade</span><span className="text-2xl font-bold tracking-[-0.5px]">{deal.stage_name} · {deal.eff_probability}%</span><span className="text-xs text-muted">Ponderado {eur(deal.weighted_value)}</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Fecho previsto</span><span className="text-2xl font-bold tracking-[-0.5px]">{deal.expected_close ? dateShort(deal.expected_close) : "—"}</span>
          <span className={`text-xs ${deal.is_cooling ? "text-warn font-medium" : "text-muted"}`}>Último contacto {dateShort(deal.last_activity_at)}{deal.is_cooling ? " · a arrefecer" : ""}</span></div>
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-4">
          <h2 className="h2">Histórico</h2>
          {write && (
            <form action={addActivity} className="flex flex-col gap-2">
              <input type="hidden" name="deal_id" value={deal.id} />
              <label className="sr-only" htmlFor="summary">O que aconteceu</label>
              <textarea id="summary" name="summary" required rows={2} placeholder="O que aconteceu? (ex.: liguei, pediu proposta revista)" className="input py-2.5" />
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1"><span className="label">Tipo</span>
                  <select name="type" className="input !min-h-10">{Object.entries(ACT).filter(([k]) => k !== "task").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="flex flex-col gap-1"><span className="label">Próximo follow-up</span><input name="follow_up" type="date" min={today()} className="input !min-h-10" /></label>
                <button className="btn !min-h-10">Registar</button>
              </div>
            </form>
          )}
          {(tasks?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent-ink">
              {tasks!.map((t) => <div key={t.id}>Pendente: {t.title}{t.due_date ? ` · ${dateShort(t.due_date)}` : ""}</div>)}
            </div>
          )}
          {(acts?.length ?? 0) === 0 ? <Empty>Sem registos ainda.</Empty> : (
            <ol className="flex flex-col gap-3">
              {acts!.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="w-16 shrink-0 text-xs text-muted pt-0.5">{dateShort(a.occurred_at)}</span>
                  <div className="flex flex-col gap-0.5"><span className="text-xs font-semibold text-ink-2">{ACT[a.type]}</span><span className="whitespace-pre-line">{a.summary}</span></div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Contacto</h2>
            {contact ? (
              write ? (
                <form action={updateContact} className="grid grid-cols-2 gap-2">
                  <input type="hidden" name="id" value={contact.id} />
                  <label className="flex flex-col gap-1 col-span-2"><span className="label">Nome</span><input name="name" defaultValue={contact.name} className="input" required /></label>
                  <label className="flex flex-col gap-1"><span className="label">Email</span><input name="email" type="email" defaultValue={contact.email ?? ""} className="input" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Telefone</span><input name="phone" defaultValue={contact.phone ?? ""} className="input" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Cargo</span><input name="role" defaultValue={contact.role ?? ""} className="input" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Origem</span><input name="source" list="sources" defaultValue={contact.source ?? ""} className="input" />
                    <datalist id="sources"><option value="Referência" /><option value="LinkedIn" /><option value="Site" /><option value="Evento" /><option value="Cliente antigo" /></datalist></label>
                  <button className="btn-ghost col-span-2">Guardar contacto</button>
                </form>
              ) : (
                <div className="text-sm"><div className="font-medium">{contact.name}</div><div className="text-muted">{contact.email} {contact.phone}</div></div>
              )
            ) : write ? (
              <form action={addContactToDeal} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="deal_id" value={deal.id} />
                <label className="flex flex-col gap-1 col-span-2"><span className="label">Nome</span><input name="name" className="input" required /></label>
                <label className="flex flex-col gap-1"><span className="label">Email</span><input name="email" type="email" className="input" /></label>
                <label className="flex flex-col gap-1"><span className="label">Telefone</span><input name="phone" className="input" /></label>
                <button className="btn-ghost col-span-2">Adicionar contacto</button>
              </form>
            ) : <Empty>Sem contacto.</Empty>}
            {contact?.email && <a href={`mailto:${contact.email}`} className="text-sm font-medium text-accent-ink">Enviar email</a>}
          </div>

          <div className="card flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h2">Propostas</h2>
              {write && <form action={createProposal}><input type="hidden" name="deal_id" value={deal.id} /><button className="btn-ghost !min-h-10">+ Nova proposta</button></form>}
            </div>
            {(proposals?.length ?? 0) === 0 ? <Empty>Sem propostas. Cria uma a partir deste negócio — fica pronta a enviar em PDF.</Empty> : proposals!.map((pr) => (
              <Link key={pr.id} href={`/crm/${deal.id}/proposta/${pr.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 hover:bg-soft">
                <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium truncate">{pr.number} · {pr.title}</span><span className="text-xs text-muted">{dateShort(pr.created_at)}</span></div>
                <span className="text-sm font-semibold">{eur2(pr.total)}{pr.recurring ? "/mês" : ""}</span>
                <span className={`chip ${pr.status === "accepted" ? "bg-good-soft text-[#1E6B30]" : pr.status === "sent" ? "bg-accent-soft text-accent-ink" : pr.status === "rejected" ? "bg-warn-soft text-[#8F4300]" : "bg-[#F2F2F5] text-ink-2"}`}>{({ draft: "Rascunho", sent: "Enviada", accepted: "Aceite", rejected: "Recusada" } as Record<string, string>)[pr.status]}</span>
              </Link>
            ))}
          </div>

          {write && (
            <details className="card">
              <summary className="h2 cursor-pointer">Editar negócio</summary>
              <form action={updateDeal} className="mt-4 grid grid-cols-2 gap-3">
                <input type="hidden" name="id" value={deal.id} />
                <label className="flex flex-col gap-1.5 col-span-2"><span className="label">Título</span><input name="title" defaultValue={deal.title} className="input" required /></label>
                <label className="flex flex-col gap-1.5 col-span-2"><span className="label">Empresa</span><input name="company" defaultValue={deal.company_name ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Tipo</span>
                  <select name="kind" defaultValue={deal.kind} className="input"><option value="retainer">Avença (mensal)</option><option value="one_off">Serviço pontual</option></select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Valor (€)</span><input name="value" type="number" step="0.01" defaultValue={deal.value} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Duração (meses)</span><input name="duration" type="number" min="1" defaultValue={deal.duration_months} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Fecho previsto</span><input name="expected_close" type="date" defaultValue={deal.expected_close ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Probabilidade (%) · vazio = da etapa</span><input name="probability" type="number" min="0" max="100" defaultValue={deal.probability ?? ""} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Motivo de perda</span><input name="lost_reason" defaultValue={deal.lost_reason ?? ""} className="input" /></label>
                <button className="btn col-span-2">Guardar alterações</button>
              </form>
              <form action={deleteDeal} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
                <input type="hidden" name="id" value={deal.id} />
                <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required className="h-4 w-4" /> Confirmo que quero apagar</label>
                <button className="font-medium text-warn min-h-9">Apagar negócio</button>
              </form>
            </details>
          )}
        </div>
      </section>
    </>
  );
}
