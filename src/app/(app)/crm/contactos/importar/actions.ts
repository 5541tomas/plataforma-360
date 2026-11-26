"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";

export type Row = { name: string; email?: string; phone?: string; company?: string; role?: string; source?: string; notes?: string };

/** Importa contactos: evita duplicados (email ou telemóvel), cria empresas pelo nome. */
export async function importContacts(rows: Row[], consent: boolean): Promise<{ created: number; updated: number; skipped: number; error?: string }> {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const clean = rows.slice(0, 3000).map((r) => ({
    name: (r.name ?? "").trim().slice(0, 120), email: (r.email ?? "").trim().toLowerCase().slice(0, 200) || null, phone: (r.phone ?? "").trim().slice(0, 40) || null,
    company: (r.company ?? "").trim().slice(0, 120) || null, role: (r.role ?? "").trim().slice(0, 80) || null, source: (r.source ?? "").trim().slice(0, 80) || "Importação", notes: (r.notes ?? "").trim().slice(0, 4000) || null,
  }));
  clean.forEach((r) => { if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) r.email = null; });
  const valid = clean.filter((r) => r.name);
  let skipped = clean.length - valid.length;
  const { data: existing } = await supabase.from("contacts").select("id, email, phone, company_id, role").eq("org_id", ctx.org.id).limit(10000);
  const byEmail = new Map((existing ?? []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));
  const digits = (p: string | null) => (p ?? "").replace(/\D/g, "").slice(-9);
  const byPhone = new Map((existing ?? []).filter((c) => digits(c.phone).length === 9).map((c) => [digits(c.phone), c]));
  // Empresas
  const names = [...new Set(valid.map((r) => r.company).filter(Boolean))] as string[];
  const { data: comps } = await supabase.from("companies").select("id, name").eq("org_id", ctx.org.id);
  const compId = new Map((comps ?? []).map((c) => [c.name.toLowerCase(), c.id]));
  const missing = names.filter((n) => !compId.has(n.toLowerCase()));
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await supabase.from("companies").insert(missing.slice(i, i + 200).map((name) => ({ org_id: ctx.org.id, name }))).select("id, name");
    (data ?? []).forEach((c) => compId.set(c.name.toLowerCase(), c.id));
  }
  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = []; let updated = 0; const seen = new Set<string>();
  for (const r of valid) {
    const key = r.email ?? (digits(r.phone).length === 9 ? "t" + digits(r.phone) : "n" + r.name.toLowerCase());
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const company_id = r.company ? compId.get(r.company.toLowerCase()) ?? null : null;
    const ex = (r.email && byEmail.get(r.email)) || (digits(r.phone).length === 9 && byPhone.get(digits(r.phone)));
    if (ex) {
      const patch: Record<string, unknown> = {};
      if (!ex.company_id && company_id) patch.company_id = company_id;
      if (!ex.role && r.role) patch.role = r.role;
      if (!ex.phone && r.phone) patch.phone = r.phone;
      if (!ex.email && r.email) patch.email = r.email;
      if (consent) Object.assign(patch, { consent_marketing: true, consent_at: now });
      if (Object.keys(patch).length) { await supabase.from("contacts").update(patch).eq("id", ex.id); updated++; } else skipped++;
      continue;
    }
    inserts.push({ org_id: ctx.org.id, name: r.name, email: r.email, phone: r.phone, company_id, role: r.role, source: r.source, notes: r.notes, ...(consent ? { consent_marketing: true, consent_at: now } : {}) });
  }
  let created = 0;
  for (let i = 0; i < inserts.length; i += 500) {
    const { error, count } = await supabase.from("contacts").insert(inserts.slice(i, i + 500), { count: "exact" });
    if (error) return { created, updated, skipped, error: error.message };
    created += count ?? 0;
  }
  revalidatePath("/crm/contactos");
  return { created, updated, skipped };
}
