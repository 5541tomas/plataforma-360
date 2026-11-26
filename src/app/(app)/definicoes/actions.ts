"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";

const back = (msg: string, ok = true) => redirect(`/definicoes?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);

export async function updateProfile(formData: FormData) {
  await getContext();
  const supabase = await createClient();
  await supabase.rpc("ensure_profile", { p_name: String(formData.get("full_name")) });
  revalidatePath("/", "layout");
  back("Perfil atualizado.");
}

export async function changePassword(formData: FormData) {
  await getContext();
  const pw = String(formData.get("password")), pw2 = String(formData.get("password2"));
  if (pw.length < 8) back("A palavra-passe precisa de pelo menos 8 caracteres.", false);
  if (pw !== pw2) back("As palavras-passe não coincidem.", false);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) back(error.message, false);
  back("Palavra-passe alterada.");
}

export async function renameOrg(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ name: String(formData.get("name")) }).eq("id", ctx.org.id);
  if (error) back(error.message, false);
  revalidatePath("/", "layout");
  back("Nome da empresa atualizado.");
}

export async function addMember(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_member_by_email", {
    p_org: ctx.org.id, p_email: String(formData.get("email")),
    p_goals: String(formData.get("perm_goals")), p_finance: String(formData.get("perm_finance")), p_crm: String(formData.get("perm_crm")),
    p_role: String(formData.get("role") || "member"),
  });
  if (error) back(error.message, false);
  if (data === "not_found") back("Esse email ainda não tem conta. Cria-a primeiro no Supabase (Authentication → Users → Add user) e volta a adicionar.", false);
  revalidatePath("/definicoes");
  back("Membro adicionado.");
}

export async function updateMember(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({
    role: String(formData.get("role")),
    perm_goals: String(formData.get("perm_goals")), perm_finance: String(formData.get("perm_finance")), perm_crm: String(formData.get("perm_crm")),
  }).eq("org_id", ctx.org.id).eq("user_id", String(formData.get("user_id")));
  if (error) back(error.message, false);
  revalidatePath("/definicoes");
  back("Permissões atualizadas.");
}

export async function removeMember(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("org_id", ctx.org.id).eq("user_id", String(formData.get("user_id")));
  if (error) back(error.message, false);
  revalidatePath("/definicoes");
  back("Membro removido.");
}
