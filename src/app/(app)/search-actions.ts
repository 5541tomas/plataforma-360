"use server";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { revalidatePath } from "next/cache";
import { today } from "@/lib/format";

export type Hit = { group: string; label: string; meta?: string; href: string };

/** Pesquisa global: contactos, negócios, empresas, tarefas, objetivos e movimentos (respeita as permissões). */
export async function globalSearch(q: string): Promise<Hit[]> {
  const ctx = await getContext();
  const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const supabase = await createClient();
  const crm = ctx.perms.crm !== "none", fin = ctx.perms.finance !== "none", goals = ctx.perms.goals !== "none";
  const none = Promise.resolve({ data: [] as never[] });
  const [contacts, deals, companies, tasks, gs, txs, objs] = await Promise.all([
    crm ? supabase.from("contacts").select("id, name, email, phone").eq("org_id", ctx.org.id).or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(6) : none,
    crm ? supabase.from("v_deals").select("id, title, stage_name, status, company_name").eq("org_id", ctx.org.id).or(`title.ilike.${like},company_name.ilike.${like}`).order("created_at", { ascending: false }).limit(6) : none,
    crm ? supabase.from("companies").select("id, name").eq("org_id", ctx.org.id).ilike("name", like).limit(4) : none,
    supabase.from("tasks").select("id, title, due_date, deal_id").eq("org_id", ctx.org.id).eq("done", false).ilike("title", like).limit(5),
    goals ? supabase.from("goals").select("id, title, horizon").eq("org_id", ctx.org.id).ilike("title", like).limit(4) : none,
    fin ? supabase.from("transactions").select("id, description, amount, date").eq("org_id", ctx.org.id).ilike("description", like).order("date", { ascending: false }).limit(5) : none,
    crm ? supabase.from("objections").select("id, title, category").eq("org_id", ctx.org.id).or(`title.ilike.${like},response.ilike.${like}`).limit(4) : none,
  ]);
  const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  const st: Record<string, string> = { won: "Ganho", lost: "Perdido" };
  return [
    ...(contacts.data ?? []).map((c: { id: string; name: string; email: string | null; phone: string | null }) => ({ group: "Contactos", label: c.name, meta: c.email ?? c.phone ?? undefined, href: `/crm/contactos/${c.id}` })),
    ...(deals.data ?? []).map((d: { id: string; title: string; stage_name: string; status: string; company_name: string | null }) => ({ group: "Negócios", label: d.title, meta: [d.company_name, st[d.status] ?? d.stage_name].filter(Boolean).join(" · "), href: `/crm/${d.id}` })),
    ...(companies.data ?? []).map((c: { id: string; name: string }) => ({ group: "Empresas", label: c.name, href: `/crm/empresas/${c.id}` })),
    ...(tasks.data ?? []).map((t: { id: string; title: string; due_date: string | null; deal_id: string | null }) => ({ group: "Tarefas", label: t.title, meta: t.due_date ?? "sem data", href: t.deal_id ? `/crm/${t.deal_id}` : "/objetivos" })),
    ...(gs.data ?? []).map((g: { id: string; title: string }) => ({ group: "Objetivos", label: g.title, href: "/objetivos" })),
    ...(objs.data ?? []).map((o: { id: string; title: string; category: string }) => ({ group: "Objeções", label: o.title, meta: o.category, href: `/crm/objecoes#${o.id}` })),
    ...(txs.data ?? []).map((t: { id: string; description: string; amount: number; date: string }) => ({ group: "Movimentos", label: t.description, meta: `${eur(Number(t.amount))} · ${t.date}`, href: `/financas?q=${encodeURIComponent(term)}` })),
  ];
}

export async function quickTask(title: string) {
  const ctx = await getContext();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({ org_id: ctx.org.id, title: title.slice(0, 300), due_date: today() });
  revalidatePath("/");
  return error ? error.message : null;
}
