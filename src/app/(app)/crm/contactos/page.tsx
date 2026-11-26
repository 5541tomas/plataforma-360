import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { Disclosure, Empty, PageHeader } from "@/components/ui";
import { waLink } from "@/lib/whatsapp";
import { WaIcon } from "@/components/WhatsAppMenu";
import { createContact } from "../actions";

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("contacts").select("id, name, email, phone, role, source, companies(name)").eq("org_id", ctx.org.id).order("name").limit(500);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: contacts }, { data: deals }] = await Promise.all([
    query,
    supabase.from("deals").select("contact_id, status").eq("org_id", ctx.org.id),
  ]);
  const openBy = new Map<string, number>();
  (deals ?? []).forEach((d) => { if (d.contact_id && d.status === "open") openBy.set(d.contact_id, (openBy.get(d.contact_id) ?? 0) + 1); });

  return (
    <>
      <PageHeader title="Contactos">
        <form className="flex gap-2"><label className="sr-only" htmlFor="cq">Pesquisar</label>
          <input id="cq" name="q" defaultValue={q} placeholder="Pesquisar nome ou email…" className="input min-w-[240px]" /><button className="btn-ghost">Pesquisar</button></form>
        {write && <Link href="/crm/contactos/importar" className="btn-ghost">Importar CSV</Link>}
        {write && (
          <Disclosure label="+ Contacto" primary>
            <form action={createContact} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Telemóvel</span><input name="phone" type="tel" className="input" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Empresa</span><input name="company" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Cargo</span><input name="role" className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Origem</span><input name="source" list="src" className="input" />
                <datalist id="src"><option value="Referência" /><option value="LinkedIn" /><option value="Site" /><option value="Instagram" /><option value="Evento" /></datalist></label>
              <button className="btn">Criar contacto</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>
      {(contacts?.length ?? 0) === 0 ? <Empty>{q ? "Nenhum contacto encontrado." : "Ainda não tens contactos. Adiciona o primeiro ou cria uma oportunidade com contacto."}</Empty> : (
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#F7F7F9] text-left text-xs text-muted"><tr>
              <th className="px-4 py-2.5 font-medium">Nome</th><th className="px-4 py-2.5 font-medium">Empresa</th><th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Telemóvel</th><th className="px-4 py-2.5 font-medium">Origem</th><th className="px-4 py-2.5 font-medium">Negócios abertos</th><th className="px-4 py-2.5"><span className="sr-only">WhatsApp</span></th></tr></thead>
            <tbody>
              {contacts!.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-2.5"><Link href={`/crm/contactos/${c.id}`} className="font-medium hover:text-accent-ink">{c.name}</Link>{c.role && <div className="text-xs text-muted">{c.role}</div>}</td>
                  <td className="px-4 py-2.5 text-ink-2">{(c.companies as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">{c.email ? <a href={`mailto:${c.email}`} className="text-accent-ink">{c.email}</a> : "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.source ?? "—"}</td>
                  <td className="px-4 py-2.5">{openBy.get(c.id) ?? 0}</td>
                  <td className="px-4 py-2.5">{c.phone && <a href={waLink(c.phone, `Olá ${c.name.split(" ")[0]}, `)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp para ${c.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#128C4A] hover:bg-good-soft"><WaIcon size={18} /></a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
