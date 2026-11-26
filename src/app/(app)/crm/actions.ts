"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";

async function findOrCreateCompany(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, name: string) {
  if (!name) return null;
  const { data: found } = await supabase.from("companies").select("id").eq("org_id", orgId).ilike("name", name).maybeSingle();
  if (found) return found.id;
  const { data } = await supabase.from("companies").insert({ org_id: orgId, name }).select("id").single();
  return data?.id ?? null;
}

export async function createDeal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const companyId = await findOrCreateCompany(supabase, ctx.org.id, String(formData.get("company") ?? "").trim());
  let contactId: string | null = null;
  const contact = String(formData.get("contact") ?? "").trim();
  if (contact) {
    const { data } = await supabase.from("contacts").insert({
      org_id: ctx.org.id, company_id: companyId, name: contact,
      email: String(formData.get("email") ?? "") || null,
    }).select("id").single();
    contactId = data?.id ?? null;
  }
  const { error } = await supabase.from("deals").insert({
    org_id: ctx.org.id,
    pipeline_id: String(formData.get("pipeline_id")),
    stage_id: String(formData.get("stage_id")),
    title: String(formData.get("title")),
    kind: String(formData.get("kind")),
    value: Number(formData.get("value") || 0),
    duration_months: Number(formData.get("duration") || 12),
    expected_close: String(formData.get("expected_close") || "") || null,
    company_id: companyId,
    contact_id: contactId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm");
  revalidatePath("/");
}

export async function moveDeal(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update({ stage_id: String(formData.get("stage_id")) }).eq("id", String(formData.get("deal_id")));
  if (error) throw new Error(error.message);
  revalidatePath("/crm");
  revalidatePath("/");
  revalidatePath("/financas");
  revalidatePath("/objetivos");
}

export async function logActivity(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    org_id: ctx.org.id,
    deal_id: String(formData.get("deal_id")),
    type: String(formData.get("type") || "note"),
    summary: String(formData.get("summary")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm");
  revalidatePath("/");
}

export async function createPipeline(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { data: p, error } = await supabase.from("pipelines")
    .insert({ org_id: ctx.org.id, name: String(formData.get("name")), position: 99 }).select("id").single();
  if (error || !p) throw new Error(error?.message);
  const names = String(formData.get("stages") || "Lead, Proposta, Negociação").split(",").map((s) => s.trim()).filter(Boolean);
  const rows = names.map((name, i) => ({ pipeline_id: p.id, org_id: ctx.org.id, name, position: i, probability: Math.round(((i + 1) / (names.length + 1)) * 100) }));
  rows.push({ pipeline_id: p.id, org_id: ctx.org.id, name: "Ganho", position: names.length, probability: 100, is_won: true } as never);
  rows.push({ pipeline_id: p.id, org_id: ctx.org.id, name: "Perdido", position: names.length + 1, probability: 0, is_lost: true } as never);
  await supabase.from("stages").insert(rows);
  revalidatePath("/crm");
}

export async function updateDeal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const companyId = await findOrCreateCompany(supabase, ctx.org.id, String(formData.get("company") ?? "").trim());
  const prob = String(formData.get("probability") ?? "");
  const { error } = await supabase.from("deals").update({
    title: String(formData.get("title")),
    kind: String(formData.get("kind")),
    value: Number(formData.get("value") || 0),
    duration_months: Number(formData.get("duration") || 12),
    expected_close: String(formData.get("expected_close") || "") || null,
    probability: prob === "" ? null : Math.max(0, Math.min(100, Number(prob))),
    company_id: companyId,
    lost_reason: String(formData.get("lost_reason") || "") || null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/crm/${id}`); revalidatePath("/crm"); revalidatePath("/");
}

export async function updateContact(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").update({
    name: String(formData.get("name")),
    email: String(formData.get("email") || "") || null,
    phone: String(formData.get("phone") || "") || null,
    role: String(formData.get("role") || "") || null,
    source: String(formData.get("source") || "") || null,
  }).eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
}

export async function addContactToDeal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  const { data: deal } = await supabase.from("deals").select("company_id").eq("id", dealId).single();
  const { data: c, error } = await supabase.from("contacts").insert({
    org_id: ctx.org.id, company_id: deal?.company_id ?? null, name: String(formData.get("name")),
    email: String(formData.get("email") || "") || null, phone: String(formData.get("phone") || "") || null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("deals").update({ contact_id: c.id }).eq("id", dealId);
  revalidatePath(`/crm/${dealId}`);
}

export async function addActivity(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  const followUp = String(formData.get("follow_up") || "");
  const { error } = await supabase.from("activities").insert({
    org_id: ctx.org.id, deal_id: dealId,
    type: String(formData.get("type") || "note"),
    summary: String(formData.get("summary")),
  });
  if (error) throw new Error(error.message);
  if (followUp) {
    const { data: d } = await supabase.from("deals").select("title").eq("id", dealId).single();
    await supabase.from("tasks").insert({ org_id: ctx.org.id, title: `Follow-up: ${d?.title ?? ""}`, due_date: followUp, deal_id: dealId, module: "crm" });
  }
  revalidatePath(`/crm/${dealId}`); revalidatePath("/crm"); revalidatePath("/");
}

export async function deleteDeal(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") throw new Error("Confirma que queres apagar.");
  await supabase.from("recurring").update({ active: false }).eq("deal_id", id);
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/crm"); revalidatePath("/");
  const { redirect } = await import("next/navigation");
  redirect("/crm");
}
