"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";

export async function book(formData: FormData) {
  const org = String(formData.get("org"));
  const rid = String(formData.get("rid") || "");
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { data, error } = await anonClient().rpc("public_book", {
    p_org: org, p_start: String(formData.get("start")), p_name: String(formData.get("name") ?? ""), p_email: String(formData.get("email") ?? ""),
    p_phone: String(formData.get("phone") ?? ""), p_notes: String(formData.get("notes") ?? ""), p_rid: /^[0-9a-f-]{36}$/.test(rid) ? rid : null, p_base: base,
    p_honeypot: String(formData.get("website") ?? ""),
  });
  if (error) redirect(`/b/${org}?erro=${encodeURIComponent(error.message)}${rid ? `&r=${rid}` : ""}`);
  if (!data) redirect(`/b/${org}`);
  redirect(`/m/${data}?nova=1`);
}
