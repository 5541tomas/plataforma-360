import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { dateShort } from "@/lib/format";
import { emailConfigured } from "@/lib/email";
import { Disclosure, Empty, PageHeader } from "@/components/ui";
import { ApproveAll, QueueItem, SendCampaign, type QItem } from "@/components/QueueItem";
import { deleteRule, previewAudience, saveCampaign, saveEmailSettings, saveRule, saveSequence, seedAutomation, stopEnrollment } from "./actions";

const TABS = [["fila", "Fila de aprovação"], ["sequencias", "Sequências"], ["regras", "Regras"], ["newsletter", "Newsletter"]] as const;
const TRIGGERS: Record<string, string> = {
  form_lead: "Chega uma lead pelo formulário", stage_enter: "Um negócio entra na etapa…", deal_won: "Um negócio é ganho", deal_lost: "Um negócio é perdido",
  inactive_days: "Negócio aberto sem contacto há N dias", lost_after_days: "Negócio perdido há N dias", client_every_days: "Cliente: a cada N dias depois de ganho",
};
const ACTIONS: Record<string, string> = { enroll: "Inscrever o contacto numa sequência", task: "Criar uma tarefa", move_stage: "Mover o negócio para a etapa…" };
const CH: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", task: "Tarefa" };

type Seq = { id: string; name: string; description: string | null; stop_on_stage_change: boolean; stop_on_reply: boolean; for_closed_deals: boolean; active: boolean };
type Step = { id: string; sequence_id: string; position: number; delay_days: number; channel: string; subject: string | null; body: string };
type Rule = { id: string; name: string; trigger: string; trigger_config: { stage?: string; days?: number }; action: string; action_config: { sequence_id?: string; title?: string; days?: number; stage?: string }; active: boolean };

