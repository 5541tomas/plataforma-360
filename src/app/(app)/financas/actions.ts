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

export async function updateTransaction(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const category_id = String(formData.get("category_id") || "") || null;
  const raw = Number(formData.get("amount"));
  const { data: before } = await supabase.from("transactions").select("description, category_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("transactions").update({
    description: String(formData.get("description")),
    date: String(formData.get("date")),
    amount: raw,
    category_id,
    is_transfer: formData.get("is_transfer") === "on",
  }).eq("id", id);
  if (error) throw new Error(error.message);
  // Aprende: a mesma descrição passa a ter esta categoria nas próximas importações
  if (before && category_id && category_id !== before.category_id) {
    const { normalizeDescription } = await import("@/lib/categorize");
    const pattern = normalizeDescription(before.description);
    if (pattern.length >= 3) {
      await supabase.from("category_rules").upsert({ org_id: ctx.org.id, owner_id: ctx.userId, pattern, category_id }, { onConflict: "org_id,owner_id,pattern" });
      if (formData.get("apply_all") === "on") {
        const { data: same } = await supabase.from("transactions").select("id, description").eq("org_id", ctx.org.id).is("category_id", null).limit(1000);
        const ids = (same ?? []).filter((t) => normalizeDescription(t.description) === pattern).map((t) => t.id);
        if (ids.length) await supabase.from("transactions").update({ category_id }).in("id", ids);
      }
    }
  }
  refresh();
}

export async function deleteTransaction(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateAccount(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({
    name: String(formData.get("name")),
    bank: String(formData.get("bank") || "") || null,
    opening_balance: Number(formData.get("opening_balance") || 0),
    archived: formData.get("archived") === "on",
  }).eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function setInvestmentBalance(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("account_snapshots").upsert({
    account_id: String(formData.get("id")),
    date: new Date().toISOString().slice(0, 10),
    balance: Number(formData.get("balance")),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteRecurring(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.from("recurring").update({ active: false }).eq("id", String(formData.get("id")));
  refresh();
}

export async function setBudget(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const amount = Number(formData.get("amount") || 0);
  const category_id = String(formData.get("category_id"));
  const month = String(formData.get("month"));
  if (amount <= 0) {
    await supabase.from("budgets").delete().eq("category_id", category_id).eq("month", month).eq("owner_id", ctx.userId);
  } else {
    const { error } = await supabase.from("budgets").upsert({
      org_id: ctx.org.id, scope: String(formData.get("scope")), owner_id: ctx.userId, category_id, month, amount,
    }, { onConflict: "category_id,month,owner_id" });
    if (error) throw new Error(error.message);
  }
  refresh();
}

export async function createCategory(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    org_id: ctx.org.id, scope: String(formData.get("scope")), kind: String(formData.get("kind")), name: String(formData.get("name")),
  });
  if (error) throw new Error(error.message.includes("duplicate") ? "Essa categoria já existe." : error.message);
  refresh();
}
