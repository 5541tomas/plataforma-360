import crypto from "crypto";
// Stripe sem SDK: Checkout Session + verificação da assinatura do webhook
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const internalSecret = () => process.env.APP_INTERNAL_SECRET ?? "";

export async function createCheckout(o: { amountCents: number; name: string; email?: string | null; token: string; successUrl: string; cancelUrl: string }) {
  const body = new URLSearchParams({
    mode: "payment", success_url: o.successUrl, cancel_url: o.cancelUrl, locale: "pt",
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(o.amountCents), "line_items[0][price_data][product_data][name]": o.name.slice(0, 200),
    "metadata[proposal_token]": o.token, "payment_intent_data[metadata][proposal_token]": o.token,
  });
  if (o.email) body.set("customer_email", o.email);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = (await r.json()) as { url?: string; error?: { message: string } };
  if (!r.ok || !j.url) throw new Error(j.error?.message ?? `Stripe recusou o pedido (${r.status})`);
  return j.url;
}

/** Verifica o cabeçalho Stripe-Signature (t=…,v1=…) com o segredo do webhook */
export function verifyStripe(payload: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => { const [k, ...v] = kv.split("="); return [k, v.join("=")]; }));
  const sigs = header.split(",").filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
