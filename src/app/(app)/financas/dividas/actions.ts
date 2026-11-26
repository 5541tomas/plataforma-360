"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

function refresh() { revalidatePath("/financas", "layout"); revalidatePath("/"); }
const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

export async function saveDebt(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const num = (k: string) => { const v = Number(String(formData.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };
  const balance = num("balance") ?? 0;
  let payment = num("monthly_payment");
  let end = String(formData.get("end_date") || "") || null;
  // Se só souberes um dos dois, calculamos o outro
  if (!payment && end && balance) payment = Math.ceil((balance / Math.max(1, monthsBetween(new Date(), new Date(end)))) * 100) / 100;
  if (payment && !end && balance) { const d = new Date(); d.setMonth(d.getMonth() + Math.ceil(balance / payment)); end = d.toISOString().slice(0, 10); }
  const row: Record<string, unknown> = {
    name: String(formData.get("name")), lender: String(formData.get("lender") || "") || null,
    kind: String(formData.get("kind") || "loan"), monthly_payment: payment, end_date: end,
    day_of_month: Math.min(31, Math.max(1, Number(formData.get("day_of_month") || 1))),
    account_id: String(formData.get("account_id") || "") || null, notes: String(formData.get("notes") || "") || null,
  };
  if (!id) {
    Object.assign(row, { org_id: ctx.org.id, scope: String(formData.get("scope") || "personal"), balance_start: balance, start_date: new Date().toISOString().slice(0, 10) });
    const { error } = await supabase.from("debts").insert(row);
    if (error) throw new Error(error.message);
  } else {
    // Corrigir o valor em dívida: recomeça a contagem a partir de hoje
    if (formData.get("reset_balance") === "on" && balance) Object.assign(row, { balance_start: balance, start_date: new Date().toISOString().slice(0, 10) });
    const { error } = await supabase.from("debts").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  }
  refresh();
}

export async function payInstallment(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  const { data: d } = await supabase.from("debts").select("org_id, name, monthly_payment, account_id, category_id, day_of_month, scope").eq("id", String(formData.get("id"))).single();
  if (!d || !d.monthly_payment) throw new Error("Define primeiro a prestação mensal.");
  const accountId = String(formData.get("account_id") || "") || d.account_id;
  if (!accountId) throw new Error("Escolhe a conta de onde sai a prestação.");
  // Data de hoje: conta sempre para a dívida (o saldo inicial é medido na data de registo da dívida)
  const date = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("transactions").insert({
    org_id: d.org_id, account_id: accountId, date, description: `Prestação: ${d.name}`, amount: -Number(d.monthly_payment), category_id: d.category_id,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function archiveDebt(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("debts").update({ archived: true }).eq("id", String(formData.get("id")));
  refresh();
}
