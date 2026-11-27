import { NextResponse } from "next/server";
import { anonClient } from "@/lib/supabase/anon";
import { createCheckout, stripeConfigured } from "@/lib/stripe";

/** Leva o cliente ao pagamento do sinal (Stripe Checkout) */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = new URL(req.url).origin;
  const back = (q: string) => NextResponse.redirect(`${base}/p/${token}?${q}`, 303);
  if (!/^[0-9a-f-]{36}$/.test(token) || !stripeConfigured()) return back("pagamento=indisponivel");
  const { data } = await anonClient().rpc("public_proposal", { p_token: token, p_count: false });
  const d = data as { p: { status: string; number: string; total: number; vat_rate: number; recurring: boolean; title: string; paid_at: string | null }; deal: { title: string }; pay: { deposit_pct: number } } | null;
  if (!d || d.p.status !== "accepted") return back("pagamento=indisponivel");
  if (d.p.paid_at) return back("pagamento=ok");
  const gross = Number(d.p.total) * (1 + Number(d.p.vat_rate) / 100);
  const amount = d.p.recurring ? gross : gross * Number(d.pay.deposit_pct) / 100;
  try {
    const url = await createCheckout({ amountCents: Math.round(amount * 100), name: `${d.p.recurring ? "1.ª mensalidade" : `Sinal (${d.pay.deposit_pct}%)`} · Proposta ${d.p.number} · ${d.p.title ?? d.deal.title}`, token, successUrl: `${base}/p/${token}?pagamento=ok`, cancelUrl: `${base}/p/${token}?pagamento=cancelado` });
    return NextResponse.redirect(url, 303);
  } catch { return back("pagamento=erro"); }
}
