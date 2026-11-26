"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { DEFAULT_SENDER, emailConfigured, sendEmail, type Sender } from "@/lib/email";
import { RULES, SEQUENCES } from "@/lib/automation-templates";

type DB = Awaited<ReturnType<typeof createClient>>;
const refresh = () => { revalidatePath("/crm", "layout"); revalidatePath("/"); };

async function baseUrl() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}
async function senderOf(supabase: DB, orgId: string) {
  const { data } = await supabase.from("organizations").select("name, legal_name, signature_name, settings").eq("id", orgId).single();
  const s = (data?.settings as { email?: Partial<Sender> })?.email ?? {};
  return { orgName: data?.legal_name || data?.name || "", sender: { ...DEFAULT_SENDER, from_name: s.from_name || data?.signature_name || DEFAULT_SENDER.from_name, from_email: s.from_email || DEFAULT_SENDER.from_email, reply_to: s.reply_to } as Sender };
}

/** Cria as sequências e regras iniciais (só se ainda não existirem) */
export async function seedAutomation() {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { count } = await supabase.from("sequences").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id);
  if (count) return;
  const ids: Record<string, string> = {};
  for (const s of SEQUENCES) {
    const { data, error } = await supabase.from("sequences").insert({ org_id: ctx.org.id, name: s.name, description: s.description, for_closed_deals: !!s.for_closed_deals, stop_on_stage_change: s.stop_on_stage_change ?? true }).select("id").single();
    if (error) throw new Error(error.message);
    ids[s.key] = data.id;
    await supabase.from("sequence_steps").insert(s.steps.map((st, i) => ({ sequence_id: data.id, org_id: ctx.org.id, position: i + 1, delay_days: st.delay, channel: st.channel, subject: st.subject ?? null, body: st.body })));
  }
  await supabase.from("automation_rules").insert(RULES.map((r) => ({
    org_id: ctx.org.id, name: r.name, trigger: r.trigger, trigger_config: r.trigger_config, action: r.action,
    action_config: typeof r.action_config === "function" ? r.action_config(ids) : r.action_config, active: r.active ?? true,
  })));
  refresh();
}

