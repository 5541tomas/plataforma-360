import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Access = "none" | "read" | "write";
export type Module = "goals" | "finance" | "crm";

export type AppContext = {
  userId: string;
  email: string;
  name: string;
  org: { id: string; name: string };
  role: "owner" | "admin" | "member";
  perms: Record<Module, Access>;
};

/** Utilizador autenticado + organização ativa + permissões. Redireciona se faltar algo. */
export const getContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("role, perm_goals, perm_finance, perm_crm, organizations(id, name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/onboarding");

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const org = member.organizations as unknown as { id: string; name: string };
  return {
    userId: user.id,
    email: user.email ?? "",
    name: profile?.full_name ?? user.email ?? "",
    org,
    role: member.role,
    perms: { goals: member.perm_goals, finance: member.perm_finance, crm: member.perm_crm },
  };
});

export async function requireModule(module: Module, level: "read" | "write" = "read") {
  const ctx = await getContext();
  const a = ctx.perms[module];
  if (a === "none" || (level === "write" && a !== "write")) redirect("/");
  return ctx;
}

export const canWrite = (ctx: AppContext, m: Module) => ctx.perms[m] === "write";
export const canRead = (ctx: AppContext, m: Module) => ctx.perms[m] !== "none";
