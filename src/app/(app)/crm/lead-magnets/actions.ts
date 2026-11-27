"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { EBOOK_CONTENT, EBOOK_OFFER, EBOOK_SUBTITLE, EBOOK_TITLE, MAGNET_SEQUENCE, QUIZ_OFFER, SALES_QUIZ } from "@/lib/magnets";
import { GUIDE_7_ERROS, GUIDE_OFFER, QUIZ_SINS_OFFER, SINS_QUIZ, WHATSAPP_SEQUENCE } from "@/lib/landing";
import type { SeqT } from "@/lib/automation-templates";

const P = "/crm/lead-magnets";
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export async function setPublicSlug(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const slug = slugify(String(formData.get("slug") ?? ""));
  if (slug.length < 2) redirect(`${P}?erro=${encodeURIComponent("Escolhe um endereço com pelo menos 2 letras")}`);
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ public_slug: slug }).eq("id", ctx.org.id);
  if (error) redirect(`${P}?erro=${encodeURIComponent(error.message.includes("duplicate") ? "Esse endereço já está a ser usado. Escolhe outro." : error.message)}`);
  revalidatePath(P);
}

/** Cria o Diagnóstico de vendas, o ebook e a sequência de nutrição (se ainda não existirem). */
export async function seedMagnets() {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { count } = await supabase.from("lead_magnets").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id);
  if (count) return;
  let seqId: string | null = null;
  const { data: existing } = await supabase.from("sequences").select("id").eq("org_id", ctx.org.id).eq("name", MAGNET_SEQUENCE.name).maybeSingle();
  if (existing) seqId = existing.id;
  else {
    const { data, error } = await supabase.from("sequences").insert({ org_id: ctx.org.id, name: MAGNET_SEQUENCE.name, description: MAGNET_SEQUENCE.description, stop_on_stage_change: true }).select("id").single();
    if (error) throw new Error(error.message);
    seqId = data.id;
    await supabase.from("sequence_steps").insert(MAGNET_SEQUENCE.steps.map((st, i) => ({ sequence_id: data.id, org_id: ctx.org.id, position: i + 1, delay_days: st.delay, channel: st.channel, subject: st.subject ?? null, body: st.body })));
  }
  const { error } = await supabase.from("lead_magnets").insert([
    { org_id: ctx.org.id, slug: "diagnostico-vendas", kind: "quiz", title: "Diagnóstico de vendas para freelancers", subtitle: SALES_QUIZ.intro, config: SALES_QUIZ, offer: QUIZ_OFFER, sequence_id: seqId },
    { org_id: ctx.org.id, slug: "ebook-vendas", kind: "ebook", title: EBOOK_TITLE, subtitle: EBOOK_SUBTITLE, config: { content: EBOOK_CONTENT }, offer: EBOOK_OFFER, sequence_id: seqId },
  ]);
  if (error) throw new Error(error.message);
  revalidatePath(P);
}

