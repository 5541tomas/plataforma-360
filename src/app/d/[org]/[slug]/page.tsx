import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { QuizRunner } from "@/components/QuizRunner";
import type { QuizConfig } from "@/lib/magnets";
import { submitMagnet } from "./actions";

export const dynamic = "force-dynamic";
type M = { kind: "quiz" | "ebook"; title: string; subtitle: string | null; config: QuizConfig & { content?: string }; org: string; author: string };

export async function generateMetadata({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const { org, slug } = await params;
  const { data } = await anonClient().rpc("public_magnet_peek", { p_org: org, p_slug: slug });
  const m = data as { title: string; subtitle: string | null; author: string; config?: { intro?: string } } | null;
  if (!m) return { title: "Página indisponível" };
  const description = m.subtitle || m.config?.intro || "Descobre onde estás a perder clientes e o que mudar primeiro.";
  return { title: `${m.title} · ${m.author}`, description, openGraph: { title: m.title, description, type: "website", locale: "pt_PT" }, twitter: { card: "summary_large_image", title: m.title, description } };
}

export default async function MagnetPage({ params, searchParams }: { params: Promise<{ org: string; slug: string }>; searchParams: Promise<{ erro?: string; passo?: string; r?: string }> }) {
  const { org, slug } = await params;
  const sp = await searchParams;
  const { data } = await anonClient().rpc("public_magnet", { p_org: org, p_slug: slug });
  const m = data as M | null;
  if (!m) notFound();
  let initial: number[] | undefined;
  try { initial = sp.passo === "contacto" && sp.r ? (JSON.parse(sp.r) as number[]) : undefined; } catch { initial = undefined; }

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-white">{m.author.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
          <p className="text-sm font-medium text-muted">{m.author}</p>
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.8px] sm:text-[40px]">{m.title}</h1>
          <p className="max-w-[520px] text-[16px] leading-relaxed text-ink-2">{m.subtitle || m.config.intro}</p>
        </div>
        {m.kind === "quiz" ? <QuizRunner cfg={m.config} org={org} slug={slug} submit={submitMagnet} error={sp.erro} initial={initial} /> : (
          <form action={submitMagnet} className="card flex flex-col gap-4">
            <div className="mx-auto flex h-40 w-32 flex-col justify-between rounded-lg bg-gradient-to-br from-[#0B1B33] to-[#0071E3] p-3 text-left text-white shadow-lg" aria-hidden="true">
              <span className="text-[8px] font-semibold uppercase tracking-[1px] opacity-70">Ebook gratuito</span><span className="text-[13px] font-bold leading-tight">{m.title}</span><span className="text-[8px] opacity-70">{m.author}</span>
            </div>
            {sp.erro && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{sp.erro}</p>}
            <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} />
            <div aria-hidden="true" className="absolute -left-[9999px]"><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" required autoComplete="name" className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
            <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" /> Quero receber dicas de vendas por email. Posso cancelar a qualquer momento.</label>
            <button className="btn !min-h-12 text-base">Ler o ebook agora</button>
          </form>
        )}
        <p className="text-center text-xs text-muted">{m.org}</p>
      </div>
    </main>
  );
}
