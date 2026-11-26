import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export const metadata = { title: "Cancelar subscrição", robots: { index: false } };

async function confirm(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: "p360" }, auth: { persistSession: false } });
  await sb.rpc("unsubscribe", { p_outbox: id });
  redirect(`/u/${id}?ok=1`);
}

export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { ok } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-[440px] flex flex-col gap-4 text-center">
        {ok ? (<>
          <h1 className="text-2xl font-bold">Pronto</h1>
          <p className="text-sm text-muted">Não vais receber mais emails automáticos. Se foi engano, basta responderes a um dos emails anteriores.</p>
        </>) : (<>
          <h1 className="text-2xl font-bold">Deixar de receber emails?</h1>
          <p className="text-sm text-muted">Confirma e deixas de receber os emails automáticos. Continuas a poder contactar-me quando quiseres.</p>
          <form action={confirm}><input type="hidden" name="id" value={/^[0-9a-f-]{36}$/.test(id) ? id : ""} /><button className="btn w-full">Sim, não quero receber mais</button></form>
        </>)}
      </div>
    </main>
  );
}
