"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { OBJECTIONS } from "@/lib/objections";

const P = "/crm/objecoes";

export async function seedObjections() {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { count } = await supabase.from("objections").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id);
  if (count) return;
  await supabase.from("objections").insert(OBJECTIONS.map((o, i) => ({ ...o, org_id: ctx.org.id, position: i })));
  revalidatePath(P);
}

export async function saveObjection(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const row = {
    category: String(formData.get("category") ?? "").trim() || "Outras", title: String(formData.get("title") ?? "").trim(),
    meaning: String(formData.get("meaning") ?? "").trim() || null, response: String(formData.get("response") ?? "").trim(), question: String(formData.get("question") ?? "").trim() || null,
  };
  if (!row.title || !row.response) return;
  if (id) await supabase.from("objections").update(row).eq("id", id).eq("org_id", ctx.org.id);
  else await supabase.from("objections").insert({ ...row, org_id: ctx.org.id, position: 999 });
  revalidatePath(P);
}

export async function deleteObjection(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  await supabase.from("objections").delete().eq("id", String(formData.get("id"))).eq("org_id", ctx.org.id);
  revalidatePath(P);
}

/** Conta quantas vezes cada resposta foi copiada (as mais usadas sobem) */
export async function markObjectionUsed(id: string) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { data } = await supabase.from("objections").select("used").eq("id", id).eq("org_id", ctx.org.id).single();
  if (data) await supabase.from("objections").update({ used: (data.used ?? 0) + 1 }).eq("id", id);
}
