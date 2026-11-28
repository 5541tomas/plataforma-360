"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";

/** Cria (ou reaproveita) o pedido de testemunho de um negócio */
export async function requestTestimonial(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  const { data: deal } = await supabase.from("deals").select("id, contact_id").eq("id", dealId).eq("org_id", ctx.org.id).single();
  if (!deal) return;
  const { data: have } = await supabase.from("testimonials").select("id").eq("deal_id", dealId).maybeSingle();
  if (!have) {
    await supabase.from("testimonials").insert({ org_id: ctx.org.id, deal_id: dealId, contact_id: deal.contact_id });
    await supabase.from("activities").insert({ org_id: ctx.org.id, deal_id: dealId, contact_id: deal.contact_id, type: "note", summary: "Pedido de testemunho criado" });
  }
  revalidatePath(`/crm/${dealId}`); revalidatePath("/crm/clientes");
}

/** Aprova: passa a aparecer nas propostas e nas landing pages (Definições → Testemunhos) */
export async function approveTestimonial(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { data: t } = await supabase.from("testimonials").select("*").eq("id", id).eq("org_id", ctx.org.id).single();
  if (!t || !t.text) return;
  const text = String(formData.get("text") ?? t.text).trim();
  const who = [t.name, t.role, t.company].filter(Boolean).join(", ");
  const entry = `${text.replace(/\n+/g, " ")}${who ? ` — ${who}` : ""}`;
  const { data: org } = await supabase.from("organizations").select("testimonials").eq("id", ctx.org.id).single();
  const current = org?.testimonials?.trim() ?? "";
  if (!current.includes(text.slice(0, 40))) await supabase.from("organizations").update({ testimonials: [entry, current].filter(Boolean).join("\n\n") }).eq("id", ctx.org.id);
  await supabase.from("testimonials").update({ status: "approved", text }).eq("id", id);
  revalidatePath("/crm/clientes");
}

export async function rejectTestimonial(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  await supabase.from("testimonials").update({ status: "rejected" }).eq("id", String(formData.get("id"))).eq("org_id", ctx.org.id);
  revalidatePath("/crm/clientes");
}

/** Gera o código pessoal de recomendação de um contacto */
export async function createRefCode(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("contact_id"));
  await supabase.rpc("contact_ref_code", { p_contact: id });
  const back = String(formData.get("back") || "/crm/clientes");
  revalidatePath(back); revalidatePath("/crm/clientes");
}
