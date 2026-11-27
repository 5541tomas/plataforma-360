import { anonClient } from "@/lib/supabase/anon";
import { internalSecret, verifyStripe } from "@/lib/stripe";

/** Stripe → pagamento concluído → proposta paga e cobrança marcada como recebida */
export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyStripe(payload, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET ?? "")) return new Response("assinatura inválida", { status: 400 });
  const ev = JSON.parse(payload) as { type: string; data: { object: { id: string; amount_total: number; payment_status: string; metadata?: { proposal_token?: string } } } };
  const o = ev.data.object;
  if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && o.payment_status === "paid" && o.metadata?.proposal_token) {
    const { error } = await anonClient().rpc("proposal_mark_paid", { p_token: o.metadata.proposal_token, p_amount: o.amount_total / 100, p_ref: o.id, p_secret: internalSecret() });
    if (error) return new Response(error.message, { status: 500 });
  }
  return new Response("ok");
}
