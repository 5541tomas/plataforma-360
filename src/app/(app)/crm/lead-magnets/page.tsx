import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { dateShort, eur } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { qrSvg } from "@/lib/qr";
import { GuideUpload } from "@/components/GuideUpload";
import type { Offer } from "@/lib/magnets";
import { saveMagnet, seedBrandMagnets, setMeetingUrl, setPublicSlug } from "./actions";

type Mag = { id: string; slug: string; kind: "quiz" | "ebook" | "guide"; title: string; subtitle: string | null; config: { content?: string; areas?: { key: string; name: string }[] }; offer: Offer & { whatsapp?: string; keyword?: string; guide_url?: string; whatsapp_body?: string }; sequence_id: string | null; active: boolean; views: number };
type Resp = { id: string; magnet_id: string; contact_id: string | null; deal_id: string | null; total: number | null; weakest: string | null; created_at: string };

export default async function LeadMagnetsPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const sp = await searchParams;
  const supabase = await createClient();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [{ data: org }, { data: mags }, { data: resps }, { data: seqs }] = await Promise.all([
    supabase.from("organizations").select("public_slug, name").eq("id", ctx.org.id).single(),
    supabase.from("lead_magnets").select("*").eq("org_id", ctx.org.id).order("created_at"),
    supabase.from("magnet_responses").select("id, magnet_id, contact_id, deal_id, total, weakest, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(1000),
    supabase.from("sequences").select("id, name").eq("org_id", ctx.org.id).order("created_at"),
  ]);
  const responses = (resps ?? []) as Resp[];
  const contactIds = [...new Set(responses.map((r) => r.contact_id).filter(Boolean))] as string[];
  const [{ data: deals }, { data: stages }, { data: contacts }] = await Promise.all([
    contactIds.length ? supabase.from("deals").select("id, contact_id, status, stage_id, value, closed_at, created_at").in("contact_id", contactIds) : Promise.resolve({ data: [] }),
    supabase.from("stages").select("id, position").eq("org_id", ctx.org.id),
    contactIds.length ? supabase.from("contacts").select("id, name, score").in("id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  const pos = new Map((stages ?? []).map((s) => [s.id, s.position as number]));
  const cName = new Map((contacts ?? []).map((c) => [c.id, c as { id: string; name: string; score: number }]));
  const slug = org?.public_slug;
  const meetingUrl = ((mags ?? []) as Mag[]).find((m) => m.offer?.meeting_url)?.offer.meeting_url ?? "";

  const stats = (m: Mag) => {
    const rs = responses.filter((r) => r.magnet_id === m.id);
    const cs = new Set(rs.map((r) => r.contact_id));
    const first = new Map<string, string>(); rs.forEach((r) => { if (r.contact_id) first.set(r.contact_id, r.created_at); });
    const ds = (deals ?? []).filter((d) => cs.has(d.contact_id) && d.created_at >= (first.get(d.contact_id!) ?? "").slice(0, 10));
    const meetings = new Set(ds.filter((d) => d.status === "won" || (pos.get(d.stage_id) ?? 0) >= 1).map((d) => d.contact_id)).size;
    const won = ds.filter((d) => d.status === "won");
    const totals = rs.map((r) => r.total).filter((x): x is number => x != null);
    const weak: Record<string, number> = {}; rs.forEach((r) => { if (r.weakest) weak[r.weakest] = (weak[r.weakest] ?? 0) + 1; });
    return { leads: rs.length, meetings, wonN: new Set(won.map((d) => d.contact_id)).size, wonV: won.reduce((a, d) => a + Number(d.value), 0),
      avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null, weak: Object.entries(weak).sort((a, b) => b[1] - a[1]), rs };
  };
  const qrs = new Map<string, string>();
  if (slug) for (const m of (mags ?? []) as Mag[]) qrs.set(m.id, await qrSvg(`${base}/d/${slug}/${m.slug}`));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <>
      <PageHeader title="Lead magnets">
      </PageHeader>
      <p className="-mt-2 max-w-[720px] text-sm text-muted">Ofertas gratuitas que trazem leads qualificadas: cada pessoa entra no CRM com as respostas, a pontuação e a área mais fraca, recebe o resultado (depois de aprovares) e entra numa sequência que leva à reunião 1:1.</p>
      {sp.erro && <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{sp.erro}</p>}
      {write && slug && (!((mags ?? []) as Mag[]).some((m) => m.slug === "7-erros") || !((mags ?? []) as Mag[]).some((m) => m.slug === "7-pecados")) && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#0B0B0B] p-6 text-white">
          <div className="flex max-w-[560px] flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[3px] text-[#C9A55C]">No teu estilo · preto e dourado</span>
            <h2 className="text-[22px] font-bold tracking-[-0.4px]">Os 7 Erros do Freelancer + teste «Quantos pecados cometes?»</h2>
            <p className="text-sm text-white/70">A tua landing page, agora ligada ao CRM: cada pedido do guia entra como lead com a área de atividade, abre o teu WhatsApp como antes e começa a sequência de 5 mensagens em 10 dias (todas com a tua aprovação).</p>
          </div>
          <form action={seedBrandMagnets}><input type="hidden" name="which" value="both" /><button className="inline-flex min-h-11 items-center rounded-xl bg-[#C9A55C] px-5 text-sm font-bold text-[#080808] hover:bg-white">Criar os dois</button></form>
        </section>
      )}

      {write && (
        <section className="card grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          <form action={setPublicSlug} className="flex flex-col gap-2">
            <span className="label">O teu endereço público</span>
            <div className="flex gap-2"><span className="flex min-h-11 items-center text-sm text-muted">/d/</span><input name="slug" defaultValue={slug ?? "thomasfaria"} required className="input" /><button className="btn-ghost">Guardar</button></div>
            {!slug && <span className="text-xs text-warn">Define o endereço para poderes criar os lead magnets.</span>}
          </form>
          <form action={setMeetingUrl} className="flex flex-col gap-2">
            <span className="label">Link para marcar a reunião 1:1 (Google Calendar, Calendly…)</span>
            <div className="flex gap-2"><input name="meeting_url" type="url" defaultValue={meetingUrl} placeholder="https://calendar.app.google/…" className="input" /><button className="btn-ghost">Guardar</button></div>
            <span className="text-xs text-muted">{meetingUrl ? "Usado nos botões e emails." : "Deixa vazio para usares a tua Agenda de marcações (CRM → Agenda). Sem agenda ativa, o botão abre o teu WhatsApp ou email."}</span>
          </form>
        </section>
      )}

      {(mags ?? []).length === 0 ? <Empty>{slug ? "Carrega em “Criar os dois” para teres o teu guia «Os 7 Erros» e o teste «Quantos pecados cometes?» prontos, com a sequência de WhatsApp." : "Começa por definir o teu endereço público."}</Empty> : ((mags ?? []) as Mag[]).map((m) => {
        const s = stats(m);
        const url = `${base}/d/${slug}/${m.slug}`;
        return (
          <article key={m.id} className="card flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase tracking-[0.6px] text-muted">{m.kind === "quiz" ? "Teste interativo" : m.kind === "guide" ? "Guia por WhatsApp" : "Ebook"}</span><h2 className="h2">{m.title}</h2></div>
              <span className={`chip ${m.active ? "bg-good-soft text-[#1E6B30]" : "bg-[#F2F2F5] text-muted"}`}>{m.active ? "Publicado" : "Pausado"}</span>
            </div>
            {slug && (
              <div className="flex flex-wrap items-center gap-4">
                <CopyLink url={url} />
                {qrs.get(m.id) && <details className="text-sm"><summary className="cursor-pointer font-medium text-muted">QR code</summary>
                  <div className="mt-2 flex items-end gap-3"><div className="h-36 w-36" dangerouslySetInnerHTML={{ __html: qrs.get(m.id)! }} />
                    <a download={`qr-${m.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qrs.get(m.id)!)}`} className="text-sm font-medium text-accent-ink">Descarregar</a></div></details>}
              </div>
            )}
            <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
              {[["Visitas", String(m.views), ""], ["Leads", String(s.leads), pct(s.leads, m.views)], ["Reuniões", String(s.meetings), pct(s.meetings, s.leads)], ["Clientes", String(s.wonN), pct(s.wonN, s.meetings)], ["Faturado", eur(s.wonV), ""]].map(([l, v, p]) => (
                <div key={l} className="rounded-2xl bg-[#F7F7F9] px-3 py-2.5"><div className="text-xs text-muted">{l}</div><div className="text-[20px] font-semibold tabular-nums">{v}</div>{p && <div className="text-[11px] text-muted">conversão {p}</div>}</div>
              ))}
            </div>
            {write && m.kind === "guide" && <GuideUpload magnetId={m.id} orgId={ctx.org.id} slug={m.slug} current={m.offer.guide_url || undefined} />}
            {m.kind === "quiz" && s.leads > 0 && (
              <p className="text-sm text-ink-2">Pontuação média <strong className="font-semibold">{s.avg}/100</strong> · Área mais fraca: {s.weak.map(([w, n]) => `${w} (${n})`).join(" · ")}</p>
            )}
            {s.rs.length > 0 && (
              <details><summary className="cursor-pointer text-sm font-medium text-accent-ink">Últimas leads ({s.rs.length})</summary>
                <div className="mt-2 flex flex-col">{s.rs.slice(0, 25).map((r) => { const c = r.contact_id ? cName.get(r.contact_id) : undefined; return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F2] py-2 text-sm last:border-0">
                    {c ? <Link href={`/crm/contactos/${c.id}`} className="font-medium hover:text-accent-ink">{c.name}</Link> : <span>—</span>}
                    <span className="text-xs text-muted">{r.total != null ? `${r.total}/100 · ${r.weakest} · ` : ""}{dateShort(r.created_at)}{c ? ` · pontuação ${c.score}` : ""}</span>
                    {m.kind === "quiz" && <a href={`/r/${r.id}`} target="_blank" className="text-xs text-accent-ink">Ver resultado</a>}
                  </div>); })}</div>
              </details>
            )}
            {write && (
              <details><summary className="cursor-pointer text-sm font-medium text-muted">Editar textos, email e sequência</summary>
                <form action={saveMagnet} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="meeting_url" value={m.offer.meeting_url ?? ""} />
                  <label className="flex flex-col gap-1.5"><span className="label">Título</span><input name="title" defaultValue={m.title} className="input" /></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Subtítulo</span><textarea name="subtitle" rows={2} defaultValue={m.subtitle ?? ""} className="input py-2.5" /></label>
                  <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                    <label className="flex flex-col gap-1.5"><span className="label">Texto do botão da reunião</span><input name="meeting_label" defaultValue={m.offer.meeting_label ?? ""} className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Sequência de nutrição</span><select name="sequence_id" defaultValue={m.sequence_id ?? ""} className="input"><option value="">Nenhuma</option>{(seqs ?? []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
                  </div>
                  <label className="flex flex-col gap-1.5"><span className="label">Assunto do email com o resultado</span><input name="email_subject" defaultValue={m.offer.email_subject ?? ""} className="input" /></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Email com o resultado (fica na fila para aprovares)</span><textarea name="email_body" rows={10} defaultValue={m.offer.email_body ?? ""} className="input py-2.5 text-sm leading-relaxed" /></label>
                  <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                    <label className="flex flex-col gap-1.5"><span className="label">O teu WhatsApp (recebe os pedidos)</span><input name="whatsapp" defaultValue={m.offer.whatsapp ?? ""} placeholder="351912345678" className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Palavra-chave na mensagem</span><input name="keyword" defaultValue={m.offer.keyword ?? ""} placeholder="GUIA" className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Ou link do PDF (Drive, Dropbox…)</span><input name="guide_url" type="url" defaultValue={m.offer.guide_url ?? ""} placeholder="https://drive.google.com/…" className="input" /></label>
                  </div>
                  <label className="flex flex-col gap-1.5"><span className="label">Primeira mensagem de WhatsApp (fica na fila para aprovares)</span><textarea name="whatsapp_body" rows={5} defaultValue={m.offer.whatsapp_body ?? ""} className="input py-2.5 text-sm leading-relaxed" /></label>
                  <p className="text-xs text-muted">Variáveis: {"{{primeiro_nome}} {{area}} {{pontuacao}} {{area_fraca}} {{link_guia}} {{link_resultado}} {{link_reuniao}} {{meu_nome}}"}</p>
                  {(m.kind === "guide" || "landing" in (m.config as object)) && (
                    <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Textos da página (avançado)</summary>
                      <p className="mt-2 text-xs text-muted">Todos os textos da página. Use **negrito** e *dourado*. Mantém as aspas e vírgulas — se houver um erro de formatação, nada é alterado.</p>
                      <textarea name="config_json" rows={18} defaultValue={JSON.stringify(m.config, null, 2)} className="input mt-2 py-2.5 font-mono text-xs leading-relaxed" /></details>
                  )}
                  {m.kind === "ebook" && <label className="flex flex-col gap-1.5"><span className="label">Conteúdo do ebook (## título, - lista, &gt; destaque, **negrito**)</span><textarea name="content" rows={16} defaultValue={m.config.content ?? ""} className="input py-2.5 font-mono text-xs leading-relaxed" /></label>}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4" /> Publicado</label>
                  <button className="btn self-start">Guardar</button>
                </form>
              </details>
            )}
          </article>
        );
      })}
      {(mags ?? []).length > 0 && <p className="text-sm text-muted">Onde usar: na bio do Instagram e do LinkedIn, na assinatura de email, no fim de cada publicação («faz o diagnóstico gratuito»), em apresentações e eventos (gera um QR code com o link).</p>}
    </>
  );
}