// ---------- Fila ----------
export async function approveOutbox(formData: FormData): Promise<{ ok: true; mailto?: string } | { ok: false; error: string }> {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");
  const { data: o } = await supabase.from("outbox").select("*").eq("id", id).eq("status", "pending").single();
  if (!o) return { ok: false, error: "Mensagem já tratada." };
  await supabase.from("outbox").update({ subject, body }).eq("id", id);
  if (o.channel === "email") {
    if (emailConfigured()) {
      try {
        const { sender, orgName } = await senderOf(supabase, ctx.org.id);
        await sendEmail({ to: o.to_address, subject, text: body, outboxId: id, base: await baseUrl(), orgName, sender });
      } catch (e) {
        await supabase.from("outbox").update({ status: "failed", error: e instanceof Error ? e.message : "Erro" }).eq("id", id);
        refresh();
        return { ok: false, error: e instanceof Error ? e.message : "Erro ao enviar" };
      }
    }
  }
  await supabase.from("outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", id);
  await supabase.from("activities").insert({ org_id: ctx.org.id, contact_id: o.contact_id, deal_id: o.deal_id, type: "note",
    summary: `Automático: ${o.channel === "email" ? `email enviado — ${subject}` : "WhatsApp enviado"}` });
  refresh();
  if (o.channel === "email" && !emailConfigured()) return { ok: true, mailto: `mailto:${o.to_address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
  return { ok: true };
}

export async function skipOutbox(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  await supabase.from("outbox").update({ status: "skipped" }).eq("id", String(formData.get("id")));
  refresh();
}

export async function approveAllEmails(): Promise<{ sent: number; failed: number; error?: string }> {
  const ctx = await requireModule("crm", "write");
  if (!emailConfigured()) return { sent: 0, failed: 0, error: "Configura o Resend para aprovar emails em bloco." };
  const supabase = await createClient();
  const { data: items } = await supabase.from("outbox").select("id, subject, body").eq("org_id", ctx.org.id).eq("status", "pending").eq("channel", "email").lte("due_on", new Date().toISOString().slice(0, 10)).limit(50);
  let sent = 0, failed = 0;
  for (const it of items ?? []) {
    const fd = new FormData(); fd.set("id", it.id); fd.set("subject", it.subject ?? ""); fd.set("body", it.body);
    const r = await approveOutbox(fd); if (r.ok) sent++; else failed++;
  }
  return { sent, failed };
}

// ---------- Sequências ----------
export async function saveSequence(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const row = {
    org_id: ctx.org.id, name: String(formData.get("name")), description: String(formData.get("description") || "") || null,
    stop_on_stage_change: formData.get("stop_on_stage_change") === "on", stop_on_reply: formData.get("stop_on_reply") === "on",
    for_closed_deals: formData.get("for_closed_deals") === "on", active: formData.get("active") === "on",
  };
  let seqId = id;
  if (id) await supabase.from("sequences").update(row).eq("id", id);
  else { const { data, error } = await supabase.from("sequences").insert(row).select("id").single(); if (error) throw new Error(error.message); seqId = data.id; }
  // passos: s{i}_channel, s{i}_delay, s{i}_subject, s{i}_body (body vazio = remover)
  const steps: { position: number; delay_days: number; channel: string; subject: string | null; body: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const body = String(formData.get(`s${i}_body`) ?? "").trim();
    if (!body) continue;
    steps.push({ position: steps.length + 1, delay_days: Math.max(0, Number(formData.get(`s${i}_delay`) || 0)), channel: String(formData.get(`s${i}_channel`) || "email"), subject: String(formData.get(`s${i}_subject`) || "") || null, body });
  }
  await supabase.from("sequence_steps").delete().eq("sequence_id", seqId);
  if (steps.length) await supabase.from("sequence_steps").insert(steps.map((s) => ({ ...s, sequence_id: seqId, org_id: ctx.org.id })));
  refresh();
}

export async function enrollContact(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_contact", { p_sequence: String(formData.get("sequence_id")), p_contact: String(formData.get("contact_id")), p_deal: String(formData.get("deal_id") || "") || null });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  await supabase.rpc("run_automations", { p_org: (await requireModule("crm")).org.id });
  refresh();
}

export async function stopEnrollment(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  await supabase.from("enrollments").update({ status: "stopped", stopped_reason: "Parada manualmente" }).eq("id", String(formData.get("id")));
  refresh();
}

// ---------- Regras ----------
export async function saveRule(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const trigger = String(formData.get("trigger")), action = String(formData.get("action"));
  const trigger_config: Record<string, unknown> = {};
  if (trigger === "stage_enter") trigger_config.stage = String(formData.get("stage") || "Proposta");
  if (["inactive_days", "lost_after_days", "client_every_days"].includes(trigger)) trigger_config.days = Math.max(1, Number(formData.get("days") || 14));
  const action_config: Record<string, unknown> = {};
  if (action === "enroll") action_config.sequence_id = String(formData.get("sequence_id"));
  if (action === "task") { action_config.title = String(formData.get("task_title") || "Contactar: {{negocio}}"); action_config.days = Number(formData.get("task_days") || 0); }
  if (action === "move_stage") action_config.stage = String(formData.get("target_stage"));
  const row = { org_id: ctx.org.id, name: String(formData.get("name")), trigger, trigger_config, action, action_config, active: formData.get("active") === "on" };
  const { error } = id ? await supabase.from("automation_rules").update(row).eq("id", id) : await supabase.from("automation_rules").insert(row);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteRule(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  await supabase.from("automation_rules").delete().eq("id", String(formData.get("id")));
  refresh();
}

// ---------- Contactos ----------
export async function setConsent(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const on = formData.get("consent") === "on";
  await supabase.from("contacts").update({ consent_marketing: on, consent_at: on ? new Date().toISOString() : null, ...(on ? { unsubscribed_at: null } : {}) }).eq("id", String(formData.get("id")));
  refresh();
}

// ---------- Newsletter ----------
type Segment = { audience: "leads" | "clients" | "all"; product_id?: string; source?: string };
async function audienceOf(supabase: DB, orgId: string, seg: Segment) {
  const [{ data: contacts }, { data: deals }] = await Promise.all([
    supabase.from("contacts").select("id, name, email, source, consent_marketing, unsubscribed_at").eq("org_id", orgId).not("email", "is", null),
    supabase.from("deals").select("contact_id, status, product_id").eq("org_id", orgId),
  ]);
  return (contacts ?? []).filter((c) => {
    if (c.unsubscribed_at) return false;
    const ds = (deals ?? []).filter((d) => d.contact_id === c.id);
    const isClient = ds.some((d) => d.status === "won");
    // RGPD: leads precisam de consentimento; clientes podem receber comunicações sobre serviços semelhantes (soft opt-in)
    if (!c.consent_marketing && !isClient) return false;
    if (seg.audience === "clients" && !isClient) return false;
    if (seg.audience === "leads" && isClient) return false;
    if (seg.product_id && !ds.some((d) => d.product_id === seg.product_id)) return false;
    if (seg.source && !(c.source ?? "").toLowerCase().includes(seg.source.toLowerCase())) return false;
    return true;
  });
}

export async function previewAudience(seg: Segment) {
  const ctx = await requireModule("crm");
  const supabase = await createClient();
  return (await audienceOf(supabase, ctx.org.id, seg)).length;
}

export async function saveCampaign(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const row = {
    org_id: ctx.org.id, name: String(formData.get("name") || formData.get("subject")), subject: String(formData.get("subject")), body: String(formData.get("body")),
    segment: { audience: String(formData.get("audience") || "all"), product_id: String(formData.get("product_id") || "") || undefined, source: String(formData.get("source") || "") || undefined },
  };
  const { error } = id ? await supabase.from("campaigns").update(row).eq("id", id) : await supabase.from("campaigns").insert(row);
  if (error) throw new Error(error.message);
  refresh();
}

export async function sendCampaign(formData: FormData): Promise<{ sent: number; failed: number; error?: string }> {
  const ctx = await requireModule("crm", "write");
  if (!emailConfigured()) return { sent: 0, failed: 0, error: "A newsletter precisa do Resend configurado (RESEND_API_KEY)." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("campaigns").select("*").eq("id", String(formData.get("id"))).eq("status", "draft").single();
  if (!c) return { sent: 0, failed: 0, error: "Campanha já enviada." };
  const people = await audienceOf(supabase, ctx.org.id, c.segment as Segment);
  const { sender, orgName } = await senderOf(supabase, ctx.org.id);
  const base = await baseUrl();
  let sent = 0, failed = 0;
  for (const p of people.slice(0, 500)) {
    const body = String(c.body).replaceAll("{{nome}}", p.name).replaceAll("{{primeiro_nome}}", p.name.split(" ")[0]).replaceAll("{{meu_nome}}", sender.from_name.split(" ")[0]);
    const { data: ob } = await supabase.from("outbox").insert({ org_id: ctx.org.id, campaign_id: c.id, contact_id: p.id, channel: "email", to_address: p.email, subject: c.subject, body, status: "pending" }).select("id").single();
    try {
      await sendEmail({ to: p.email!, subject: c.subject, text: body, outboxId: ob!.id, base, orgName, sender });
      await supabase.from("outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", ob!.id); sent++;
    } catch (e) {
      await supabase.from("outbox").update({ status: "failed", error: e instanceof Error ? e.message : "Erro" }).eq("id", ob!.id); failed++;
    }
  }
  await supabase.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", c.id);
  refresh();
  return { sent, failed };
}

export async function saveEmailSettings(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", ctx.org.id).single();
  const settings = { ...(data?.settings ?? {}), email: { from_name: String(formData.get("from_name") || ""), from_email: String(formData.get("from_email") || ""), reply_to: String(formData.get("reply_to") || "") || null } };
  await supabase.from("organizations").update({ settings }).eq("id", ctx.org.id);
  refresh();
}
