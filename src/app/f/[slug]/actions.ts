"use server";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export async function submitLead(formData: FormData) {
  const slug = String(formData.get("slug"));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: "p360" }, auth: { persistSession: false } });
  const { error } = await supabase.rpc("public_lead", {
    p_slug: slug, p_name: String(formData.get("name") ?? ""), p_email: String(formData.get("email") ?? ""), p_phone: String(formData.get("phone") ?? ""),
    p_message: String(formData.get("message") ?? ""), p_interest: String(formData.get("interest") ?? ""), p_source: String(formData.get("source") ?? ""),
    p_honeypot: String(formData.get("website") ?? ""),
  });
  if (error) redirect(`/f/${slug}?erro=${encodeURIComponent(error.message)}`);
  redirect(`/f/${slug}?ok=1`);
}
