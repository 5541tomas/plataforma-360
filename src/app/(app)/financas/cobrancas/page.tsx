import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur2, dateShort, today } from "@/lib/format";
import { Disclosure, Empty, PageHeader } from "@/components/ui";
import { WaIcon } from "@/components/WhatsAppMenu";
import { waLink } from "@/lib/whatsapp";
import { addReceivable, cancelReceivable, markReceived, reopenReceivable } from "./actions";

type R = { id: string; description: string; amount: number; due_date: string; received_at: string | null; status: string; deal_id: string | null; transaction_id: string | null };
type DealInfo = { id: string; title: string; company_name: string | null; contact_name: string | null; contact_phone: string | null };

export default async function CobrancasPage() {
  const ctx = await requireModule("finance");
  const write = canWrite(ctx, "finance");
  const supabase = await createClient();
  await supabase.rpc("sync_receivables", { p_org: ctx.org.id });
  const t = today();
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const monthStart = t.slice(0, 8) + "01";
  const [{ data: rows }, { data: openDeals }] = await Promise.all([
    supabase.from("receivables").select("id, description, amount, due_date, received_at, status, deal_id, transaction_id").eq("org_id", ctx.org.id).neq("status", "cancelled").order("due_date"),
    supabase.from("v_deals").select("id, title").eq("org_id", ctx.org.id).eq("status", "won").order("won_at", { ascending: false }).limit(50),
  ]);
  const all = (rows ?? []) as R[];
  const dealIds = [...new Set(all.map((r) => r.deal_id).filter(Boolean))] as string[];
  const { data: deals } = dealIds.length ? await supabase.from("v_deals").select("id, title, company_name, contact_name, contact_phone").in("id", dealIds) : { data: [] };
  const dealBy = new Map(((deals ?? []) as DealInfo[]).map((d) => [d.id, d]));
  const overdue = all.filter((r) => r.status === "open" && r.due_date < t);
  const upcoming = all.filter((r) => r.status === "open" && r.due_date >= t && r.due_date <= in30);
  const later = all.filter((r) => r.status === "open" && r.due_date > in30);
  const received = all.filter((r) => r.status === "received").sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? "")).slice(0, 12);
  const sum = (x: R[]) => x.reduce((s, r) => s + Number(r.amount), 0);
  const receivedMonth = all.filter((r) => r.status === "received" && (r.received_at ?? "") >= monthStart);
  const onTime = all.filter((r) => r.status === "received" && r.received_at && r.received_at <= r.due_date).length;
  const totalReceived = all.filter((r) => r.status === "received").length;
  const daysLate = (d: string) => Math.round((new Date(t).getTime() - new Date(d).getTime()) / 864e5);

  const Row = ({ r, kind }: { r: R; kind: "overdue" | "upcoming" | "received" | "later" }) => {
    const d = r.deal_id ? dealBy.get(r.deal_id) : undefined;
    const who = d?.company_name ?? d?.contact_name ?? null;
    const msg = `Olá${d?.contact_name ? ` ${d.contact_name.split(" ")[0]}` : ""}, espero que esteja tudo bem. Só para lembrar o pagamento de "${r.description}" no valor de ${eur2(r.amount)}, com vencimento a ${dateShort(r.due_date)}. Se já tiver tratado, ignore esta mensagem. Obrigado! ${ctx.name.split(" ")[0]}`;
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-[#F0F0F2] py-3 last:border-0">
        <div className="flex min-w-[200px] flex-1 flex-col">
          <span className="text-sm font-medium">{r.description}</span>
          <span className="text-xs text-muted">{[who, d ? <Link key="d" href={`/crm/${d.id}`} className="text-accent-ink">ver negócio</Link> : null].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</span>
        </div>
        <span className={`text-xs ${kind === "overdue" ? "font-semibold text-warn" : "text-muted"}`}>
          {kind === "overdue" ? `${daysLate(r.due_date)} dias em atraso` : kind === "received" ? `recebido ${dateShort(r.received_at!)}${r.transaction_id ? " · banco" : ""}` : `vence ${dateShort(r.due_date)}`}
        </span>
        <span className="min-w-[96px] text-right text-sm font-semibold">{eur2(r.amount)}</span>
        {write && kind !== "received" && (
          <div className="flex items-center gap-1">
            {kind === "overdue" && <a href={waLink(d?.contact_phone, msg)} target="_blank" rel="noopener noreferrer" aria-label="Lembrete de pagamento por WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-lg text-[#128C4A] hover:bg-good-soft"><WaIcon size={18} /></a>}
            <form action={markReceived}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost !min-h-9 !px-3 !text-xs">Recebido</button></form>
            <form action={cancelReceivable}><input type="hidden" name="id" value={r.id} /><button aria-label={`Anular ${r.description}`} className="h-9 w-9 rounded-lg text-muted hover:bg-soft hover:text-warn">×</button></form>
          </div>
        )}
        {write && kind === "received" && !r.transaction_id && <form action={reopenReceivable}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-muted hover:text-ink">Desfazer</button></form>}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Cobranças">
        {write && (
          <Disclosure label="+ Valor a receber" primary>
            <form action={addReceivable} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Descrição</span><input name="description" required className="input" placeholder="Ex.: Fatura 12/2026 — Atlântico" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Valor com IVA (€)</span><input name="amount" type="number" step="0.01" min="0" required className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Vencimento</span><input name="due_date" type="date" required defaultValue={t} className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Negócio (opcional)</span><select name="deal_id" className="input"><option value="">—</option>{(openDeals ?? []).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
              <button className="btn">Guardar</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>
      <p className="-mt-3 text-sm text-muted">Criado automaticamente: cada avença gera um valor a receber por mês e cada serviço pontual ganho gera um a 15 dias (com IVA). Quando importas o extrato, os recebimentos são reconhecidos sozinhos.</p>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Em atraso</span><span className={`text-[28px] font-bold tracking-[-0.7px] ${overdue.length ? "text-warn" : ""}`}>{eur2(sum(overdue))}</span><span className="text-xs text-muted">{overdue.length} pagamento(s)</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">A receber · 30 dias</span><span className="text-[28px] font-bold tracking-[-0.7px]">{eur2(sum(upcoming))}</span><span className="text-xs text-muted">{upcoming.length} pagamento(s)</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Recebido este mês</span><span className="text-[28px] font-bold tracking-[-0.7px] text-good">{eur2(sum(receivedMonth))}</span><span className="text-xs text-muted">{receivedMonth.length} pagamento(s)</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Pagos a tempo</span><span className="text-[28px] font-bold tracking-[-0.7px]">{totalReceived ? `${Math.round((onTime / totalReceived) * 100)}%` : "—"}</span><span className="text-xs text-muted">dos recebimentos</span></div>
      </section>

      {all.length === 0 ? <Empty>Ainda não há nada a receber. As avenças e os serviços pontuais ganhos aparecem aqui automaticamente.</Empty> : (<>
        {overdue.length > 0 && <section className="card flex flex-col"><h2 className="h2 mb-1 text-warn">Em atraso</h2>{overdue.map((r) => <Row key={r.id} r={r} kind="overdue" />)}</section>}
        <section className="card flex flex-col"><h2 className="h2 mb-1">Próximos 30 dias</h2>{upcoming.length ? upcoming.map((r) => <Row key={r.id} r={r} kind="upcoming" />) : <Empty>Nada a vencer nos próximos 30 dias.</Empty>}</section>
        {later.length > 0 && <section className="card flex flex-col"><h2 className="h2 mb-1">Mais tarde</h2>{later.map((r) => <Row key={r.id} r={r} kind="later" />)}</section>}
        {received.length > 0 && <section className="card flex flex-col"><h2 className="h2 mb-1">Recebidos recentemente</h2>{received.map((r) => <Row key={r.id} r={r} kind="received" />)}</section>}
      </>)}
    </>
  );
}
