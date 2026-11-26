import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createOrg(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: String(formData.get("name")) });
  if (error) redirect(`/onboarding?erro=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form action={createOrg} className="card w-full max-w-[440px] flex flex-col gap-4">
        <h1 className="text-[26px] font-bold tracking-[-0.6px]">Vamos configurar a tua empresa</h1>
        <p className="text-sm text-muted">Criamos já um pipeline de consultoria e categorias financeiras pessoais e da empresa. Podes mudar tudo depois.</p>
        <label className="flex flex-col gap-1.5"><span className="label">Nome da empresa</span><input name="name" className="input" required placeholder="Ex.: A minha consultora" /></label>
        {erro && <p role="alert" className="text-sm text-warn">{erro}</p>}
        <button className="btn">Começar</button>
      </form>
    </main>
  );
}
