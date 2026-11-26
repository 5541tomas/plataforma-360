"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

function refresh() { revalidatePath("/financas"); revalidatePath("/"); revalidatePath("/objetivos"); }

export async function createAccount(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    org_id: ctx.org.id,
    scope: String(formData.get("scope")),
    name: String(formData.get("name")),
    bank: String(formData.get("bank") || "") || null,
    type: String(formData.get("type")),
    opening_balance: Number(formData.get("opening_balance") || 0),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function createTransaction(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const raw = Number(formData.get("amount") || 0);
  const dir = String(formData.get("direction"));
  const { error } = await supabase.from("transactions").insert({
    org_id: ctx.org.id,
    account_id: String(formData.get("account_id")),
    date: String(formData.get("date")),
    description: String(formData.get("description")),
    amount: dir === "out" ? -Math.abs(raw) : Math.abs(raw),
    category_id: String(formData.get("category_id") || "") || null,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function createRecurring(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const raw = Number(formData.get("amount") || 0);
  const { error } = await supabase.from("recurring").insert({
    org_id: ctx.org.id,
    scope: String(formData.get("scope")),
    description: String(formData.get("description")),
    amount: String(formData.get("direction")) === "out" ? -Math.abs(raw) : Math.abs(raw),
    day_of_month: Number(formData.get("day") || 1),
  });
  if (error) throw new Error(error.message);
  refresh();
}
