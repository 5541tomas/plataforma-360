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

async function contactIdByName(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, name: string) {
  const n = name.trim();
  if (!n) return null;
  const { data } = await supabase.from("contacts").select("id").eq("org_id", orgId).ilike("name", n).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function createDeal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const companyId = String(formData.get("company_id") || "") || await findOrCreateCompany(supabase, ctx.org.id, String(formData.get("company") ?? "").trim());
  let contactId: string | null = String(formData.get("contact_id") || "") || null;
  const contact = String(formData.get("contact") ?? "").trim();
  if (!contactId && contact) {
    const { data } = await supabase.from("contacts").insert({
      org_id: ctx.org.id, company_id: companyId, name: contact,
      email: String(formData.get("email") ?? "") || null, phone: String(formData.get("phone") ?? "") || null,
      source: String(formData.get("source") ?? "") || null,
    }).select("id").single();
    contactId = data?.id ?? null;
  }
  // Produto do catálogo: define tipo, preço e duração por omissão
  const productId = String(formData.get("product_id") || "") || null;
  const qty = Number(formData.get("quantity") || 1) || 1;
  let kind = String(formData.get("kind") || "one_off");
  let value = formData.get("value") ? Number(formData.get("value")) : NaN;
  let duration = Number(formData.get("duration") || 0);
  if (productId) {
    const { data: pr } = await supabase.from("products").select("kind, price, duration_months").eq("id", productId).single();
    if (pr) {
      kind = pr.kind;
      if (Number.isNaN(value)) value = pr.kind === "retainer" ? Number(pr.price) : Number(pr.price) * qty;
      if (!duration) duration = pr.duration_months;
    }
  }
  let stageId = String(formData.get("stage_id") || "");
  const pipelineId = String(formData.get("pipeline_id"));
  if (!stageId) {
    const { data: st } = await supabase.from("stages").select("id").eq("pipeline_id", pipelineId).eq("is_won", false).eq("is_lost", false).order("position").limit(1).single();
    stageId = st?.id ?? "";
  }
  const { data: deal, error } = await supabase.from("deals").insert({
    org_id: ctx.org.id, pipeline_id: pipelineId, stage_id: stageId,
    title: String(formData.get("title")), kind, value: Number.isNaN(value) ? 0 : value,
    duration_months: duration || 12, quantity: qty, product_id: productId,
    expected_close: String(formData.get("expected_close") || "") || null,
    company_id: companyId, contact_id: contactId, source: String(formData.get("source") ?? "") || null,
    referred_by: await contactIdByName(supabase, ctx.org.id, String(formData.get("referred_by") ?? "")),
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
  revalidatePath("/");
  if (formData.get("open") === "1") { const { redirect } = await import("next/navigation"); redirect(`/crm/${deal.id}`); }
}

/** Automação: ao entrar numa etapa de proposta sem proposta criada, cria a tarefa de a enviar */
async function afterStageChange(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, dealId: string, stageId: string) {
  const { data: st } = await supabase.from("stages").select("name").eq("id", stageId).single();
  if (!st || !/proposta/i.test(st.name)) return;
  const [{ count: props }, { count: tasks }, { data: d }] = await Promise.all([
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("deal_id", dealId),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("deal_id", dealId).like("title", "Preparar e enviar proposta%"),
    supabase.from("deals").select("title").eq("id", dealId).single(),
  ]);
  if (!props && !tasks) {
    await supabase.from("tasks").insert({ org_id: orgId, title: `Preparar e enviar proposta: ${d?.title ?? ""}`, due_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), deal_id: dealId, module: "crm" });
  }
}

/** Usado pelo Kanban (arrastar e largar) */
export async function moveDealTo(dealId: string, stageId: string) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", dealId);
  if (error) return { error: error.message };
  await afterStageChange(supabase, ctx.org.id, dealId, stageId);
  revalidatePath("/crm", "layout"); revalidatePath("/"); revalidatePath("/financas"); revalidatePath("/objetivos");
  return { ok: true };
}

export async function createContact(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const companyId = await findOrCreateCompany(supabase, ctx.org.id, String(formData.get("company") ?? "").trim());
  const { data, error } = await supabase.from("contacts").insert({
    org_id: ctx.org.id, company_id: companyId, name: String(formData.get("name")),
    email: String(formData.get("email") || "") || null, phone: String(formData.get("phone") || "") || null,
    role: String(formData.get("role") || "") || null, source: String(formData.get("source") || "") || null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
  const { redirect } = await import("next/navigation");
  redirect(`/crm/contactos/${data.id}`);
}

export async function saveContact(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const companyId = await findOrCreateCompany(supabase, ctx.org.id, String(formData.get("company") ?? "").trim());
  const { error } = await supabase.from("contacts").update({
    name: String(formData.get("name")), company_id: companyId,
    email: String(formData.get("email") || "") || null, phone: String(formData.get("phone") || "") || null,
    role: String(formData.get("role") || "") || null, source: String(formData.get("source") || "") || null,
    notes: String(formData.get("notes") || "") || null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
}

export async function addContactNote(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    org_id: ctx.org.id, contact_id: String(formData.get("contact_id")),
    deal_id: String(formData.get("deal_id") || "") || null,
    type: String(formData.get("type") || "note"), summary: String(formData.get("summary")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout"); revalidatePath("/");
}

export async function saveCompany(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const row = {
    org_id: ctx.org.id, name: String(formData.get("name")),
    nif: String(formData.get("nif") || "") || null, website: String(formData.get("website") || "") || null,
    industry: String(formData.get("industry") || "") || null, notes: String(formData.get("notes") || "") || null,
  };
  const { data, error } = id
    ? await supabase.from("companies").update(row).eq("id", id).select("id").single()
    : await supabase.from("companies").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
  if (!id) { const { redirect } = await import("next/navigation"); redirect(`/crm/empresas/${data.id}`); }
}

export async function saveProduct(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const row = {
    org_id: ctx.org.id, name: String(formData.get("name")), description: String(formData.get("description") || "") || null,
    kind: String(formData.get("kind") || "one_off"), price: Number(formData.get("price") || 0),
    duration_months: Number(formData.get("duration_months") || 1), active: formData.get("active") !== "off",
    hours_per_unit: Number(formData.get("hours_per_unit") || 0),
    delivery_weeks: Number(formData.get("delivery_weeks") || 0),
  };
  const { error } = id ? await supabase.from("products").update(row).eq("id", id) : await supabase.from("products").insert({ ...row, position: 99 });
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
}

export async function moveDeal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update({ stage_id: String(formData.get("stage_id")) }).eq("id", String(formData.get("deal_id")));
  if (error) throw new Error(error.message);
  await afterStageChange(supabase, ctx.org.id, String(formData.get("deal_id")), String(formData.get("stage_id")));
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
    source: String(formData.get("source") || "") || null,
    referred_by: await contactIdByName(supabase, ctx.org.id, String(formData.get("referred_by") ?? "")),
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

export async function addTestimonial(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const author = String(formData.get("author") ?? "").trim();
  const { data: org } = await supabase.from("organizations").select("testimonials").eq("id", ctx.org.id).single();
  const entry = `${text.replace(/\s*\n\s*/g, " ")} — ${author}`;
  await supabase.from("organizations").update({ testimonials: [org?.testimonials?.trim(), entry].filter(Boolean).join("\n\n") }).eq("id", ctx.org.id);
  await supabase.from("activities").insert({ org_id: ctx.org.id, contact_id: String(formData.get("contact_id")), type: "note", summary: `Testemunho recebido: “${text}”` });
  revalidatePath("/crm", "layout"); revalidatePath("/definicoes");
}
