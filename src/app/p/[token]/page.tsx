import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { ProposalDoc } from "@/components/ProposalDoc";
import { AcceptProposal } from "@/components/AcceptProposal";
import { PrintButton } from "@/components/PrintButton";
import { eur2 } from "@/lib/format";
import { PaymentPanel } from "@/components/PaymentPanel";
import { stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposta", robots: { index: false } };

export default async function PublicProposal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string; pagamento?: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/.test(token)) notFound();
  const sp = await searchParams;
  const { data } = await anonClient().rpc("public_proposal", { p_token: token, p_count: sp.preview !== "1" });
  const d = data as { p: Record<string, unknown> & { status: string; total: number; vat_rate: number; recurring: boolean; accent?: string; accepted_at?: string; accepted_name?: string; valid_until?: string }; org: Record<string, unknown>; deal: { contact_name?: string }; prepared_by: string; pay: { enabled: boolean; deposit_pct: number; mbway: string | null; iban: string | null; holder: string | null; paid_at: string | null; paid_amount: number | null; claimed_at: string | null } } | null;
  if (!d) notFound();
  const p = d.p, accent = (p.accent as string) || "#0071E3";
  const total = `${eur2(Number(p.total) * (1 + Number(p.vat_rate) / 100))}${p.recurring ? "/mês" : ""} (IVA incl.)`;
  const expired = p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10);
  const toolbar = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur">
      {p.status === "accepted" ? <span className="text-sm font-semibold text-good">✓ Aceite por {p.accepted_name}{p.accepted_at ? ` a ${new Date(p.accepted_at).toLocaleDateString("pt-PT")}` : ""}</span>
        : expired ? <span className="text-sm text-warn">Proposta expirada — pede uma versão atualizada.</span>
        : <span className="text-sm text-ink-2">Total: <strong>{total}</strong></span>}
      <div className="flex items-center gap-2"><PrintButton label="PDF" />{p.status === "sent" && !expired && <AcceptProposal token={token} total={total} accent={accent} suggested={d.deal?.contact_name} />}</div>
    </div>
  );
  const gross = Number(p.total) * (1 + Number(p.vat_rate) / 100);
  const due = p.recurring ? gross : gross * Number(d.pay.deposit_pct) / 100;
  const banner = p.status === "accepted" && (d.pay.paid_at || (d.pay.enabled && (d.pay.iban || d.pay.mbway || stripeConfigured()))) ? (
    <PaymentPanel token={token} accent={accent} pay={{ amount: eur2(due), label: p.recurring ? "1.ª mensalidade" : Number(d.pay.deposit_pct) >= 100 ? "Pagamento" : `Sinal de ${d.pay.deposit_pct}%`, iban: d.pay.iban, holder: d.pay.holder, mbway: d.pay.mbway,
      ref: `Proposta ${String(p.number)}`, stripe: stripeConfigured(), paid: !!d.pay.paid_at, claimed: !!d.pay.claimed_at, status: sp.pagamento }} />
  ) : undefined;
  return <ProposalDoc p={p} org={d.org} deal={d.deal} preparedBy={d.prepared_by} toolbar={toolbar} banner={banner} />;
}
