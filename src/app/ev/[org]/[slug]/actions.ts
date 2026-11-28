"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { afterEvent } from "@/lib/after-submit";

export async function registerEvent(formData: FormData) {
  const org = String(formData.get("org")), slug = String(formData.get("slug"));
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  let utm: Record<string, string> | null = null;
  try { const u = JSON.parse(String(formData.get("utm") ?? "{}")); utm = u && u.source ? u : null; } catch { utm = null; }
  const { data, error } = await anonClient().rpc("public_event_register", {
    p_org: org, p_slug: slug, p_name: String(formData.get("name") ?? ""), p_email: String(formData.get("email") ?? ""), p_phone: String(formData.get("phone") ?? ""),
    p_consent: formData.get("consent") === "on", p_honeypot: String(formData.get("website") ?? ""), p_utm: utm,
  });
  if (error) redirect(`/ev/${org}/${slug}?erro=${encodeURIComponent(error.message)}#inscricao`);
  if (!data) redirect(`/ev/${org}/${slug}`);
  await afterEvent(String(data), base).catch(() => {});
  redirect(`/ev/ok/${data}`);
}
