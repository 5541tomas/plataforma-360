import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { eur } from "@/lib/format";
import { Disclosure, PageHeader } from "@/components/ui";
import { Scenario } from "@/components/Scenario";
import { saveTaxSettings } from "./actions";

type Tax = { regime: "empresa" | "independente"; iva: number; irc: number; irs: number; ss: number; reserva_meses: number; iva_despesas: boolean };
const DEF: Tax = { regime: "empresa", iva: 23, irc: 20, irs: 25, ss: 21.4, reserva_meses: 3, iva_despesas: true };

export default async function ImpostosPage() {
  const ctx = await requireModule("finance");
  const supabase = await createClient();
  const now = new Date();
  const y = now.getFullYear(), q = Math.floor(now.getMonth() / 3);
  const yStart = `${y}-01-01`, qStart = new Date(Date.UTC(y, q * 3, 1)).toISOString().slice(0, 10);
  const m3 = new Date(Date.UTC(y, now.getMonth() - 3, 1)).toISOString().slice(0, 10), mNow = new Date(Date.UTC(y, now.getMonth(), 1)).toISOString().slice(0, 10);

  const [{ data: org }, { data: accounts }, { data: recurring }, { data: cats }] = await Promise.all([
    supabase.from("organizations").select("settings").eq("id", ctx.org.id).single(),
    supabase.from("v_account_balances").select("id, scope, type, balance").eq("org_id", ctx.org.id).eq("scope", "business"),
    supabase.from("recurring").select("id, description, amount, scope").eq("org_id", ctx.org.id).eq("active", true).eq("scope", "business"),
    supabase.from("categories").select("id, name").eq("org_id", ctx.org.id).eq("scope", "business"),
  ]);
  const tax: Tax = { ...DEF, ...((org?.settings as { tax?: Partial<Tax> })?.tax ?? {}) };
  const accIds = (accounts ?? []).map((a) => a.id);
  const { data: tx } = accIds.length
    ? await supabase.from("transactions").select("date, amount, is_transfer, category_id").in("account_id", accIds).gte("date", m3 < yStart ? m3 : yStart)
    : { data: [] };
  const salaryCat = new Set((cats ?? []).filter((c) => /sal[aá]rio/i.test(c.name)).map((c) => c.id));
  const taxCat = new Set((cats ?? []).filter((c) => /impost|seguran/i.test(c.name)).map((c) => c.id));
  const rows = (tx ?? []).filter((t) => !t.is_transfer);
  const sum = (f: (t: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, t) => s + Number(t.amount), 0);
  const vatOf = (gross: number) => gross * tax.iva / (100 + tax.iva);

  // Ano até hoje
  const incY = sum((t) => t.date >= yStart && t.amount > 0);
  const expY = -sum((t) => t.date >= yStart && t.amount < 0 && !salaryCat.has(t.category_id ?? "") && !taxCat.has(t.category_id ?? ""));
  const salY = -sum((t) => t.date >= yStart && t.amount < 0 && salaryCat.has(t.category_id ?? ""));
  // Trimestre atual (IVA)
  const incQ = sum((t) => t.date >= qStart && t.amount > 0);
  const expQ = -sum((t) => t.date >= qStart && t.amount < 0 && !salaryCat.has(t.category_id ?? "") && !taxCat.has(t.category_id ?? ""));
  const ivaQ = Math.max(0, vatOf(incQ) - (tax.iva_despesas ? vatOf(expQ) : 0));
  const ivaY = Math.max(0, vatOf(incY) - (tax.iva_despesas ? vatOf(expY) : 0));
  const baseY = incY - vatOf(incY) - (expY - (tax.iva_despesas ? vatOf(expY) : 0)) - salY;
  const incomeTaxY = tax.regime === "empresa"
    ? Math.max(0, baseY) * tax.irc / 100
    : Math.max(0, (incY - vatOf(incY)) * 0.75) * tax.irs / 100;
  const ssY = tax.regime === "independente" ? (incY - vatOf(incY)) * 0.7 * tax.ss / 100 : 0;
  const reservedTotal = ivaY + incomeTaxY + ssY;

  // Por cada 1 000 € recebidos
  const k = 1000, kIva = vatOf(k), kNet = k - kIva;
  const kIncome = tax.regime === "empresa" ? kNet * tax.irc / 100 : kNet * 0.75 * tax.irs / 100;
  const kSs = tax.regime === "independente" ? kNet * 0.7 * tax.ss / 100 : 0;
  const kYours = k - kIva - kIncome - kSs;

  // Tesouraria e salário sustentável (últimos 3 meses completos)
  const liquid = (accounts ?? []).filter((a) => ["checking", "savings", "cash"].includes(a.type)).reduce((s, a) => s + Number(a.balance), 0);
  const in3 = sum((t) => t.date >= m3 && t.date < mNow && t.amount > 0) / 3;
  const out3 = -sum((t) => t.date >= m3 && t.date < mNow && t.amount < 0 && !salaryCat.has(t.category_id ?? "") && !taxCat.has(t.category_id ?? "")) / 3;
  const recIn = (recurring ?? []).filter((r) => r.amount > 0).reduce((s, r) => s + Number(r.amount), 0);
  const recOut = -(recurring ?? []).filter((r) => r.amount < 0).reduce((s, r) => s + Number(r.amount), 0);
  const fixedOut = Math.max(recOut, 0);
  const variableOut = Math.max(0, out3 - fixedOut);
  const reserveOps = tax.reserva_meses * (fixedOut + variableOut);
  const free = liquid - reservedTotal - reserveOps;
  const monthlyMargin = Math.max(in3, recIn) - vatOf(Math.max(in3, recIn)) - (out3 - (tax.iva_despesas ? vatOf(out3) : 0));
  const afterTax = tax.regime === "empresa" ? monthlyMargin * (1 - tax.irc / 100) : monthlyMargin;
  const sustainable = Math.max(0, afterTax + Math.min(0, free) / 6);
  const gross = tax.regime === "empresa" ? sustainable / 1.2375 : sustainable;

  return (
    <>
      <PageHeader eyebrow="Finanças da empresa" title="Impostos e salário sustentável">
        <Link href="/financas?s=business" className="btn-ghost">‹ Finanças</Link>
        <Disclosure label="Regime e taxas">
          <form action={saveTaxSettings} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5"><span className="label">Regime</span>
              <select name="regime" defaultValue={tax.regime} className="input"><option value="empresa">Empresa (Lda/Unipessoal · IRC)</option><option value="independente">Trabalhador independente (IRS · SS)</option></select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">IVA (%)</span><input name="iva" type="number" step="0.1" defaultValue={tax.iva} className="input" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">IRC efetivo (%)</span><input name="irc" type="number" step="0.1" defaultValue={tax.irc} className="input" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">IRS efetivo (%)</span><input name="irs" type="number" step="0.1" defaultValue={tax.irs} className="input" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Segurança Social (%)</span><input name="ss" type="number" step="0.1" defaultValue={tax.ss} className="input" /></label>
            </div>
            <label className="flex flex-col gap-1.5"><span className="label">Meses de despesas em reserva</span><input name="reserva_meses" type="number" min="0" defaultValue={tax.reserva_meses} className="input" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="iva_despesas" defaultChecked={tax.iva_despesas} className="h-4 w-4" /> Deduzir IVA das despesas</label>
            <p className="text-xs text-muted">Usa as taxas que o teu contabilista te indicar. IVA a 0% se fores isento.</p>
            <button className="btn">Guardar</button>
          </form>
        </Disclosure>
      </PageHeader>
      <p className="-mt-3 text-sm text-muted">Estimativas com base nos movimentos das contas da empresa. Confirma sempre os valores com o teu contabilista.</p>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Por cada 1 000 € que recebes</span><span className="text-[30px] font-bold tracking-[-0.8px] text-good">{eur(kYours)} são teus</span>
          <span className="text-xs text-muted">IVA {eur(kIva)} · {tax.regime === "empresa" ? `IRC ${eur(kIncome)}` : `IRS ${eur(kIncome)} · SS ${eur(kSs)}`}</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">IVA a entregar · T{q + 1}</span><span className="text-[30px] font-bold tracking-[-0.8px]">{eur(ivaQ)}</span><span className="text-xs text-muted">liquidado {eur(vatOf(incQ))}{tax.iva_despesas ? ` − dedutível ${eur(vatOf(expQ))}` : ""}</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">{tax.regime === "empresa" ? "IRC estimado" : "IRS + SS estimados"} · {y}</span><span className="text-[30px] font-bold tracking-[-0.8px]">{eur(incomeTaxY + ssY)}</span><span className="text-xs text-muted">sobre um resultado de {eur(baseY)} até hoje</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Total a reservar para impostos</span><span className="text-[30px] font-bold tracking-[-0.8px] text-warn">{eur(reservedTotal)}</span><span className="text-xs text-muted">IVA do ano {eur(ivaY)} (inclui trimestres já entregues — ajusta com o contabilista)</span></div>
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Dinheiro realmente disponível</h2>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between"><span>Saldo das contas da empresa</span><strong className="font-semibold">{eur(liquid)}</strong></div>
            <div className="flex justify-between text-ink-2"><span>− Reserva para impostos</span><span>{eur(reservedTotal)}</span></div>
            <div className="flex justify-between text-ink-2"><span>− Reserva de {tax.reserva_meses} meses de despesas</span><span>{eur(reserveOps)}</span></div>
            <div className={`flex justify-between border-t border-line pt-2 text-base font-bold ${free < 0 ? "text-warn" : "text-good"}`}><span>Livre</span><span>{eur(free)}</span></div>
          </div>
        </div>
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Salário sustentável</h2>
          <div className="text-[30px] font-bold tracking-[-0.8px]">{eur(gross)}<span className="text-sm font-medium text-muted"> /mês {tax.regime === "empresa" ? "bruto" : "a retirar"}</span></div>
          <p className="text-sm text-ink-2">
            {tax.regime === "empresa" ? `Custo total para a empresa ${eur(sustainable)} (inclui TSU 23,75%). ` : ""}
            Baseado na margem média dos últimos 3 meses ({eur(monthlyMargin)}/mês sem IVA){free < 0 ? ", ajustado porque as reservas não estão cobertas" : ""}.
          </p>
          <p className="text-xs text-muted">Recorrente contratado: {eur(recIn)}/mês · despesas fixas {eur(fixedOut)}/mês · variáveis ≈ {eur(variableOut)}/mês</p>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Cenários · próximos 6 meses</h2>
        <Scenario start={liquid - reservedTotal} incomes={(recurring ?? []).filter((r) => r.amount > 0).map((r) => ({ id: r.id, description: r.description, amount: Number(r.amount) }))}
          fixedOut={fixedOut} variableOut={variableOut} salary={sustainable} />
      </section>
    </>
  );
}
