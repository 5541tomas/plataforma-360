"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect(`/login?erro=${encodeURIComponent("Email ou palavra-passe incorretos.")}`);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: {
      data: { full_name: String(formData.get("name") ?? "") },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) redirect(`/login?modo=registo&erro=${encodeURIComponent(error.message)}`);
  redirect("/login?info=" + encodeURIComponent("Verifica o teu email para confirmar a conta."));
}
