import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { QuizRunner } from "@/components/QuizRunner";
import type { QuizConfig } from "@/lib/magnets";
import { submitMagnet } from "./actions";
import { utmFrom } from "@/lib/utm";
import type { Landing } from "@/lib/landing";
import { NoirAbout, NoirBook, NoirDeliverables, NoirFinal, NoirHero, NoirHonest, NoirList, NoirProof, NoirShell, NoirTicker } from "@/components/noir/Noir";
import { StickyCta } from "@/components/noir/StickyCta";
import { AbCookie, MetaPixel } from "@/components/noir/Measure";
import { GuideForm } from "@/components/noir/GuideForm";
import { NoirQuiz } from "@/components/noir/NoirQuiz";

export const dynamic = "force-dynamic";
type M = { kind: "quiz" | "ebook" | "guide"; title: string; subtitle: string | null; config: QuizConfig & Partial<Landing> & { content?: string; landing?: Landing }; org: string; author: string; proof?: { testimonials: string | null; count: number } };

export async function generateMetadata({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const { org, slug } = await params;
  const { data } = await anonClient().rpc("public_magnet_peek", { p_org: org, p_slug: slug });
  const m = data as { title: string; subtitle: string | null; author: string; config?: { intro?: string } } | null;
  if (!m) return { title: "Página indisponível" };
  const h = await headers();
  const metadataBase = new URL(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`);
  const description = m.subtitle || m.config?.intro || "Descobre onde estás a perder clientes e o que mudar primeiro.";
  return { metadataBase, title: `${m.title} · ${m.author}`, description, openGraph: { title: m.title, description, type: "website", locale: "pt_PT" }, twitter: { card: "summary_large_image", title: m.title, description } };
}

export default async function MagnetPage({ params, searchParams }: { params: Promise<{ org: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org, slug } = await params;
  const sp = await searchParams;
  const u = utmFrom(sp);
  // Teste A/B: a pessoa vê sempre a mesma versão (cookie); sem cookie, sorteio 50/50
  const abKey = `nr_ab_${slug.replace(/[^a-z0-9-]/gi, "")}`;
  const jar = await cookies();
  const saved = jar.get(abKey)?.value;
  const peek = await anonClient().rpc("public_magnet_peek", { p_org: org, p_slug: slug });
  const pc = (peek.data as { kind?: string; config?: Landing & { landing?: Landing } } | null);
  const ab = (pc?.kind === "guide" ? pc?.config : pc?.config?.landing)?.ab;
  const variant = ab?.on && ab.lines?.length ? (saved === "A" || saved === "B" ? saved : Math.random() < 0.5 ? "A" : "B") : "A";
  const utm = JSON.stringify({ ...(u ?? {}), ...(variant === "B" ? { variant: "B" } : ab?.on ? { variant: "A" } : {}) });
  const { data } = await anonClient().rpc("public_magnet", { p_org: org, p_slug: slug, p_channel: u?.source ?? null, p_variant: variant });
  const m = data as (M & { pixel?: string | null }) | null;
  if (!m) notFound();
  let initial: number[] | undefined;
  try { initial = sp.passo === "contacto" && sp.r ? (JSON.parse(sp.r) as number[]) : undefined; } catch { initial = undefined; }

  // Estilo da marca (preto e dourado)
  const land0: Landing | undefined = m.kind === "guide" ? (m.config as unknown as Landing) : m.config.landing;
  const land: Landing | undefined = land0 && variant === "B" && land0.ab ? { ...land0, hero: { ...land0.hero, lines: land0.ab.lines ?? land0.hero.lines, accent: land0.ab.accent ?? land0.hero.accent, lead: land0.ab.lead ?? land0.hero.lead } } : land0;
  if (land?.theme === "noir") {
    const areas = land.areas ?? [];
    const consent = land.consent ?? "Aceito receber mensagens. Sem spam, e paro quando me pedires.";
    const capture = m.kind === "guide"
      ? <GuideForm org={org} slug={slug} areas={areas} consent={consent} cta={land.hero.cta ?? "MANDA-ME O GUIA"} note={land.hero.note} submit={submitMagnet} error={sp.erro} utm={utm} />
      : <NoirQuiz cfg={m.config} org={org} slug={slug} areas={areas} consent={consent} cta={land.hero.cta ?? "FAZER O TESTE"} note={land.hero.note} submit={submitMagnet} error={sp.erro} initial={initial} utm={utm} />;
    const anchor = m.kind === "guide" ? "#guia" : "#teste";
    return (
      <NoirShell l={land}>
        <NoirHero h={land.hero}>
          {m.kind === "guide" ? <div className="nr-hero-grid">{capture}<NoirBook title={m.title} author={land.brand ?? m.author} /></div> : capture}
          <NoirProof testimonials={m.proof?.testimonials} count={m.proof?.count} label={m.kind === "guide" ? "freelancers já pediram o guia" : "freelancers já fizeram o teste"} />
        </NoirHero>
        {land.ticker && <NoirTicker items={land.ticker} />}
        {land.honest && <NoirHonest h={land.honest} />}
        {land.list && <div style={{ paddingTop: land.honest ? 0 : 120 }}><NoirList l={land.list} /></div>}
        {land.deliverables && <NoirDeliverables d={land.deliverables} />}
        {land.about && <NoirAbout a={land.about} />}
        {land.final && <NoirFinal f={land.final} href={anchor} />}
        <StickyCta target={anchor} label={land.final?.cta ?? land.hero.cta ?? "QUERO"} />
        {land.ab?.on && <AbCookie name={abKey} value={variant} />}
        <MetaPixel id={m.pixel} />
      </NoirShell>
    );
  }

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-white">{m.author.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
          <p className="text-sm font-medium text-muted">{m.author}</p>
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.8px] sm:text-[40px]">{m.title}</h1>
          <p className="max-w-[520px] text-[16px] leading-relaxed text-ink-2">{m.subtitle || m.config.intro}</p>
        </div>
        {m.kind === "quiz" ? <QuizRunner cfg={m.config} org={org} slug={slug} submit={submitMagnet} error={sp.erro} initial={initial} utm={utm} /> : (
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
