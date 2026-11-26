import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur } from "@/lib/format";
import { Empty, Kpi, PageHeader } from "@/components/ui";
import { saveCompany } from "../../actions";

export default async function CompanyPage({ params }: { params: Promise<{ eid: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { eid } = await params;
  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("*").eq("id", eid).eq("org_id", ctx.org.id).maybeSingle();
  if (!co) notFound();
  const [{ data: contacts }, { data: deals }] = await Promise.all([
    supabase.from("contacts").select("id, name, role, email, phone").eq("company_id", eid).order("name"),
    supabase.from("v_deals").select("id, title, stage_name, status, kind, value, total_value, product_name").eq("company_id", eid).order("created_at", { ascending: false }),
  ]);
  const won = (deals ?? []).filter((d) => d.status === "won").reduce((s, d) => s + Number(d.total_value), 0);
  const open = (deals ?? []).filter((d) => d.status === "open").reduce((s, d) => s + Number(d.total_value), 0);

  return (
    <>
      <PageHeader eyebrow={co.industry ?? "Empresa"} title={co.name}><Link href="/crm/empresas" className="btn-ghost">‹ Empresas</Link></PageHeader>
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <Kpi label="Faturado (ganho)" value={eur(won)} tone={won > 0 ? "good" : undefined} />
        <Kpi label="Em negociação" value={eur(open)} />
        <Kpi label="Contactos" value={String(contacts?.length ?? 0)} />
      </section>
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Negócios</h2>
          {(deals?.length ?? 0) === 0 ? <Empty>Sem negócios.</Empty> : deals!.map((d) => (
            <Link key={d.id} href={`/crm/${d.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 hover:bg-soft">
              <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium truncate">{d.title}</span><span className="text-xs text-muted">{d.stage_name}{d.product_name ? ` · ${d.product_name}` : ""}</span></div>
              <span className="text-sm font-semibold">{eur(d.value)}{d.kind === "retainer" ? "/mês" : ""}</span>
            </Link>
          ))}
        </div>
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Pessoas</h2>
          {(contacts?.length ?? 0) === 0 ? <Empty>Sem contactos.</Empty> : contacts!.map((c) => (
            <Link key={c.id} href={`/crm/contactos/${c.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-soft">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-soft text-xs font-semibold">{c.name.slice(0, 2).toUpperCase()}</div>
              <div className="flex min-w-0 flex-col"><span className="text-sm font-medium">{c.name}</span><span className="text-xs text-muted">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</span></div>
            </Link>
          ))}
        </div>
        <form action={saveCompany} className="card grid grid-cols-2 gap-2">
          <h2 className="h2 col-span-2 mb-1">Dados</h2>
          <fieldset disabled={!write} className="contents">
            <input type="hidden" name="id" value={co.id} />
            <label className="flex flex-col gap-1 col-span-2"><span className="label">Nome</span><input name="name" defaultValue={co.name} className="input" required /></label>
            <label className="flex flex-col gap-1"><span className="label">NIF</span><input name="nif" defaultValue={co.nif ?? ""} className="input" /></label>
            <label className="flex flex-col gap-1"><span className="label">Setor</span><input name="industry" defaultValue={co.industry ?? ""} className="input" /></label>
            <label className="flex flex-col gap-1 col-span-2"><span className="label">Site</span><input name="website" defaultValue={co.website ?? ""} className="input" /></label>
            <label className="flex flex-col gap-1 col-span-2"><span className="label">Notas</span><textarea name="notes" rows={3} defaultValue={co.notes ?? ""} className="input py-2.5" /></label>
            {write && <button className="btn-ghost col-span-2">Guardar</button>}
          </fieldset>
        </form>
      </section>
    </>
  );
}
