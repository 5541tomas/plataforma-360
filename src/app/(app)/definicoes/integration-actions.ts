"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { emailConfigured, sendEmail, DEFAULT_SENDER } from "@/lib/email";
import { headers } from "next/headers";

async function mergeSettings(key: string, value: Record<string, unknown>) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", ctx.org.id).single();
  const settings = (data?.settings as Record<string, unknown>) ?? {};
  await supabase.from("organizations").update({ settings: { ...settings, [key]: { ...((settings[key] as object) ?? {}), ...value } } }).eq("id", ctx.org.id);
  revalidatePath("/definicoes");
}

export async function savePayments(formData: FormData) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(formData.get("deposit_pct") ?? 50))));
  const mbway = String(formData.get("mbway") ?? "").replace(/[^\d+ ]/g, "").trim().slice(0, 20);
  await mergeSettings("payments", { enabled: formData.get("pay_enabled") === "on", deposit_pct: pct, mbway: mbway || null });
}

export async function saveDigest(formData: FormData) {
  const email = String(formData.get("digest_email") ?? "").trim();
  await mergeSettings("digest", { enabled: formData.get("digest_enabled") === "on", email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null });
}

export async function saveNotify(formData: FormData) {
  await mergeSettings("notify", { leads: formData.get("leads") === "on" });
}

/** Gera a chave interna (mostrada uma única vez) */
export async function generateInternalKey(): Promise<{ key?: string; error?: string }> {
  const ctx = await getContext();
  if (ctx.role !== "owner" && ctx.role !== "admin") return { error: "Só o dono pode gerar a chave." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_internal_secret", { p_org: ctx.org.id });
  if (error) return { error: error.message };
  revalidatePath("/definicoes");
  return { key: data as string };
}

export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const ctx = await getContext();
  if (!emailConfigured()) return { ok: false, message: "Falta a RESEND_API_KEY no Netlify." };
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    await sendEmail({ to: ctx.email, subject: "Teste da Plataforma 360", text: `Olá ${ctx.name.split(" ")[0]},\n\nSe estás a ler isto, o envio de email está a funcionar. Os emails que aprovares na fila passam a sair sozinhos.\n\n— Plataforma 360`, outboxId: "00000000-0000-0000-0000-000000000000", base, orgName: ctx.org.name, sender: DEFAULT_SENDER, internal: true });
    return { ok: true, message: `Enviado para ${ctx.email}. Vê a tua caixa de entrada.` };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Erro ao enviar" }; }
}
