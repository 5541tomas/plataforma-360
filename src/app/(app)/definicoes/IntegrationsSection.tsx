import { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/context";
import { emailConfigured } from "@/lib/email";
import { stripeConfigured, internalSecret } from "@/lib/stripe";
import { headers } from "next/headers";
import { InternalKeyButton, TestEmailButton } from "@/components/IntegrationButtons";
import { CopyLink } from "@/components/CopyLink";
import { saveDigest, saveNotify, savePayments } from "./integration-actions";

const Dot = ({ on, label }: { on: boolean; label: string }) => (
  <span className={`chip ${on ? "bg-good-soft text-[#1E6B30]" : "bg-[#F2F2F5] text-muted"}`}>{on ? "✓ " : ""}{label}</span>
);

/** Pagamentos, envio de email, resumo diário e chave interna do servidor */
export async function IntegrationsSection({ ctx }: { ctx: AppContext }) {
  const supabase = await createClient();
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [{ data: org }, keyOk] = await Promise.all([
    supabase.from("organizations").select("settings, iban").eq("id", ctx.org.id).single(),
    internalSecret() ? supabase.rpc("internal_secret_matches", { p_org: ctx.org.id, p_secret: internalSecret() }).then((r) => !!r.data) : Promise.resolve(false),
  ]);
  const st = (org?.settings ?? {}) as { payments?: { enabled?: boolean; deposit_pct?: number; mbway?: string | null }; digest?: { enabled?: boolean; email?: string | null }; notify?: { leads?: boolean } };
  const resend = emailConfigured(), stripe = stripeConfigured(), hook = !!process.env.STRIPE_WEBHOOK_SECRET;
  return (
    <section className="card flex flex-col gap-6">
      <div><h2 className="h2">Pagamentos, email e resumo diário</h2><p className="text-sm text-muted">Ligações do servidor. As chaves (Stripe, Resend) ficam no Netlify, nunca aqui.</p></div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">Pagamento do sinal nas propostas</h3><Dot on={!!st.payments?.enabled} label={st.payments?.enabled ? "Visível para o cliente" : "Desligado — o cliente só aceita"} /></div>
        <form action={savePayments} className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <label className="col-span-full flex items-center gap-2 text-sm"><input type="checkbox" name="pay_enabled" defaultChecked={!!st.payments?.enabled} className="h-4 w-4" /> Mostrar ao cliente como pagar o sinal depois de aceitar a proposta</label>
          <label className="flex flex-col gap-1.5"><span className="label">Sinal (% do total, serviços pontuais)</span><input name="deposit_pct" type="number" min="0" max="100" defaultValue={st.payments?.deposit_pct ?? 50} className="input" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Número MB WAY</span><input name="mbway" defaultValue={st.payments?.mbway ?? ""} placeholder="912 345 678" className="input" /></label>
          <div className="flex flex-col gap-1.5"><span className="label">IBAN (dos dados da empresa)</span><span className="flex min-h-11 items-center text-sm">{org?.iban || <span className="text-warn">Sem IBAN — preenche em Empresa</span>}</span></div>
          <button className="btn-ghost self-end">Guardar</button>
        </form>
        <p className="text-xs text-muted">Desligado: o cliente aceita e tu tratas do pagamento (fatura, contacto). Ligado: depois de aceitar a proposta online, o cliente vê o valor a pagar, o IBAN e o MB WAY e pode carregar em “Já paguei” (crias-te uma tarefa para confirmar). Avenças: paga a 1.ª mensalidade.</p>
        <details className="rounded-xl border border-line p-3 text-sm"><summary className="cursor-pointer font-medium">Ligar o Stripe (cartão e MB WAY com confirmação automática)</summary>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-ink-2">
            <li>Cria conta em stripe.com e ativa os métodos <strong>Cartão</strong> e <strong>MB WAY</strong> (Settings → Payment methods).</li>
            <li>Developers → API keys → copia a <strong>Secret key</strong> → Netlify: variável <strong>STRIPE_SECRET_KEY</strong> (secret).</li>
            <li>Developers → Webhooks → Add endpoint com o link abaixo, evento <strong>checkout.session.completed</strong> → copia o <strong>Signing secret</strong> → Netlify: <strong>STRIPE_WEBHOOK_SECRET</strong>.</li>
            <li>Gera a chave interna (abaixo) e põe-na no Netlify como <strong>APP_INTERNAL_SECRET</strong>. Faz novo deploy.</li>
          </ol>
          <div className="mt-2"><CopyLink url={`${base}/api/stripe/webhook`} /></div>
          <div className="mt-2 flex flex-wrap gap-2"><Dot on={stripe} label="STRIPE_SECRET_KEY" /><Dot on={hook} label="STRIPE_WEBHOOK_SECRET" /><Dot on={keyOk} label="APP_INTERNAL_SECRET" /></div>
        </details>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">Envio de email (Resend)</h3><Dot on={resend} label={resend ? "Ligado" : "Por ligar"} /></div>
        {resend ? <TestEmailButton /> : (
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-2">
            <li>Cria conta em resend.com → <strong>Domains</strong> → adiciona <strong>thomasfaria.pt</strong> e copia os registos DNS para o painel do teu domínio.</li>
            <li><strong>API Keys</strong> → cria uma chave → Netlify: variável <strong>RESEND_API_KEY</strong> (secret) e faz novo deploy.</li>
            <li>Volta aqui e carrega em “Enviar email de teste”.</li>
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">Resumo do dia às 8h</h3><Dot on={!!st.digest?.enabled && resend && keyOk} label={st.digest?.enabled ? (resend && keyOk ? "Ativo" : "Ativo — falta ligar o email e a chave interna") : "Desligado"} /></div>
        <form action={saveDigest} className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="digest_enabled" defaultChecked={!!st.digest?.enabled} className="h-4 w-4" /> Receber todas as manhãs</label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5"><span className="label">Para o email</span><input name="digest_email" type="email" defaultValue={st.digest?.email ?? ctx.email} className="input" /></label>
          <button className="btn-ghost">Guardar</button>
        </form>
        <p className="text-xs text-muted">Reuniões do dia, mensagens por aprovar, tarefas, leads quentes, cobranças em atraso e a meta do mês — num email curto.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">Alerta de nova lead</h3><Dot on={st.notify?.leads !== false && resend} label={st.notify?.leads === false ? "Desligado" : resend ? "Ativo" : "Ativo — falta ligar o email"} /></div>
        <form action={saveNotify} className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="leads" defaultChecked={st.notify?.leads !== false} className="h-4 w-4" /> Avisar-me por email no momento em que alguém pede o guia, faz o teste ou marca reunião</label>
          <button className="btn-ghost">Guardar</button>
        </form>
        <p className="text-xs text-muted">Vai para o email do resumo diário. Responder nos primeiros 5 minutos multiplica as hipóteses de fechar.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">Chave interna do servidor</h3><Dot on={keyOk} label={keyOk ? "Configurada" : internalSecret() ? "Não corresponde — gera de novo" : "Por configurar"} /></div>
        <p className="text-sm text-muted">Permite ao servidor confirmar pagamentos do Stripe e enviar o resumo diário sem acesso total à base de dados.</p>
        <InternalKeyButton exists={keyOk} />
      </div>
    </section>
  );
}
