"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimPaid } from "@/app/p/[token]/actions";

type Pay = { amount: string; label: string; iban?: string | null; holder?: string | null; mbway?: string | null; ref: string; stripe: boolean; paid: boolean; claimed: boolean; status?: string };

/** Pagamento do sinal depois de aceitar a proposta */
export function PaymentPanel({ token, accent, pay }: { token: string; accent: string; pay: Pay }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState("");
  const router = useRouter();
  const copy = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(""), 1500); } catch { /* sem acesso */ } };
  if (pay.paid || pay.status === "ok") return <div className="rounded-2xl bg-good-soft px-5 py-4 text-sm font-medium text-[#1E6B30]">✓ Pagamento recebido. Obrigado — vamos começar!</div>;
  if (pay.claimed) return <div className="rounded-2xl bg-white px-5 py-4 text-sm text-ink-2 shadow-sm">Obrigado! Assim que o pagamento for confirmado recebes a confirmação e marcamos o arranque.</div>;
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><div className="text-xs font-semibold uppercase tracking-[0.8px] text-muted">Próximo passo</div><h2 className="text-xl font-bold tracking-[-0.3px]">{pay.label}: {pay.amount}</h2></div>
        {pay.status === "cancelado" && <span className="text-sm text-warn">O pagamento foi cancelado. Podes tentar de novo.</span>}
        {pay.status === "erro" && <span className="text-sm text-warn">Não foi possível abrir o pagamento. Usa a transferência ou o MB WAY.</span>}
      </div>
      {pay.stripe && <a href={`/api/pay/${token}`} className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-[15px] font-semibold text-white" style={{ background: accent }}>Pagar agora (cartão ou MB WAY)</a>}
      <div className="grid gap-3 sm:grid-cols-2">
        {pay.iban && (
          <div className="flex flex-col gap-1 rounded-xl border border-line p-4 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.6px] text-muted">Transferência bancária</span>
            <span className="font-mono text-[13px]">{pay.iban}</span>
            {pay.holder && <span className="text-muted">Titular: {pay.holder}</span>}
            <span className="text-muted">Descritivo: {pay.ref}</span>
            <button type="button" onClick={() => copy("iban", pay.iban!)} className="self-start text-sm font-medium text-accent-ink">{copied === "iban" ? "Copiado ✓" : "Copiar IBAN"}</button>
          </div>
        )}
        {pay.mbway && (
          <div className="flex flex-col gap-1 rounded-xl border border-line p-4 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.6px] text-muted">MB WAY</span>
            <span className="text-[17px] font-semibold tabular-nums">{pay.mbway}</span>
            <span className="text-muted">Valor: {pay.amount}</span>
            <button type="button" onClick={() => copy("mb", pay.mbway!)} className="self-start text-sm font-medium text-accent-ink">{copied === "mb" ? "Copiado ✓" : "Copiar número"}</button>
          </div>
        )}
      </div>
      {(pay.iban || pay.mbway) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Já pagaste?</span>
          {pay.iban && <button disabled={pending} onClick={() => start(async () => { await claimPaid(token, "transferência"); router.refresh(); })} className="btn-ghost !min-h-10">Já fiz a transferência</button>}
          {pay.mbway && <button disabled={pending} onClick={() => start(async () => { await claimPaid(token, "MB WAY"); router.refresh(); })} className="btn-ghost !min-h-10">Já paguei por MB WAY</button>}
        </div>
      )}
    </section>
  );
}
