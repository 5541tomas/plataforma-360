"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

function refresh() { revalidatePath("/financas", "layout"); revalidatePath("/"); }

export async function markReceived(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("receivables").update({ status: "received", received_at: String(formData.get("date") || new Date().toISOString().slice(0, 10)) }).eq("id", String(formData.get("id")));
  refresh();
}
export async function reopenReceivable(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("receivables").update({ status: "open", received_at: null, transaction_id: null }).eq("id", String(formData.get("id")));
  refresh();
}
export async function cancelReceivable(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("receivables").update({ status: "cancelled" }).eq("id", String(formData.get("id")));
  refresh();
}
export async function addReceivable(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("receivables").insert({
    org_id: ctx.org.id, scope: "business", description: String(formData.get("description")),
    amount: Number(formData.get("amount")), due_date: String(formData.get("due_date")),
    deal_id: String(formData.get("deal_id") || "") || null,
  });
  if (error) throw new Error(error.message);
  refresh();
}
