import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur } from "@/lib/format";
import { Disclosure, Empty, PageHeader } from "@/components/ui";
import { saveCompany } from "../actions";

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("companies").select("id, name, industry, website, nif").eq("org_id", ctx.org.id).order("name").limit(500);
  if (q) query = query.ilike("name", `%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: companies }, { data: deals }, { data: contacts }] = await Promise.all([
    query,
    supabase.from("v_deals").select("company_id, status, total_value").eq("org_id", ctx.org.id),
    supabase.from("contacts").select("company_id").eq("org_id", ctx.org.id),
  ]);
  const stats = new Map<string, { open: number; won: number; contacts: number }>();
  const st = (id: string) => { if (!stats.has(id)) stats.set(id, { open: 0, won: 0, contacts: 0 }); return stats.get(id)!; };
  (deals ?? []).forEach((d) => { if (!d.company_id) return; if (d.status === "open") st(d.company_id).open += Number(d.total_value); if (d.status === "won") st(d.company_id).won += Number(d.total_value); });
  (contacts ?? []).forEach((c) => { if (c.company_id) st(c.company_id).contacts++; });

  return (
    <>
      <PageHeader title="Empresas">
        <form className="flex gap-2"><label className="sr-only" htmlFor="eq">Pesquisar</label>
          <input id="eq" name="q" defaultValue={q} placeholder="Pesquisar empresa…" className="input min-w-[220px]" /><button className="btn-ghost">Pesquisar</button></form>
        {write && (
          <Disclosure label="+ Empresa" primary>
            <form action={saveCompany} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">NIF</span><input name="nif" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Setor</span><input name="industry" className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Site</span><input name="website" className="input" /></label>
              <button className="btn">Criar empresa</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>
      {(companies?.length ?? 0) === 0 ? <Empty>{q ? "Nenhuma empresa encontrada." : "Ainda não tens empresas."}</Empty> : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {companies!.map((c) => {
            const s = stats.get(c.id) ?? { open: 0, won: 0, contacts: 0 };
            return (
              <Link key={c.id} href={`/crm/empresas/${c.id}`} className="card !p-5 flex flex-col gap-2 hover:ring-2 hover:ring-accent/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold text-accent-ink">{c.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0"><div className="font-semibold truncate">{c.name}</div><div className="text-xs text-muted">{c.industry ?? "—"}</div></div>
                </div>
                <div className="flex gap-4 text-xs text-ink-2"><span>{s.contacts} contactos</span><span>Aberto {eur(s.open)}</span><span className="text-good">Ganho {eur(s.won)}</span></div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