function SeqForm({ s, steps }: { s?: Seq; steps: Step[] }) {
  const rows = [...steps, ...Array.from({ length: s ? 2 : 4 }, () => null)];
  return (
    <form action={saveSequence} className="flex flex-col gap-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" defaultValue={s?.name} required className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Descrição</span><input name="description" defaultValue={s?.description ?? ""} className="input" /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={s?.active ?? true} className="h-4 w-4" /> Ativa</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="stop_on_reply" defaultChecked={s?.stop_on_reply ?? true} className="h-4 w-4" /> Parar quando registo contacto (chamada, reunião, email)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="stop_on_stage_change" defaultChecked={s?.stop_on_stage_change ?? true} className="h-4 w-4" /> Parar quando o negócio muda de etapa</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="for_closed_deals" defaultChecked={s?.for_closed_deals ?? false} className="h-4 w-4" /> Para negócios fechados (reativação, clientes)</label>
      </div>
      <p className="text-xs text-muted">Variáveis: {"{{primeiro_nome}} {{nome}} {{empresa}} {{produto}} {{negocio}} {{meu_nome}}"} · Deixa a mensagem vazia para remover um passo.</p>
      {rows.map((st, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 grid-cols-[110px_120px_1fr]">
          <label className="flex flex-col gap-1"><span className="label">Passo {i + 1}</span><select name={`s${i}_channel`} defaultValue={st?.channel ?? "email"} className="input !min-h-10">{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="label">Dias depois</span><input name={`s${i}_delay`} type="number" min="0" defaultValue={st?.delay_days ?? (i ? 3 : 0)} className="input !min-h-10" /></label>
          <label className="flex flex-col gap-1"><span className="label">Assunto (email)</span><input name={`s${i}_subject`} defaultValue={st?.subject ?? ""} className="input !min-h-10" /></label>
          <label className="col-span-3 flex flex-col gap-1"><span className="label">Mensagem</span><textarea name={`s${i}_body`} rows={st?.channel === "email" ? 5 : 2} defaultValue={st?.body ?? ""} className="input py-2 text-sm leading-relaxed" /></label>
        </div>
      ))}
      <button className="btn self-start">Guardar sequência</button>
    </form>
  );
}

export default async function AutomacoesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const tab = (await searchParams).tab ?? "fila";
  const supabase = await createClient();
  if (write) await supabase.rpc("run_automations", { p_org: ctx.org.id });
  const emailReady = emailConfigured();
  const [{ data: seqs }, { data: steps }, { data: rules }, { data: queue }, { data: enrolls }, { data: stages }, { data: products }, { data: campaigns }, { data: org }] = await Promise.all([
    supabase.from("sequences").select("*").eq("org_id", ctx.org.id).order("created_at"),
    supabase.from("sequence_steps").select("*").eq("org_id", ctx.org.id).order("position"),
    supabase.from("automation_rules").select("*").eq("org_id", ctx.org.id).order("created_at"),
    supabase.from("outbox").select("id, channel, to_address, subject, body, due_on, contact_id, deal_id, step_id, campaign_id").eq("org_id", ctx.org.id).eq("status", "pending").is("campaign_id", null).order("due_on"),
    supabase.from("enrollments").select("id, sequence_id, contact_id, status, next_step, next_run_at, stopped_reason").eq("org_id", ctx.org.id).order("started_at", { ascending: false }).limit(200),
    supabase.from("stages").select("name, position").eq("org_id", ctx.org.id).order("position"),
    supabase.from("products").select("id, name").eq("org_id", ctx.org.id).eq("active", true),
    supabase.from("campaigns").select("*").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
    supabase.from("organizations").select("settings, signature_name").eq("id", ctx.org.id).single(),
  ]);
  const contactIds = [...new Set([...(queue ?? []).map((q) => q.contact_id), ...(enrolls ?? []).map((e) => e.contact_id)])].filter(Boolean) as string[];
  const dealIds = [...new Set((queue ?? []).map((q) => q.deal_id).filter(Boolean))] as string[];
  const [{ data: contacts }, { data: deals }, { data: sentStats }] = await Promise.all([
    contactIds.length ? supabase.from("contacts").select("id, name").in("id", contactIds) : Promise.resolve({ data: [] }),
    dealIds.length ? supabase.from("deals").select("id, title").in("id", dealIds) : Promise.resolve({ data: [] }),
    supabase.from("outbox").select("campaign_id, step_id, status, opened_at, clicked_at").eq("org_id", ctx.org.id).eq("status", "sent"),
  ]);
  const cName = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  const dName = new Map((deals ?? []).map((d) => [d.id, d.title]));
  const stepById = new Map(((steps ?? []) as Step[]).map((s) => [s.id, s]));
  const seqName = new Map(((seqs ?? []) as Seq[]).map((s) => [s.id, s.name]));
  const items: QItem[] = (queue ?? []).map((q) => {
    const st = q.step_id ? stepById.get(q.step_id) : undefined;
    return { id: q.id, channel: q.channel as "email" | "whatsapp", to_address: q.to_address, subject: q.subject, body: q.body, contact: cName.get(q.contact_id!) ?? "—", deal: q.deal_id ? dName.get(q.deal_id) ?? null : null, step: st ? `${seqName.get(st.sequence_id)} · passo ${st.position}` : "manual", due_on: q.due_on };
  });
  const emailsPending = items.filter((i) => i.channel === "email").length;
  const sender = (org?.settings as { email?: { from_name?: string; from_email?: string; reply_to?: string } })?.email ?? {};

  return (
    <>
      <PageHeader title="Automações">
        {write && (seqs?.length ?? 0) === 0 && <form action={seedAutomation}><button className="btn">Criar sequências e regras iniciais</button></form>}
      </PageHeader>
      <nav className="seg max-w-full self-start overflow-x-auto whitespace-nowrap" aria-label="Automações">{TABS.map(([k, l]) => <Link key={k} href={`/crm/automacoes?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l}{k === "fila" && items.length ? ` (${items.length})` : ""}</Link>)}</nav>
      {!emailReady && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">O envio automático de email ainda não está ligado (Resend). Até lá, ao aprovar um email ele abre já escrito no teu programa de email.</p>}

      {tab === "fila" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Nada sai sem a tua aprovação. Revê, edita se quiseres, e aprova.</p>{write && emailReady && emailsPending > 1 && <ApproveAll count={emailsPending} />}</div>
          {items.length === 0 ? <Empty>Fila vazia. As mensagens das sequências aparecem aqui no dia em que devem sair.</Empty> : items.map((it) => <QueueItem key={it.id} item={it} emailReady={emailReady} />)}
        </section>
      )}

      {tab === "sequencias" && (
        <section className="flex flex-col gap-4">
          {write && <Disclosure label="+ Nova sequência" primary><div className="max-h-[70vh] overflow-y-auto w-[min(92vw,720px)]"><SeqForm steps={[]} /></div></Disclosure>}
          {((seqs ?? []) as Seq[]).length === 0 ? <Empty>Sem sequências. Carrega em “Criar sequências e regras iniciais”.</Empty> : ((seqs ?? []) as Seq[]).map((s) => {
            const st = ((steps ?? []) as Step[]).filter((x) => x.sequence_id === s.id);
            const en = (enrolls ?? []).filter((e) => e.sequence_id === s.id);
            const active = en.filter((e) => e.status === "active");
            const sent = (sentStats ?? []).filter((o) => o.step_id && st.some((x) => x.id === o.step_id));
            const opened = sent.filter((o) => o.opened_at).length;
            let day = 0;
            return (
              <article key={s.id} className="card flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h2 className="h2">{s.name}</h2>{s.description && <p className="text-sm text-muted">{s.description}</p>}</div>
                  <span className={`chip ${s.active ? "bg-good-soft text-[#1E6B30]" : "bg-[#F2F2F5] text-muted"}`}>{s.active ? "Ativa" : "Pausada"}</span>
                </div>
                <div className="flex flex-wrap gap-2">{st.map((x) => { day += x.delay_days; return <span key={x.id} className="chip bg-[#F2F2F5] text-ink-2">Dia {day} · {CH[x.channel]}</span>; })}</div>
                <div className="flex flex-wrap gap-5 text-sm text-ink-2"><span><strong className="font-semibold">{active.length}</strong> em curso</span><span><strong className="font-semibold">{en.filter((e) => e.status === "completed").length}</strong> concluídas</span><span><strong className="font-semibold">{sent.length}</strong> mensagens enviadas</span>{sent.length > 0 && <span>{Math.round((opened / sent.length) * 100)}% aberturas</span>}</div>
                {active.length > 0 && (
                  <details><summary className="cursor-pointer text-sm font-medium text-accent-ink">Ver quem está em curso</summary>
                    <div className="mt-2 flex flex-col">{active.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 border-b border-[#F0F0F2] py-2 text-sm last:border-0">
                        <Link href={`/crm/contactos/${e.contact_id}`} className="hover:text-accent-ink">{cName.get(e.contact_id) ?? "Contacto"}</Link>
                        <span className="text-xs text-muted">passo {e.next_step} · {dateShort(e.next_run_at)}</span>
                        {write && <form action={stopEnrollment}><input type="hidden" name="id" value={e.id} /><button className="text-xs text-muted hover:text-warn">Parar</button></form>}
                      </div>))}</div>
                  </details>
                )}
                {write && <details><summary className="cursor-pointer text-sm font-medium text-muted">Editar sequência</summary><div className="mt-3"><SeqForm s={s} steps={st} /></div></details>}
              </article>
            );
          })}
        </section>
      )}

      {tab === "regras" && (
        <section className="flex flex-col gap-3">
          {((rules ?? []) as Rule[]).length === 0 && <Empty>Sem regras.</Empty>}
          {((rules ?? []) as Rule[]).map((r) => (
            <article key={r.id} className="card !py-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className={`chip ${r.active ? "bg-good-soft text-[#1E6B30]" : "bg-[#F2F2F5] text-muted"}`}>{r.active ? "Ativa" : "Desligada"}</span>
              </div>
              <p className="text-sm text-ink-2"><span className="text-muted">Quando</span> {TRIGGERS[r.trigger]}{r.trigger_config.stage ? ` “${r.trigger_config.stage}”` : ""}{r.trigger_config.days ? ` (${r.trigger_config.days} dias)` : ""} <span className="text-muted">→</span> {ACTIONS[r.action]}{r.action === "enroll" ? ` “${seqName.get(r.action_config.sequence_id ?? "") ?? "?"}”` : r.action === "task" ? ` “${r.action_config.title}”` : ` “${r.action_config.stage}”`}</p>
              {write && <details><summary className="cursor-pointer text-sm font-medium text-muted">Editar</summary><RuleForm r={r} seqs={(seqs ?? []) as Seq[]} stages={(stages ?? []).map((s) => s.name)} /></details>}
            </article>
          ))}
          {write && <Disclosure label="+ Nova regra" primary><RuleForm seqs={(seqs ?? []) as Seq[]} stages={(stages ?? []).map((s) => s.name)} /></Disclosure>}
        </section>
      )}

      {tab === "newsletter" && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted">Só recebem leads que deram consentimento e clientes (comunicações sobre serviços semelhantes). Quem cancelou nunca recebe. Variáveis: {"{{primeiro_nome}} {{nome}} {{meu_nome}}"}.</p>
          {write && (
            <form action={saveCampaign} className="card flex flex-col gap-3">
              <h2 className="h2">Nova newsletter</h2>
              <label className="flex flex-col gap-1.5"><span className="label">Assunto</span><input name="subject" required className="input" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Mensagem</span><textarea name="body" rows={8} required className="input py-2.5" defaultValue={"Olá {{primeiro_nome}},\n\n\n\nUm abraço,\n{{meu_nome}}"} /></label>
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                <label className="flex flex-col gap-1.5"><span className="label">Para</span><select name="audience" className="input"><option value="all">Leads com consentimento + clientes</option><option value="leads">Só leads</option><option value="clients">Só clientes</option></select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Interessados em</span><select name="product_id" className="input"><option value="">Qualquer produto</option>{(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Origem contém</span><input name="source" placeholder="ex.: instagram" className="input" /></label>
              </div>
              <button className="btn-ghost self-start">Guardar rascunho</button>
            </form>
          )}
          {await Promise.all((campaigns ?? []).map(async (c) => {
            const count = c.status === "draft" ? await previewAudience(c.segment) : 0;
            const st = (sentStats ?? []).filter((o) => o.campaign_id === c.id);
            return (
              <article key={c.id} className="card flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">{c.subject}</h2><span className={`chip ${c.status === "sent" ? "bg-good-soft text-[#1E6B30]" : "bg-[#F2F2F5] text-ink-2"}`}>{c.status === "sent" ? `Enviada ${dateShort(c.sent_at)}` : "Rascunho"}</span></div>
                <p className="whitespace-pre-line text-sm text-ink-2 line-clamp-4">{c.body}</p>
                {c.status === "sent" ? <p className="text-sm text-muted">{st.length} enviados · {st.filter((o) => o.opened_at).length} aberturas · {st.filter((o) => o.clicked_at).length} cliques</p>
                  : write && (emailReady ? <SendCampaign id={c.id} count={count} /> : <p className="text-sm text-muted">{count} destinatário(s). O envio da newsletter precisa do Resend ligado.</p>)}
              </article>
            );
          }))}
          {write && (
            <form action={saveEmailSettings} className="card flex flex-col gap-3">
              <h2 className="h2">Remetente</h2>
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="from_name" defaultValue={sender.from_name ?? org?.signature_name ?? "Thomas Faria"} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="from_email" type="email" defaultValue={sender.from_email ?? "geral@thomasfaria.pt"} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Responder para</span><input name="reply_to" type="email" defaultValue={sender.reply_to ?? ""} placeholder="igual ao email" className="input" /></label>
              </div>
              <button className="btn-ghost self-start">Guardar remetente</button>
            </form>
          )}
        </section>
      )}
    </>
  );
}

function RuleForm({ r, seqs, stages }: { r?: Rule; seqs: Seq[]; stages: string[] }) {
  return (
    <form action={saveRule} className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
      {r && <input type="hidden" name="id" value={r.id} />}
      <label className="col-span-full flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" defaultValue={r?.name} required className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Quando</span><select name="trigger" defaultValue={r?.trigger ?? "form_lead"} className="input">{Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="flex flex-col gap-1.5"><span className="label">Etapa (se aplicável)</span><select name="stage" defaultValue={r?.trigger_config.stage ?? "Proposta"} className="input">{stages.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex flex-col gap-1.5"><span className="label">Dias (se aplicável)</span><input name="days" type="number" min="1" defaultValue={r?.trigger_config.days ?? 14} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Então</span><select name="action" defaultValue={r?.action ?? "enroll"} className="input">{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="flex flex-col gap-1.5"><span className="label">Sequência</span><select name="sequence_id" defaultValue={r?.action_config.sequence_id ?? ""} className="input">{seqs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="flex flex-col gap-1.5"><span className="label">Tarefa (título)</span><input name="task_title" defaultValue={r?.action_config.title ?? "Contactar: {{negocio}}"} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Etapa de destino</span><select name="target_stage" defaultValue={r?.action_config.stage ?? ""} className="input">{stages.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r?.active ?? true} className="h-4 w-4" /> Ativa</label>
      <div className="col-span-full flex gap-3"><button className="btn">Guardar regra</button></div>
      {r && <div className="col-span-full"><button formAction={deleteRule} className="text-sm font-medium text-warn">Apagar regra</button></div>}
    </form>
  );
}
