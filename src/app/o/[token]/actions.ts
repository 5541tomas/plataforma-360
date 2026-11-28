"use server";
import { redirect } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";

export async function submitTestimonial(formData: FormData) {
  const token = String(formData.get("token"));
  if (String(formData.get("website") ?? "")) redirect(`/o/${token}?ok=1`);
  const { error } = await anonClient().rpc("public_testimonial_submit", {
    p_token: token, p_name: String(formData.get("name") ?? ""), p_role: String(formData.get("role") ?? ""), p_company: String(formData.get("company") ?? ""),
    p_text: String(formData.get("text") ?? ""), p_rating: Number(formData.get("rating") ?? 0) || null, p_permission: formData.get("permission") === "on",
  });
  if (error) redirect(`/o/${token}?erro=${encodeURIComponent(error.message)}`);
  redirect(`/o/${token}?ok=1`);
}
