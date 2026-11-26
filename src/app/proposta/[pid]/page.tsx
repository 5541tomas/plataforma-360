import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { eur2 } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import type { Item } from "@/lib/proposals";

export const metadata = { title: "Proposta" };
const longDate = (s: string) => new Date(s).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });

export default async function PrintProposal({ params }: { params: Promise<{ pid: string }> }) {
  const ctx = await requireModule("crm");
  const { pid } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", pid).eq("org_id", ctx.org.id).maybeSingle();
  if (!p) notFound();
  const [{ data: org }, { data: deal }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", ctx.org.id).single(),
    supabase.from("v_deals").select("title, company_name, contact_id, duration_months").eq("id", p.deal_id).single(),
  ]);
  const { data: contact } = deal?.contact_id ? await supabase.from("contacts").select("name, email").eq("id", deal.contact_id).maybeSingle() : { data: null };
  const items = (p.items ?? []) as Item[];
  const vat = Number(p.total) * Number(p.vat_rate) / 100;
  const per = p.recurring ? " /mês" : "";

  return (
    <div className="min-h-screen bg-[#E8E8ED] py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 16mm; } @media print { .no-print { display: none !important } body { background: #fff } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-between px-4">
        <a href={`/crm/${p.deal_id}/proposta/${p.id}`} className="btn-ghost">‹ Editar</a>
        <PrintButton />
      </div>
      <article className="mx-auto flex max-w-[210mm] flex-col gap-8 bg-white px-[16mm] py-[18mm] text-[13px] leading-relaxed text-ink shadow-xl print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white print:[print-color-adjust:exact]">{(org?.name ?? "").slice(0, 2).toUpperCase()}</div>
            <div><div className="text-base font-semibold">{org?.legal_name || org?.name}</div>
              <div className="text-xs text-muted">{[org?.nif && `NIF ${org.nif}`, org?.website].filter(Boolean).join(" · ")}</div></div>
          </div>
          <div className="text-right text-xs text-muted"><div className="text-sm font-semibold text-ink">Proposta {p.number}</div><div>{longDate(p.created_at)}</div>{p.valid_until && <div>Válida até {longDate(p.valid_until)}</div>}</div>
        </header>

        <section className="flex flex-col gap-1">
          <div className="text-xs uppercase tracking-[0.6px] text-muted">Para</div>
          <div className="font-semibold">{deal?.company_name ?? contact?.name ?? "—"}</div>
          {contact && <div className="text-muted">{contact.name}{contact.email ? ` · ${contact.email}` : ""}</div>}
        </section>

        <section className="flex flex-col gap-3">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.5px]">{p.title}</h1>
          {p.intro && <p className="whitespace-pre-line text-ink-2">{p.intro}</p>}
        </section>

        <table className="w-full border-collapse">
          <thead><tr className="border-b-2 border-ink text-left text-xs uppercase tracking-[0.5px] text-muted">
            <th className="py-2 font-medium">Serviço</th><th className="py-2 text-right font-medium w-16">Qtd.</th><th className="py-2 text-right font-medium w-32">Preço</th><th className="py-2 text-right font-medium w-32">Total</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-3 pr-4">{it.descricao}</td><td className="py-3 text-right">{it.qtd}</td>
                <td className="py-3 text-right whitespace-nowrap">{eur2(it.preco)}</td><td className="py-3 text-right whitespace-nowrap font-medium">{eur2(it.qtd * it.preco)}{per}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto flex w-72 flex-col gap-1.5">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{eur2(p.total)}{per}</span></div>
          <div className="flex justify-between"><span className="text-muted">IVA ({Number(p.vat_rate)}%)</span><span>{eur2(vat)}{per}</span></div>
          <div className="flex justify-between border-t-2 border-ink pt-2 text-base font-bold"><span>Total</span><span>{eur2(Number(p.total) + vat)}{per}</span></div>
          {p.recurring && deal?.duration_months && <div className="text-right text-xs text-muted">{deal.duration_months} meses · {eur2(Number(p.total) * deal.duration_months)} + IVA no total</div>}
        </div>

        {p.terms && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-xs uppercase tracking-[0.6px] text-muted">Condições</h2>
            <p className="whitespace-pre-line text-ink-2">{p.terms}</p>
          </section>
        )}

        <footer className="mt-auto flex flex-wrap justify-between gap-4 border-t border-line pt-4 text-xs text-muted">
          <span>{[org?.address, org?.email, org?.phone].filter(Boolean).join(" · ")}</span>
          {org?.iban && <span>IBAN {org.iban}</span>}
        </footer>
      </article>
    </div>
  );
}