export async function saveMagnet(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { data: m } = await supabase.from("lead_magnets").select("kind, config").eq("id", id).eq("org_id", ctx.org.id).single();
  if (!m) return;
  const url = String(formData.get("meeting_url") ?? "").trim();
  const patch: Record<string, unknown> = {
    title: String(formData.get("title") ?? "").trim() || "Sem título", subtitle: String(formData.get("subtitle") ?? "").trim() || null,
    active: formData.get("active") === "on", sequence_id: String(formData.get("sequence_id") || "") || null,
    offer: { meeting_url: /^https?:\/\//.test(url) ? url : "", meeting_label: String(formData.get("meeting_label") ?? "").trim(), email_subject: String(formData.get("email_subject") ?? ""), email_body: String(formData.get("email_body") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? "").replace(/\D/g, ""), keyword: String(formData.get("keyword") ?? "").trim().toUpperCase().slice(0, 20),
      guide_url: /^https?:\/\//.test(String(formData.get("guide_url") ?? "").trim()) ? String(formData.get("guide_url")).trim() : "", whatsapp_body: String(formData.get("whatsapp_body") ?? "") },
  };
  if (formData.has("custom_domain")) {
    const d = String(formData.get("custom_domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (d && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) redirect(`${P}?erro=${encodeURIComponent("Domínio inválido. Escreve só o endereço, por exemplo 7erros.thomasfaria.pt")}`);
    patch.custom_domain = d || null;
  }
  if (formData.has("config_json")) {
    try { patch.config = JSON.parse(String(formData.get("config_json"))); } catch { redirect(`${P}?erro=${encodeURIComponent("Os textos da página têm um erro de formatação (JSON). Nada foi alterado nesse campo.")}`); }
  }
  if (m.kind === "ebook" && formData.has("content")) patch.config = { ...(m.config as object), content: String(formData.get("content")) };
  const { error } = await supabase.from("lead_magnets").update(patch).eq("id", id);
  if (error) redirect(`${P}?erro=${encodeURIComponent(error.message.includes("custom_domain") ? "Esse domínio já está a ser usado noutro lead magnet." : error.message)}`);
  revalidatePath(P);
}

async function ensureSequence(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, seq: SeqT) {
  const { data: existing } = await supabase.from("sequences").select("id").eq("org_id", orgId).eq("name", seq.name).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase.from("sequences").insert({ org_id: orgId, name: seq.name, description: seq.description, stop_on_stage_change: seq.stop_on_stage_change ?? true }).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("sequence_steps").insert(seq.steps.map((st, i) => ({ sequence_id: data.id, org_id: orgId, position: i + 1, delay_days: st.delay, channel: st.channel, subject: st.subject ?? null, body: st.body })));
  return data.id as string;
}

/** Cria os lead magnets no estilo da marca: o guia «Os 7 Erros» (WhatsApp) e o teste «Quantos pecados cometes?» */
export async function seedBrandMagnets(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const which = String(formData.get("which") ?? "both");
  const seqId = await ensureSequence(supabase, ctx.org.id, WHATSAPP_SEQUENCE);
  const { data: have } = await supabase.from("lead_magnets").select("slug").eq("org_id", ctx.org.id);
  const slugs = new Set((have ?? []).map((m) => m.slug));
  const rows = [];
  const { count: domainTaken } = await supabase.from("lead_magnets").select("id", { count: "exact", head: true }).eq("custom_domain", "7erros.thomasfaria.pt");
  if (which !== "quiz" && !slugs.has("7-erros")) rows.push({ custom_domain: domainTaken || ctx.email?.endsWith("@example.com") ? null : "7erros.thomasfaria.pt", org_id: ctx.org.id, slug: "7-erros", kind: "guide", title: "Os 7 Erros do Freelancer", subtitle: GUIDE_7_ERROS.hero.lead.replace(/\*/g, ""), config: GUIDE_7_ERROS, offer: GUIDE_OFFER, sequence_id: seqId });
  if (which !== "guide" && !slugs.has("7-pecados")) rows.push({ org_id: ctx.org.id, slug: "7-pecados", kind: "quiz", title: "Quantos pecados cometes?", subtitle: SINS_QUIZ.intro, config: SINS_QUIZ, offer: QUIZ_SINS_OFFER, sequence_id: seqId });
  if (rows.length) { const { error } = await supabase.from("lead_magnets").insert(rows); if (error) throw new Error(error.message); }
  revalidatePath(P);
}

/** Aplica o mesmo link de reunião a todos os lead magnets */
export async function setMeetingUrl(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const url = String(formData.get("meeting_url") ?? "").trim();
  const { data } = await supabase.from("lead_magnets").select("id, offer").eq("org_id", ctx.org.id);
  for (const m of data ?? []) await supabase.from("lead_magnets").update({ offer: { ...(m.offer as object), meeting_url: /^https?:\/\//.test(url) ? url : "" } }).eq("id", m.id);
  revalidatePath(P);
}

/** Liga o PDF carregado ao lead magnet (só aceita ficheiros do armazenamento da plataforma, na pasta da organização) */
export async function setGuideUrl(id: string, url: string): Promise<string | null> {
  const ctx = await requireModule("crm", "write");
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/p360-public/${ctx.org.id}/`;
  if (!url.startsWith(base)) return "Ficheiro inválido.";
  const supabase = await createClient();
  const { data: m } = await supabase.from("lead_magnets").select("offer").eq("id", id).eq("org_id", ctx.org.id).single();
  if (!m) return "Lead magnet não encontrado.";
  await supabase.from("lead_magnets").update({ offer: { ...(m.offer as object), guide_url: url } }).eq("id", id);
  revalidatePath(P);
  return null;
}
