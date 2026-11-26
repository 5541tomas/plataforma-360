import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { submitLead } from "./actions";

export const dynamic = "force-dynamic";
type Info = { name: string; title: string | null; intro: string | null; products: string[] };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Contacto · ${slug}`, robots: { index: true } };
}

export default async function PublicForm({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; erro?: string; origem?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: "p360" }, auth: { persistSession: false } });
  const { data } = await supabase.rpc("public_form_info", { p_slug: slug });
  const info = data as Info | null;
  if (!info) notFound();

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-white">{info.name.slice(0, 2).toUpperCase()}</div>
          <p className="text-sm font-medium text-muted">{info.name}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.7px]">{info.title || "Vamos conversar?"}</h1>
          <p className="text-[15px] text-ink-2">{info.intro || "Deixa os teus contactos e uma breve descrição do que precisas. Respondo em menos de 24 horas úteis."}</p>
        </div>
        {sp.ok ? (
          <div className="card flex flex-col items-center gap-2 text-center" role="status">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-good-soft text-xl text-good">✓</div>
            <h2 className="text-xl font-semibold">Mensagem recebida</h2>
            <p className="text-sm text-muted">Obrigado! Vou entrar em contacto muito em breve.</p>
          </div>
        ) : (
          <form action={submitLead} className="card flex flex-col gap-4">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="source" value={sp.origem ?? ""} />
            <div aria-hidden="true" className="absolute -left-[9999px]"><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" required autoComplete="name" className="input" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" autoComplete="email" className="input" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Telemóvel</span><input name="phone" type="tel" autoComplete="tel" className="input" /></label>
            </div>
            {info.products.length > 0 && (
              <label className="flex flex-col gap-1.5"><span className="label">Tenho interesse em</span>
                <select name="interest" className="input"><option value="">Ainda não sei / outro</option>{info.products.map((p) => <option key={p}>{p}</option>)}</select></label>
            )}
            <label className="flex flex-col gap-1.5"><span className="label">Como posso ajudar?</span><textarea name="message" rows={4} className="input py-2.5" /></label>
            {sp.erro && <p role="alert" className="text-sm text-warn">{sp.erro}</p>}
            <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" /> Aceito receber dicas e novidades por email. Posso cancelar a qualquer momento.</label>
            <button className="btn">Enviar</button>
            <p className="text-center text-xs text-muted">Os teus dados são usados apenas para responder a este pedido.</p>
          </form>
        )}
      </div>
    </main>
  );
}
