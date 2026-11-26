"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { EBOOK_CONTENT, EBOOK_OFFER, EBOOK_SUBTITLE, EBOOK_TITLE, MAGNET_SEQUENCE, QUIZ_OFFER, SALES_QUIZ } from "@/lib/magnets";

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
    offer: { meeting_url: /^https?:\/\//.test(url) ? url : "", meeting_label: String(formData.get("meeting_label") ?? "").trim(), email_subject: String(formData.get("email_subject") ?? ""), email_body: String(formData.get("email_body") ?? "") },
  };
  if (m.kind === "ebook" && formData.has("content")) patch.config = { ...(m.config as object), content: String(formData.get("content")) };
  await supabase.from("lead_magnets").update(patch).eq("id", id);
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
